import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { SaveInput } from './schema';
import { NotFound, createCouple, deleteCouple, updateCouple } from './save';

// Audit rows carry a foreign key to account, so these must be real accounts
// from the seed — a placeholder id violates audit_account_id_fkey.
let admin: User;
let regionVII: User;
let viewer: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
  viewer = await byEmail('moderator@example.pl');
});

const created: bigint[] = [];

afterEach(async () => {
  if (created.length) {
    await prisma.retreat.deleteMany({ where: { coupleId: { in: created } } });
    await prisma.couple.deleteMany({ where: { id: { in: created } } });
    await prisma.audit.deleteMany({ where: { coupleId: { in: created } } });
    created.length = 0;
  }
});

function input(overrides: Partial<SaveInput['couple']> = {}): SaveInput {
  return {
    couple: {
      wifeName: 'Testowa', husbandName: 'Testowy', surname: 'Testowi',
      email: null, phone: null, regionId: 7,
      circleId: null, newCircle: null, parishId: null, newParish: null,
      children: null, notes: null, ...overrides,
    },
    retreats: [],
  };
}

async function add(u: User, data: SaveInput = input()) {
  const id = await createCouple(u, data);
  created.push(id);
  return id;
}

describe('createCouple', () => {
  it('creates the couple and one audit entry, in one transaction', async () => {
    const before = await prisma.audit.count();
    const id = await add(admin);

    expect(await prisma.couple.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.audit.count()).toBe(before + 1);
    expect((await prisma.audit.findFirstOrThrow({ where: { coupleId: id } })).kind).toBe('create');
  });

  it('stores retreat entries alongside the couple', async () => {
    const id = await add(admin, {
      ...input(),
      retreats: [
        { kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: null },
        { kind: 'INNE', year: 2019, place: null, name: 'Ewangelizacyjne' },
      ],
    });
    expect(await prisma.retreat.count({ where: { coupleId: id } })).toBe(2);
  });

  it('lets a region account create only inside its own region', async () => {
    await expect(createCouple(regionVII, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('never lets the viewer create', async () => {
    await expect(createCouple(viewer, input())).rejects.toThrow(Forbidden);
  });
});

describe('updateCouple', () => {
  it('records an edit in the audit trail', async () => {
    const id = await add(admin);
    await updateCouple(admin, id, input({ surname: 'Zmienieni' }));

    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).surname).toBe('Zmienieni');
    expect(await prisma.audit.count({ where: { coupleId: id, kind: 'edit' } })).toBe(1);
  });

  it('replaces the retreat entries rather than appending to them', async () => {
    const id = await add(admin, {
      ...input(),
      retreats: [{ kind: 'ONZ_I', year: 2014, place: null, name: null }],
    });
    await updateCouple(admin, id, {
      ...input(),
      retreats: [{ kind: 'ONZ_II', year: 2016, place: null, name: null }],
    });

    const entries = await prisma.retreat.findMany({ where: { coupleId: id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('ONZ_II');
  });

  // The checklist requires the region field to be locked for a region account
  // both in the interface and on the server.
  it('refuses to move a couple out of a region account own region', async () => {
    const id = await add(admin);
    await expect(updateCouple(regionVII, id, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('lets a region account edit its own couple without touching the region', async () => {
    const id = await add(admin);
    await updateCouple(regionVII, id, input({ surname: 'Poprawieni' }));
    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).surname).toBe('Poprawieni');
  });

  it('refuses a couple from another region', async () => {
    const id = await add(admin, input({ regionId: 3 }));
    await expect(updateCouple(regionVII, id, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('throws NotFound for an id that does not exist', async () => {
    await expect(updateCouple(admin, 999_999_999n, input())).rejects.toThrow(NotFound);
  });
});

describe('deleteCouple', () => {
  it('soft-deletes so the record survives for recovery', async () => {
    const id = await add(admin);
    await deleteCouple(admin, id);

    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await prisma.audit.count({ where: { coupleId: id, kind: 'delete' } })).toBe(1);
  });

  it('has nothing left to act on when called twice', async () => {
    const id = await add(admin);
    await deleteCouple(admin, id);
    await expect(deleteCouple(admin, id)).rejects.toThrow(NotFound);
  });

  it('never lets the viewer delete', async () => {
    const id = await add(admin);
    await expect(deleteCouple(viewer, id)).rejects.toThrow(Forbidden);
  });
});
