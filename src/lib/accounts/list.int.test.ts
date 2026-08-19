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
  // The admin is listed too: the couple responsible for the community changes
  // like any other, so its name and address have to be reachable from here.
  it('lists every account, admin included', async () => {
    const rows = await accountRows(admin);
    // One per region, plus admin, moderator and the technical account.
    expect(rows).toHaveLength(REGION_COUNT + 3);
    expect(rows.filter((r) => r.role === 'superadmin')).toHaveLength(1);
    expect(rows.filter((r) => r.role === 'admin')).toHaveLength(1);
    expect(rows.filter((r) => r.role === 'viewer')).toHaveLength(1);
  });

  it('orders the technical account first, then admin, regions, moderator last', async () => {
    const rows = await accountRows(admin);
    expect(rows[0]!.role).toBe('superadmin');
    expect(rows[1]!.role).toBe('admin');
    expect(rows[2]!.regionId).toBe(1);
    expect(rows.at(-1)!.role).toBe('viewer');
  });

  it('marks the technical account beyond the admin reach', async () => {
    const rows = await accountRows(admin);
    const caretaker = rows.find((r) => r.role === 'superadmin')!;
    expect(caretaker.manageable).toBe(false);
    expect(caretaker.disableable).toBe(false);
    // The admin's own row stays editable but cannot be switched off.
    const self = rows.find((r) => r.role === 'admin')!;
    expect(self.manageable).toBe(true);
    expect(self.disableable).toBe(false);
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
