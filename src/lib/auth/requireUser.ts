import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from './permissions';
import { SESSION_DAYS, deleteSession, userFromToken } from './session';

export const SESSION_COOKIE = 'kartoteka_sesja';

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(token);
}

/**
 * Every server action and route handler must call this before touching
 * Prisma. The protected layout calling it is not enough: server actions are
 * public POST endpoints and are not covered by any layout.
 */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}
