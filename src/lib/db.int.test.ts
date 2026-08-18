import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('schema', () => {
  it('enforces the region id range', async () => {
    await expect(
      prisma.rejon.create({ data: { id: 13, numerRzym: 'XIII' } }),
    ).rejects.toThrow();
  });

  it('requires a name for INNE retreat entries', async () => {
    const rejon = await prisma.rejon.upsert({
      where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' },
    });
    const para = await prisma.para.create({
      data: { imieZony: 'Anna', imieMeza: 'Piotr', nazwisko: 'Testowi', rejonId: rejon.id },
    });
    await expect(
      prisma.rekolekcje.create({
        data: { paraId: para.id, rodzaj: 'INNE', rok: 2020 },
      }),
    ).rejects.toThrow();
    await prisma.para.delete({ where: { id: para.id } });
  });

  it('sorts surnames using Polish collation', async () => {
    const rejon = await prisma.rejon.upsert({
      where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' },
    });
    const nazwiska = ['Zawadzcy', 'Łabędzcy', 'Mazurowie'];
    for (const nazwisko of nazwiska) {
      await prisma.para.create({
        data: { imieZony: 'A', imieMeza: 'B', nazwisko, rejonId: rejon.id },
      });
    }
    const posortowane = await prisma.para.findMany({
      where: { nazwisko: { in: nazwiska } },
      orderBy: { nazwisko: 'asc' },
      select: { nazwisko: true },
    });
    // Ł belongs between L and M, not after Z.
    expect(posortowane.map((p) => p.nazwisko)).toEqual([
      'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
    await prisma.para.deleteMany({ where: { nazwisko: { in: nazwiska } } });
  });
});
