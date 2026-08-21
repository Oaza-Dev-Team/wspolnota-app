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
    // One per region, plus admin, moderator, the technical account and the
    // helper the seed gives region I.
    expect(rows).toHaveLength(REGION_COUNT + 4);
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
    // Load-bearing reads the caretaker's own `active` status, and freshly
    // seeded it is still pending — nobody has registered a key for it yet.
    // Activate it here, exactly as registering a passkey would, to exercise
    // the "only active caretaker" case this test is actually about; put it
    // back after so the shared database is left as it was found.
    const caretakerId = (await prisma.account.findUniqueOrThrow({
      where: { email: 'superadmin@example.pl' },
    })).id;
    await prisma.account.update({ where: { id: caretakerId }, data: { status: 'active' } });

    try {
      const rows = await accountRows(admin);
      const caretaker = rows.find((r) => r.role === 'superadmin')!;
      expect(caretaker.manageable).toBe(false);
      // Load-bearing as well, being the only active one: nothing may switch off
      // or delete the last way back into the installation.
      expect(caretaker.loadBearing).toBe(true);
      // The admin's own row stays editable, but it is what the admin signs in
      // through, so it can be neither switched off nor deleted.
      const self = rows.find((r) => r.role === 'admin')!;
      expect(self.manageable).toBe(true);
      expect(self.loadBearing).toBe(true);
    } finally {
      await prisma.account.update({ where: { id: caretakerId }, data: { status: 'pending' } });
    }
  });

  it('puts the responsible couple ahead of the helpers in its region', async () => {
    const rows = await accountRows(admin);
    const first = rows.filter((r) => r.regionId === 1);
    expect(first).toHaveLength(2);
    expect(first[0]!.regionLead).toBe(true);
    expect(first[1]!.regionLead).toBe(false);
  });

  it('carries the couple count for each region', async () => {
    const rows = await accountRows(admin);
    const seventh = rows.find((r) => r.regionId === 7)!;
    expect(seventh.couples).toBeGreaterThan(0);
    expect(seventh.roman).toBe('VII');
  });

  it('starts every seeded account pending — nobody has registered a key yet', async () => {
    const rows = await accountRows(admin);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('refuses anyone but admin', async () => {
    await expect(accountRows(regionVII)).rejects.toThrow(Forbidden);
  });
});
