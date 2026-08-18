import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import { DEGREES } from '@/lib/domain/retreats';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed data', () => {
  it('creates one region per Roman numeral and 300 couples', async () => {
    expect(await prisma.region.count()).toBe(REGION_COUNT);
    expect(await prisma.couple.count()).toBe(300);
  });

  it('creates an account per region plus admin and moderator', async () => {
    expect(await prisma.account.count()).toBe(REGION_COUNT + 2);
    expect(await prisma.account.count({ where: { status: 'pending' } })).toBe(1);
  });

  it('leaves the pending account without a password hash', async () => {
    const pending = await prisma.account.findFirstOrThrow({ where: { status: 'pending' } });
    expect(pending.passwordHash).toBeNull();
  });

  // The acceptance checklist requires all 17 formation filter options to
  // return a non-empty result on seed data.
  it.each([...DEGREES])('has couples with and without %s', async (degree) => {
    const has = await prisma.couple.count({ where: { retreats: { some: { kind: degree } } } });
    const without = await prisma.couple.count({ where: { retreats: { none: { kind: degree } } } });
    expect(has, `nobody has ${degree}`).toBeGreaterThan(0);
    expect(without, `everybody has ${degree}`).toBeGreaterThan(0);
  });

  it('has couples with INNE entries and couples with no entries at all', async () => {
    expect(await prisma.couple.count({ where: { retreats: { some: { kind: 'INNE' } } } }))
      .toBeGreaterThan(0);
    expect(await prisma.couple.count({ where: { retreats: { none: {} } } }))
      .toBeGreaterThan(0);
  });

  it('has couples whose parish differs from their circle parish', async () => {
    expect(await prisma.couple.count({ where: { parishId: { not: null } } }))
      .toBeGreaterThan(0);
  });
});
