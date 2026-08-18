import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

// Rows created by these tests, cleaned up in afterEach so a failing assertion
// cannot leak them into the seed-data counts. Deleting by surname would not
// work: the seed dictionary contains names like "Mazurowie" too.
const utworzonePary: bigint[] = [];
const utworzoneKonta: bigint[] = [];

afterEach(async () => {
  if (utworzonePary.length) {
    await prisma.para.deleteMany({ where: { id: { in: utworzonePary } } });
    utworzonePary.length = 0;
  }
  if (utworzoneKonta.length) {
    await prisma.konto.deleteMany({ where: { id: { in: utworzoneKonta } } });
    utworzoneKonta.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dodajPare(nazwisko: string, rejonId = 1) {
  await prisma.rejon.upsert({
    where: { id: rejonId }, update: {},
    create: { id: rejonId, numerRzym: rejonId === 1 ? 'I' : 'VII' },
  });
  const para = await prisma.para.create({
    data: { imieZony: 'Anna', imieMeza: 'Piotr', nazwisko, rejonId },
  });
  utworzonePary.push(para.id);
  return para;
}

describe('schema', () => {
  it('enforces the region id range', async () => {
    await expect(
      // 12 is the first value outside the range: the community has eleven regions.
      prisma.rejon.create({ data: { id: 12, numerRzym: 'XII' } }),
    ).rejects.toThrow();
  });

  it('requires a name for INNE retreat entries', async () => {
    const para = await dodajPare('Testowi');
    await expect(
      prisma.rekolekcje.create({
        data: { paraId: para.id, rodzaj: 'INNE', rok: 2020 },
      }),
    ).rejects.toThrow();
  });

  it('sorts surnames using Polish collation', async () => {
    const pary = [];
    for (const nazwisko of ['Zawadzcy', 'Łabędzcy', 'Mazurowie', 'Lisowscy']) {
      pary.push(await dodajPare(nazwisko));
    }

    // Restricted to the rows this test created: the seed dictionary contains
    // some of these surnames, so filtering by name would pull in its couples.
    const posortowane = await prisma.para.findMany({
      where: { id: { in: pary.map((p) => p.id) } },
      orderBy: { nazwisko: 'asc' },
      select: { nazwisko: true },
    });

    // Ł belongs between L and M, not after Z.
    expect(posortowane.map((p) => p.nazwisko)).toEqual([
      'Lisowscy', 'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
  });
});

describe('account constraints', () => {
  it('rejects an admin account bound to a region', async () => {
    await prisma.rejon.upsert({ where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' } });
    await expect(
      prisma.konto.create({
        data: { email: 'zly@example.pl', nazwa: 'Zły Admin', rola: 'admin', rejonId: 1 },
      }),
    ).rejects.toThrow();
  });

  it('rejects a region account without a region', async () => {
    await expect(
      prisma.konto.create({
        data: { email: 'zly2@example.pl', nazwa: 'Zła Para', rola: 'rejon' },
      }),
    ).rejects.toThrow();
  });

  it('accepts a correctly shaped region account', async () => {
    await prisma.rejon.upsert({ where: { id: 7 }, update: {}, create: { id: 7, numerRzym: 'VII' } });
    const konto = await prisma.konto.create({
      data: { email: 'dobry@example.pl', nazwa: 'Anna i Marek Sowa', rola: 'rejon', rejonId: 7 },
    });
    utworzoneKonta.push(konto.id);
    expect(konto.status).toBe('oczekuje');
  });
});
