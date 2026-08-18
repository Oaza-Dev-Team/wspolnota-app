'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sprawdzHaslo, zahashuj } from '@/lib/auth/hasla';
import { czyPrzekroczonoLimit, wyczyscProby, zapiszProbe } from '@/lib/auth/limity';
import { ustawCookieSesji } from '@/lib/auth/requireUser';
import { utworzSesje } from '@/lib/auth/sesja';
import { prisma } from '@/lib/db';

export type StanLogowania = { blad?: string };

const schemat = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Podaj poprawny adres e-mail')),
  haslo: z.string().min(1, 'Podaj hasło'),
});

// One message for every failure mode, so the form cannot be used to discover
// which e-mail addresses have accounts.
const BLAD_OGOLNY = 'Nieprawidłowy e-mail lub hasło.';

// A real argon2id hash of a random string, computed once per process. Verifying
// against it costs the same as verifying a genuine password, so response time
// does not reveal whether an address has an account.
let haszAtrapa: string | null = null;
async function atrapaHasla(): Promise<string> {
  haszAtrapa ??= await zahashuj(randomBytes(32).toString('hex'));
  return haszAtrapa;
}

export async function zaloguj(_stan: StanLogowania, formData: FormData): Promise<StanLogowania> {
  const wynik = schemat.safeParse({
    email: formData.get('email'),
    haslo: formData.get('haslo'),
  });
  if (!wynik.success) {
    return { blad: wynik.error.issues[0]?.message ?? BLAD_OGOLNY };
  }

  const { email, haslo } = wynik.data;
  const klucz = `email:${email}`;

  if (await czyPrzekroczonoLimit(klucz)) {
    return { blad: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' };
  }

  const konto = await prisma.konto.findUnique({ where: { email } });

  const hasz = konto?.hashHasla ?? (await atrapaHasla());
  const poprawne = await sprawdzHaslo(hasz, haslo);

  if (!konto || !poprawne || konto.status !== 'aktywne') {
    await zapiszProbe(klucz);
    return { blad: BLAD_OGOLNY };
  }

  await wyczyscProby(klucz);
  await prisma.konto.update({
    where: { id: konto.id },
    data: { ostatnieLogowanie: new Date() },
  });

  const token = await utworzSesje(konto.id);
  await ustawCookieSesji(token);
  redirect('/pary');
}
