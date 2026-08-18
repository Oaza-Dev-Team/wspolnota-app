import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import { accountRows } from './list';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('accountRows', () => {
  it('lists every region account plus the moderator, and never the admin', async () => {
    const rows = await accountRows(admin);
    expect(rows).toHaveLength(REGION_COUNT + 1);
    expect(rows.some((r) => r.role === 'admin')).toBe(false);
    expect(rows.filter((r) => r.role === 'viewer')).toHaveLength(1);
  });

  it('orders regions first, moderator last', async () => {
    const rows = await accountRows(admin);
    expect(rows[0]!.regionId).toBe(1);
    expect(rows.at(-1)!.role).toBe('viewer');
  });

  it('carries the couple count for each region', async () => {
    const rows = await accountRows(admin);
    const seventh = rows.find((r) => r.regionId === 7)!;
    expect(seventh.couples).toBeGreaterThan(0);
    expect(seventh.roman).toBe('VII');
  });

  it('marks the unstaffed region as pending', async () => {
    const rows = await accountRows(admin);
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('refuses anyone but admin', async () => {
    await expect(accountRows(regionVII)).rejects.toThrow(Forbidden);
  });
});
