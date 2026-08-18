import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { AUDIT_PAGE_SIZE, auditPage } from './list';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');

  // Enough rows that the second page is guaranteed to exist regardless of what
  // the seed and the other suites have left behind.
  await prisma.audit.createMany({
    data: Array.from({ length: AUDIT_PAGE_SIZE + 5 }, (_, i) => ({
      kind: 'edit' as const,
      description: `Wpis testowy ${i}`,
      accountId: admin.id,
    })),
  });
});

afterAll(async () => {
  await prisma.audit.deleteMany({ where: { description: { startsWith: 'Wpis testowy' } } });
  await prisma.$disconnect();
});

describe('auditPage', () => {
  it('returns newest first', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows.length).toBeGreaterThan(0);
    const ids = rows.map((r) => BigInt(r.id));
    expect([...ids].sort((a, b) => (b > a ? 1 : -1))).toEqual(ids);
  });

  it('pages fifty at a time', async () => {
    const first = await auditPage(admin, 1);
    expect(first.rows).toHaveLength(AUDIT_PAGE_SIZE);

    const second = await auditPage(admin, 2);
    const seen = new Set(first.rows.map((r) => r.id));
    expect(second.rows.some((r) => seen.has(r.id))).toBe(false);
  });

  it('counts every entry, not just the page', async () => {
    const { rows, total } = await auditPage(admin, 1);
    expect(total).toBeGreaterThan(rows.length);
  });

  it('names the author, or says the account is gone', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows.every((r) => r.author.length > 0)).toBe(true);
  });

  it('formats the timestamp for reading', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows[0]!.at).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });

  it('treats a nonsensical page number as the first', async () => {
    const first = await auditPage(admin, 1);
    expect((await auditPage(admin, 0)).rows[0]!.id).toBe(first.rows[0]!.id);
  });

  it('refuses anyone but admin', async () => {
    await expect(auditPage(regionVII, 1)).rejects.toThrow(Forbidden);
  });
});
