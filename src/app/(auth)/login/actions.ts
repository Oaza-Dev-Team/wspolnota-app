'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { clearAttempts, isRateLimited, recordAttempt } from '@/lib/auth/rateLimit';
import { setSessionCookie } from '@/lib/auth/requireUser';
import { createSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

export type LoginState = { error?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Podaj poprawny adres e-mail')),
  password: z.string().min(1, 'Podaj hasło'),
});

// One message for every failure mode, so the form cannot be used to discover
// which e-mail addresses have accounts.
const GENERIC_ERROR = 'Nieprawidłowy e-mail lub hasło.';

// A real argon2id hash of a random string, computed once per process. Verifying
// against it costs the same as verifying a genuine password, so response time
// does not reveal whether an address has an account.
let decoyHash: string | null = null;
async function decoy(): Promise<string> {
  decoyHash ??= await hashPassword(randomBytes(32).toString('hex'));
  return decoyHash;
}

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const { email, password } = parsed.data;
  const key = `email:${email}`;

  if (await isRateLimited(key)) {
    return { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' };
  }

  const account = await prisma.account.findUnique({ where: { email } });

  const stored = account?.passwordHash ?? (await decoy());
  const correct = await verifyPassword(stored, password);

  if (!account || !correct || account.status !== 'active') {
    await recordAttempt(key);
    return { error: GENERIC_ERROR };
  }

  await clearAttempts(key);
  await prisma.account.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await createSession(account.id);
  await setSessionCookie(token);
  redirect('/couples');
}
