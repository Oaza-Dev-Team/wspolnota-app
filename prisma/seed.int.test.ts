import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { STOPNIE } from '@/lib/domena/rekolekcje';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed data', () => {
  it('creates one region per Roman numeral and 300 couples', async () => {
    expect(await prisma.rejon.count()).toBe(LICZBA_REJONOW);
    expect(await prisma.para.count()).toBe(300);
  });

  it('creates an account per region plus admin and moderator', async () => {
    expect(await prisma.konto.count()).toBe(LICZBA_REJONOW + 2);
    expect(await prisma.konto.count({ where: { status: 'oczekuje' } })).toBe(1);
  });

  it('leaves the awaiting account without a password hash', async () => {
    const oczekujace = await prisma.konto.findFirstOrThrow({ where: { status: 'oczekuje' } });
    expect(oczekujace.hashHasla).toBeNull();
  });

  // The acceptance checklist requires all 17 formation filter options to
  // return a non-empty result on seed data.
  it.each([...STOPNIE])('has couples with and without %s', async (stopien) => {
    const maja = await prisma.para.count({
      where: { rekolekcje: { some: { rodzaj: stopien } } },
    });
    const niemaja = await prisma.para.count({
      where: { rekolekcje: { none: { rodzaj: stopien } } },
    });
    expect(maja, `nobody has ${stopien}`).toBeGreaterThan(0);
    expect(niemaja, `everybody has ${stopien}`).toBeGreaterThan(0);
  });

  it('has couples with INNE entries and couples with no entries at all', async () => {
    expect(await prisma.para.count({
      where: { rekolekcje: { some: { rodzaj: 'INNE' } } },
    })).toBeGreaterThan(0);
    expect(await prisma.para.count({
      where: { rekolekcje: { none: {} } },
    })).toBeGreaterThan(0);
  });

  it('has couples whose parish differs from their circle parish', async () => {
    expect(await prisma.para.count({ where: { parafiaId: { not: null } } }))
      .toBeGreaterThan(0);
  });
});
