import { mozeZarzadzacKontami, zakresListy } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { prisma } from '@/lib/db';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';
import type { KluczWidoku } from '@/lib/nawigacja';
import { Powloka } from './Powloka';

export default async function LayoutAplikacji({ children }: { children: React.ReactNode }) {
  const u = await requireUser();

  const [konto, liczbaPar] = await Promise.all([
    prisma.konto.findUniqueOrThrow({ where: { id: u.id }, select: { nazwa: true } }),
    // Counted within the user's own scope, so a region account sees the size
    // of its region rather than of the community.
    prisma.para.count({ where: zakresListy(u) }),
  ]);

  const liczniki: Partial<Record<KluczWidoku, number>> = { pary: liczbaPar };
  if (u.rola !== 'rejon') liczniki.rejony = LICZBA_REJONOW;
  if (mozeZarzadzacKontami(u)) {
    liczniki.konta = await prisma.konto.count({ where: { rola: { not: 'admin' } } });
  }

  return (
    <Powloka uzytkownik={u} nazwaKonta={konto.nazwa} aktywny="pary" liczniki={liczniki}>
      {children}
    </Powloka>
  );
}
