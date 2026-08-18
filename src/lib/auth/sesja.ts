import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Uzytkownik } from './permissions';

export const CZAS_ZYCIA_DNI = 30;

function hashTokena(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token — the only moment it exists outside the cookie. */
export async function utworzSesje(kontoId: bigint): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const wygasa = new Date(Date.now() + CZAS_ZYCIA_DNI * 24 * 60 * 60 * 1000);
  await prisma.sesja.create({
    data: { kontoId, tokenHash: hashTokena(token), wygasa },
  });
  return token;
}

/**
 * Resolves a session token, re-checking account status on every call. A JWT
 * could not do this: a disabled account would keep working until its token
 * expired, which the acceptance checklist forbids.
 */
export async function pobierzUzytkownikaZTokena(token: string): Promise<Uzytkownik | null> {
  const sesja = await prisma.sesja.findUnique({
    where: { tokenHash: hashTokena(token) },
    include: { konto: true },
  });

  if (!sesja) return null;
  if (sesja.wygasa <= new Date()) return null;
  if (sesja.konto.status !== 'aktywne') return null;

  return {
    id: sesja.konto.id,
    rola: sesja.konto.rola,
    rejonId: sesja.konto.rejonId,
  };
}

export async function usunSesje(token: string): Promise<void> {
  await prisma.sesja.deleteMany({ where: { tokenHash: hashTokena(token) } });
}

/** Called whenever an account is disabled, so access ends immediately. */
export async function usunSesjeKonta(kontoId: bigint): Promise<void> {
  await prisma.sesja.deleteMany({ where: { kontoId } });
}

export async function usunWygasleSesje(): Promise<number> {
  const { count } = await prisma.sesja.deleteMany({
    where: { wygasa: { lte: new Date() } },
  });
  return count;
}
