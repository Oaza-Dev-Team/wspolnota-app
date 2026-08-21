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
    // Live couples only. A bare count() would include rows the e2e suite
    // soft-deleted, which no user-facing count ever shows.
    expect(await prisma.couple.count({ where: { deletedAt: null } })).toBe(300);
  });

  it('creates an account per region plus admin, moderator, caretaker and a helper', async () => {
    const total = REGION_COUNT + 4;
    expect(await prisma.account.count()).toBe(total);
    // Exactly one responsible couple per region; the extra one is a helper.
    expect(await prisma.account.count({ where: { regionLead: true } })).toBe(REGION_COUNT);
    // Nobody has registered a key yet — there is no passkey to fake here —
    // so every seeded account starts pending, the last region's included.
    expect(await prisma.account.count({ where: { status: 'pending' } })).toBe(total);
  });

  it('gives every account a live invitation, since none has a key yet', async () => {
    const accounts = await prisma.account.findMany({
      select: { inviteTokenHash: true, inviteExpiresAt: true },
    });
    expect(accounts.every((a) => a.inviteTokenHash !== null)).toBe(true);
    expect(accounts.every((a) => a.inviteExpiresAt !== null && a.inviteExpiresAt > new Date()))
      .toBe(true);
    // Every token is distinct: two accounts sharing a digest would let one
    // invitation resolve to the other's account.
    const hashes = new Set(accounts.map((a) => a.inviteTokenHash));
    expect(hashes.size).toBe(accounts.length);
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
