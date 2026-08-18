import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import { regionStats } from './stats';

let admin: User;
let viewer: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  viewer = await byEmail('moderator@example.pl');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('regionStats', () => {
  it('returns one entry per region, in order', async () => {
    const stats = await regionStats(admin);
    expect(stats).toHaveLength(REGION_COUNT);
    expect(stats.map((s) => s.id)).toEqual(
      Array.from({ length: REGION_COUNT }, (_, i) => i + 1),
    );
    expect(stats[6]!.roman).toBe('VII');
  });

  it('counts couples, circles and parishes per region', async () => {
    const stats = await regionStats(admin);
    for (const s of stats) {
      expect(s.couples, `region ${s.id}`).toBeGreaterThan(0);
      expect(s.circles, `region ${s.id}`).toBeGreaterThan(0);
      expect(s.parishes, `region ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('sums the couple counts to the whole community', async () => {
    const stats = await regionStats(admin);
    expect(stats.reduce((n, s) => n + s.couples, 0)).toBe(300);
  });

  it('excludes soft-deleted couples from the counts', async () => {
    const before = await regionStats(admin);
    const couple = await prisma.couple.findFirstOrThrow({
      where: { regionId: 7, deletedAt: null },
    });
    await prisma.couple.update({ where: { id: couple.id }, data: { deletedAt: new Date() } });

    try {
      const after = await regionStats(admin);
      expect(after[6]!.couples).toBe(before[6]!.couples - 1);
    } finally {
      await prisma.couple.update({ where: { id: couple.id }, data: { deletedAt: null } });
    }
  });

  it('names the responsible couple, or leaves it empty when unstaffed', async () => {
    const stats = await regionStats(admin);
    // The seed leaves the last region without an active account.
    expect(stats.at(-1)!.leadName).toBeNull();
    expect(stats[0]!.leadName).not.toBeNull();
  });

  it('gives the viewer the same figures as admin', async () => {
    expect(await regionStats(viewer)).toEqual(await regionStats(admin));
  });
});
