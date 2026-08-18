import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

// Rows created by these tests, cleaned up in afterEach so a failing assertion
// cannot leak them into the seed-data counts. Deleting by surname would not
// work: the seed dictionary contains names like "Mazurowie" too.
const createdCouples: bigint[] = [];
const createdAccounts: bigint[] = [];

afterEach(async () => {
  if (createdCouples.length) {
    await prisma.couple.deleteMany({ where: { id: { in: createdCouples } } });
    createdCouples.length = 0;
  }
  if (createdAccounts.length) {
    await prisma.account.deleteMany({ where: { id: { in: createdAccounts } } });
    createdAccounts.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function addCouple(surname: string, regionId = 1) {
  await prisma.region.upsert({
    where: { id: regionId },
    update: {},
    create: { id: regionId, romanNumeral: regionId === 1 ? 'I' : 'VII' },
  });
  const couple = await prisma.couple.create({
    data: { wifeName: 'Anna', husbandName: 'Piotr', surname, regionId },
  });
  createdCouples.push(couple.id);
  return couple;
}

describe('schema', () => {
  it('enforces the region id range', async () => {
    await expect(
      // 12 is the first value outside the range: the community has eleven regions.
      prisma.region.create({ data: { id: 12, romanNumeral: 'XII' } }),
    ).rejects.toThrow();
  });

  it('requires a name for INNE retreat entries', async () => {
    const couple = await addCouple('Testowi');
    await expect(
      prisma.retreat.create({ data: { coupleId: couple.id, kind: 'INNE', year: 2020 } }),
    ).rejects.toThrow();
  });

  it('sorts surnames using Polish collation', async () => {
    const couples = [];
    for (const surname of ['Zawadzcy', 'Łabędzcy', 'Mazurowie', 'Lisowscy']) {
      couples.push(await addCouple(surname));
    }

    // Restricted to the rows this test created: the seed dictionary contains
    // some of these surnames, so filtering by name would pull in its couples.
    const sorted = await prisma.couple.findMany({
      where: { id: { in: couples.map((c) => c.id) } },
      orderBy: { surname: 'asc' },
      select: { surname: true },
    });

    // Ł belongs between L and M, not after Z.
    expect(sorted.map((c) => c.surname)).toEqual([
      'Lisowscy', 'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
  });

  it('computes the search text without diacritics', async () => {
    const couple = await addCouple('Bagińscy');
    const stored = await prisma.couple.findUniqueOrThrow({
      where: { id: couple.id },
      select: { searchText: true },
    });
    expect(stored.searchText).toContain('baginscy');
  });
});

describe('account constraints', () => {
  it('rejects an admin account bound to a region', async () => {
    await prisma.region.upsert({ where: { id: 1 }, update: {}, create: { id: 1, romanNumeral: 'I' } });
    await expect(
      prisma.account.create({
        data: { email: 'bad@example.pl', name: 'Zły Admin', role: 'admin', regionId: 1 },
      }),
    ).rejects.toThrow();
  });

  it('rejects a region account without a region', async () => {
    await expect(
      prisma.account.create({
        data: { email: 'bad2@example.pl', name: 'Zła Para', role: 'region' },
      }),
    ).rejects.toThrow();
  });

  it('accepts a correctly shaped region account', async () => {
    await prisma.region.upsert({
      where: { id: 7 }, update: {}, create: { id: 7, romanNumeral: 'VII' },
    });
    const account = await prisma.account.create({
      data: { email: 'good@example.pl', name: 'Anna i Marek Sowa', role: 'region', regionId: 7 },
    });
    createdAccounts.push(account.id);
    expect(account.status).toBe('pending');
  });
});
