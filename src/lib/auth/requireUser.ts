import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Uzytkownik } from './permissions';
import { CZAS_ZYCIA_DNI, pobierzUzytkownikaZTokena, usunSesje } from './sesja';

export const NAZWA_COOKIE = 'kartoteka_sesja';

export async function ustawCookieSesji(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(NAZWA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CZAS_ZYCIA_DNI * 24 * 60 * 60,
  });
}

export async function usunCookieSesji(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAZWA_COOKIE)?.value;
  if (token) await usunSesje(token);
  jar.delete(NAZWA_COOKIE);
}

export async function pobierzUzytkownika(): Promise<Uzytkownik | null> {
  const token = (await cookies()).get(NAZWA_COOKIE)?.value;
  if (!token) return null;
  return pobierzUzytkownikaZTokena(token);
}

/**
 * Every server action and route handler must call this before touching
 * Prisma. The protected layout calling it is not enough: server actions are
 * public POST endpoints and are not covered by any layout.
 */
export async function requireUser(): Promise<Uzytkownik> {
  const u = await pobierzUzytkownika();
  if (!u) redirect('/logowanie');
  return u;
}
