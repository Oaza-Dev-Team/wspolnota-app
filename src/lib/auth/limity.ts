import { prisma } from '@/lib/db';

export const LIMIT_PROB = 10;
export const OKNO_MINUT = 15;

function poczatekOkna(): Date {
  return new Date(Date.now() - OKNO_MINUT * 60 * 1000);
}

export async function czyPrzekroczonoLimit(klucz: string): Promise<boolean> {
  const liczba = await prisma.probaLogowania.count({
    where: { klucz, kiedy: { gte: poczatekOkna() } },
  });
  return liczba >= LIMIT_PROB;
}

export async function zapiszProbe(klucz: string): Promise<void> {
  await prisma.probaLogowania.create({ data: { klucz } });
}

/**
 * Called after a successful login so a user who finally remembers their
 * password is not locked out by their own earlier mistakes.
 */
export async function wyczyscProby(klucz: string): Promise<void> {
  await prisma.probaLogowania.deleteMany({ where: { klucz } });
}
