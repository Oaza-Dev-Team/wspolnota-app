import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { NotFound } from './save';
import { purgeCouple } from './purge';

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

/** A couple of this test's own making, with a retreat and an audit trail. */
async function makeCouple(surname: string): Promise<bigint> {
  const couple = await prisma.couple.create({
    data: {
      surname,
      wifeName: 'Zofia',
      husbandName: 'Jan',
      regionId: 7,
      retreats: { create: [{ kind: 'ONZ_I', year: 2014, place: 'Krościenko' }] },
    },
  });
  await prisma.audit.create({
    data: {
      kind: 'edit',
      description: `Zmieniono dane pary ${surname}`,
      accountId: admin.id,
      coupleId: couple.id,
    },
  });
  return couple.id;
}

describe('purgeCouple', () => {
  it('removes the couple and its retreat entries', async () => {
    const id = await makeCouple('Kasowani1');

    await purgeCouple(admin, id);

    expect(await prisma.couple.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.retreat.count({ where: { coupleId: id } })).toBe(0);
  });

  // A register of accountability that can be erased along with the record is
  // not a register. The entries stay; they stop naming anyone.
  it('keeps the audit entries but strips them of the person', async () => {
    const id = await makeCouple('Kasowani2');
    const before = await prisma.audit.count({ where: { coupleId: id } });
    expect(before).toBeGreaterThan(0);

    await purgeCouple(admin, id);

    expect(await prisma.audit.count({ where: { coupleId: id } })).toBe(0);
    const anonymised = await prisma.audit.findMany({
      where: { description: { startsWith: 'Rekord usunięty na żądanie' } },
    });
    expect(anonymised.length).toBeGreaterThanOrEqual(before);
    expect(anonymised.every((a) => a.coupleId === null)).toBe(true);
    expect(anonymised.every((a) => !a.description.includes('Kasowani2'))).toBe(true);

    await prisma.audit.deleteMany({
      where: { description: { startsWith: 'Rekord usunięty na żądanie' } },
    });
  });

  it('records that the request was carried out', async () => {
    const id = await makeCouple('Kasowani3');

    await purgeCouple(admin, id);

    const entry = await prisma.audit.findFirst({
      where: { kind: 'delete', description: { contains: 'żądanie usunięcia danych' } },
      orderBy: { id: 'desc' },
    });
    expect(entry).not.toBeNull();
    // The confirmation must not reintroduce the name it just erased.
    expect(entry!.description).not.toContain('Kasowani3');
    expect(entry!.coupleId).toBeNull();

    await prisma.audit.deleteMany({
      where: { description: { startsWith: 'Rekord usunięty na żądanie' } },
    });
    await prisma.audit.deleteMany({
      where: { description: { contains: 'żądanie usunięcia danych' } },
    });
  });

  it('works on an already soft-deleted couple', async () => {
    const id = await makeCouple('Kasowani4');
    await prisma.couple.update({ where: { id }, data: { deletedAt: new Date() } });

    await purgeCouple(admin, id);

    expect(await prisma.couple.findUnique({ where: { id } })).toBeNull();
    await prisma.audit.deleteMany({
      where: { description: { startsWith: 'Rekord usunięty na żądanie' } },
    });
    await prisma.audit.deleteMany({
      where: { description: { contains: 'żądanie usunięcia danych' } },
    });
  });

  it('refuses anyone but admin, even in their own region', async () => {
    const id = await makeCouple('Kasowani5');

    await expect(purgeCouple(regionVII, id)).rejects.toThrow(Forbidden);
    expect(await prisma.couple.findUnique({ where: { id } })).not.toBeNull();

    await prisma.retreat.deleteMany({ where: { coupleId: id } });
    await prisma.audit.deleteMany({ where: { coupleId: id } });
    await prisma.couple.delete({ where: { id } });
  });

  it('refuses an id that does not exist', async () => {
    await expect(purgeCouple(admin, 999_999_999n)).rejects.toThrow(NotFound);
  });
});
