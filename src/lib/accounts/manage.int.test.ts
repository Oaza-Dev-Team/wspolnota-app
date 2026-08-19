import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User, canEdit, listScope } from '@/lib/auth/permissions';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, userFromToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { regionStats } from '@/lib/regions/stats';
import {
  AccountRegionError, EmailError, changeEmail, createAccount, createInvite,
  deleteAccount, handOverRegion, redeemInvite, renameAccount, setAccountStatus,
} from './manage';

const TARGET_NAME = 'Konto testowe zarządzania';
const TARGET_EMAIL = 'zarzadzanie.test@example.pl';

let admin: User;
let caretaker: User;
let regionVII: User;
let targetId: bigint;
let seededLeadId: bigint;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  caretaker = await byEmail('superadmin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
  // A throwaway account rather than a seeded one: redeeming an invite rewrites
  // the password, and a run interrupted halfway would leave a seeded account
  // unable to sign in for every later test.
  // handOverRegion only accepts the couple responsible for a region, and a
  // partial unique index allows one per region — so region V lends its slot
  // for the length of this file and gets it back in afterAll. Integration
  // tests run one file at a time (fileParallelism: false), so nothing else
  // reads region V while it is on loan.
  seededLeadId = (await prisma.account.findUniqueOrThrow({
    where: { email: 'rejon5@example.pl' },
  })).id;
  await prisma.account.update({ where: { id: seededLeadId }, data: { regionLead: false } });

  const target = await prisma.account.create({
    data: {
      email: TARGET_EMAIL,
      name: TARGET_NAME,
      role: 'region',
      regionId: 5,
      regionLead: true,
      status: 'active',
      passwordHash: null,
    },
  });
  targetId = target.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { accountId: targetId } });
  await prisma.audit.deleteMany({ where: { accountId: targetId } });
  await prisma.account.delete({ where: { id: targetId } });
  // Region V gets its responsible couple back; the slot is free again now
  // that the throwaway holding it is gone.
  await prisma.account.update({ where: { id: seededLeadId }, data: { regionLead: true } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.account.update({
    where: { id: targetId },
    data: {
      // The name is reset too: the rename tests change it, and later ones
      // assert against the original.
      name: TARGET_NAME,
      email: TARGET_EMAIL,
      status: 'active',
      passwordHash: null,
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
  // Narrowed to this test's own account: deleting every account-kind entry
  // would wipe genuine history that other suites and the app itself wrote.
  await prisma.audit.deleteMany({ where: { description: { contains: TARGET_NAME } } });
  await prisma.session.deleteMany({ where: { accountId: targetId } });
});

describe('setAccountStatus', () => {
  it('disables an account and records it', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('disabled');
    expect(
      await prisma.audit.count({
        where: { kind: 'account', description: { contains: TARGET_NAME } },
      }),
    ).toBe(1);
  });

  // The checklist requires a disabled account to lose access immediately.
  it('kills the live sessions of a disabled account', async () => {
    const token = await createSession(targetId);
    expect(await userFromToken(token)).not.toBeNull();

    await setAccountStatus(admin, targetId, 'disabled');
    expect(await userFromToken(token)).toBeNull();
    expect(await prisma.session.count({ where: { accountId: targetId } })).toBe(0);
  });

  it('re-enables an account', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    await setAccountStatus(admin, targetId, 'active');
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: targetId } })).status,
    ).toBe('active');
  });

  it('refuses anyone but admin', async () => {
    await expect(setAccountStatus(regionVII, targetId, 'disabled')).rejects.toThrow(Forbidden);
  });

  it('refuses to disable the admin account itself', async () => {
    await expect(setAccountStatus(admin, admin.id, 'disabled')).rejects.toThrow();
  });
});

describe('createInvite', () => {
  it('returns a raw token and stores only its hash', async () => {
    const token = await createInvite(admin, targetId);
    expect(token.length).toBeGreaterThan(20);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.inviteTokenHash).not.toBeNull();
    expect(account.inviteTokenHash).not.toBe(token);
    expect(account.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('replaces any previous invite', async () => {
    const first = await createInvite(admin, targetId);
    const second = await createInvite(admin, targetId);
    expect(first).not.toBe(second);
    await expect(redeemInvite(first, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses anyone but admin', async () => {
    await expect(createInvite(regionVII, targetId)).rejects.toThrow(Forbidden);
  });
});

describe('redeemInvite', () => {
  it('sets the password and activates the account', async () => {
    await prisma.account.update({ where: { id: targetId }, data: { status: 'pending' } });
    const token = await createInvite(admin, targetId);

    await redeemInvite(token, 'nowe-haslo-123');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('active');
    expect(await verifyPassword(account.passwordHash!, 'nowe-haslo-123')).toBe(true);
    // A one-time link: the token is consumed.
    expect(account.inviteTokenHash).toBeNull();
  });

  it('refuses a token that was already used', async () => {
    const token = await createInvite(admin, targetId);
    await redeemInvite(token, 'nowe-haslo-123');
    await expect(redeemInvite(token, 'inne-haslo-456')).rejects.toThrow();
  });

  it('refuses an expired token', async () => {
    const token = await createInvite(admin, targetId);
    await prisma.account.update({
      where: { id: targetId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(redeemInvite(token, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses an unknown token', async () => {
    await expect(redeemInvite('zmyslony-token', 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses a password that is too short', async () => {
    const token = await createInvite(admin, targetId);
    await expect(redeemInvite(token, 'krotkie')).rejects.toThrow();
  });
});

describe('renameAccount', () => {
  it('changes the name a region tile and the accounts list show', async () => {
    await renameAccount(admin, targetId, 'Anna i Marek Sowa');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe('Anna i Marek Sowa');
  });

  it('records the rename in the audit trail with both names', async () => {
    await renameAccount(admin, targetId, 'Ewa i Jan Cichy');
    const entry = await prisma.audit.findFirstOrThrow({
      where: { kind: 'account', description: { contains: 'Ewa i Jan Cichy' } },
      orderBy: { id: 'desc' },
    });
    // Both names, so the history says what actually changed.
    expect(entry.description).toContain(TARGET_NAME);
    await prisma.audit.deleteMany({ where: { id: entry.id } });
  });

  it('trims surrounding whitespace', async () => {
    await renameAccount(admin, targetId, '   Zofia i Jan Nowak   ');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe('Zofia i Jan Nowak');
  });

  it('refuses an empty name', async () => {
    await expect(renameAccount(admin, targetId, '   ')).rejects.toThrow();
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe(TARGET_NAME);
  });

  it('refuses a name longer than the column allows', async () => {
    await expect(renameAccount(admin, targetId, 'x'.repeat(121))).rejects.toThrow();
  });

  // Same rule as every other account operation: administration is admin-only.
  it('refuses a region account', async () => {
    await expect(renameAccount(regionVII, targetId, 'Podszyci')).rejects.toThrow(Forbidden);
  });
});

describe('changeEmail', () => {
  it('changes the address the account signs in with', async () => {
    await changeEmail(admin, targetId, 'nowy.adres@example.pl');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.email).toBe('nowy.adres@example.pl');
  });

  it('lower-cases and trims, so the address matches what the login form sends', async () => {
    await changeEmail(admin, targetId, '  MIESZANY.Adres@Example.PL  ');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.email).toBe('mieszany.adres@example.pl');
  });

  // The point of the separate operation: same people, different address.
  it('leaves the password and the sessions alone', async () => {
    await prisma.account.update({
      where: { id: targetId },
      data: { passwordHash: 'nietkniety', status: 'active' },
    });
    const token = await createSession(targetId);

    await changeEmail(admin, targetId, 'bez.skutkow@example.pl');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.passwordHash).toBe('nietkniety');
    expect(account.status).toBe('active');
    expect(await userFromToken(token)).not.toBeNull();
  });

  it('refuses an address another account already uses', async () => {
    await expect(changeEmail(admin, targetId, 'admin@example.pl')).rejects.toThrow();
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.email).toBe(TARGET_EMAIL);
  });

  it('refuses something that is not an address', async () => {
    await expect(changeEmail(admin, targetId, 'to nie jest adres')).rejects.toThrow();
  });

  it('refuses a region account', async () => {
    await expect(changeEmail(regionVII, targetId, 'podszyci@example.pl')).rejects.toThrow(Forbidden);
  });
});

describe('handOverRegion', () => {
  it('sets both the new name and the new address', async () => {
    await handOverRegion(admin, targetId, 'Ewa i Jan Cichy', 'cichy@example.pl');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe('Ewa i Jan Cichy');
    expect(account.email).toBe('cichy@example.pl');
  });

  // Everything the outgoing couple could use to get back in has to go.
  it('revokes the password and every session of the outgoing couple', async () => {
    await prisma.account.update({
      where: { id: targetId },
      data: { passwordHash: 'stare-haslo', status: 'active' },
    });
    const token = await createSession(targetId);

    await handOverRegion(admin, targetId, 'Nowa Para', 'nowa.para@example.pl');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.passwordHash).toBeNull();
    expect(account.status).toBe('pending');
    expect(await userFromToken(token)).toBeNull();
  });

  it('returns an invite the incoming couple can redeem', async () => {
    const token = await handOverRegion(admin, targetId, 'Kolejna Para', 'kolejna@example.pl');
    await redeemInvite(token, 'hasloNowejPary1');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('active');
    expect(await verifyPassword(account.passwordHash!, 'hasloNowejPary1')).toBe(true);
  });

  it('records both couples in the audit trail', async () => {
    await handOverRegion(admin, targetId, 'Trzecia Para', 'trzecia@example.pl');
    const entry = await prisma.audit.findFirstOrThrow({
      where: { kind: 'account', description: { contains: 'Trzecia Para' } },
      orderBy: { id: 'desc' },
    });
    expect(entry.description).toContain(TARGET_NAME);
    expect(entry.description).toContain(TARGET_EMAIL);
    await prisma.audit.deleteMany({ where: { id: entry.id } });
  });

  it('refuses an address another account already uses', async () => {
    await expect(
      handOverRegion(admin, targetId, 'Podszywajaca', 'admin@example.pl'),
    ).rejects.toThrow();
  });

  it('refuses a region account', async () => {
    await expect(
      handOverRegion(regionVII, targetId, 'Podszywajaca', 'x@example.pl'),
    ).rejects.toThrow(Forbidden);
  });
});

describe('creating accounts', () => {
  // Every account made here is torn down by id; querying by name or e-mail
  // would risk deleting somebody else's row, which has bitten this suite twice.
  const made: bigint[] = [];

  const create = async (u: User, input: Parameters<typeof createAccount>[1]) => {
    const token = await createAccount(u, input);
    const a = await prisma.account.findFirstOrThrow({
      where: { email: input.email.trim().toLowerCase() },
    });
    made.push(a.id);
    return { token, account: a };
  };

  afterEach(async () => {
    for (const id of made) {
      await prisma.audit.deleteMany({ where: { accountId: id } });
      await prisma.account.delete({ where: { id } }).catch(() => undefined);
    }
    made.length = 0;
    await prisma.audit.deleteMany({ where: { description: { contains: 'nowe.konto' } } });
  });

  it('starts an account with no password, pending, holding an invite', async () => {
    const { token, account } = await create(admin, {
      name: 'Nowa i Para', email: 'nowe.konto@example.pl', role: 'viewer', regionId: null, regionLead: false,
    });

    expect(account.passwordHash).toBeNull();
    expect(account.status).toBe('pending');
    expect(account.regionId).toBeNull();
    expect(token).toHaveLength(43);

    // The invite is what makes the account usable, so it has to actually work.
    await redeemInvite(token, 'dostatecznie-dlugie');
    const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe('active');
    expect(await verifyPassword(after.passwordHash!, 'dostatecznie-dlugie')).toBe(true);
  });

  it('records the creation in the audit, in the same transaction', async () => {
    const { account } = await create(admin, {
      name: 'Audytowana Para', email: 'nowe.konto.audyt@example.pl', role: 'viewer', regionId: null, regionLead: false,
    });

    const entry = await prisma.audit.findFirst({
      where: { kind: 'account', description: { contains: 'nowe.konto.audyt@example.pl' } },
    });
    expect(entry?.description).toContain('Utworzono konto');
    expect(entry?.accountId).toBe(admin.id);
    expect(account.id).toBeTruthy();
  });

  it('refuses an address that already signs somebody in', async () => {
    await expect(
      createAccount(admin, {
        name: 'Duplikat', email: 'admin@example.pl', role: 'viewer', regionId: null, regionLead: false,
      }),
    ).rejects.toThrow(EmailError);
  });

  it('refuses a second responsible couple for a region that has one', async () => {
    // regionStats reads the responsible couple through a map keyed by region:
    // a second one would silently displace the first.
    await expect(
      createAccount(admin, {
        name: 'Druga Para', email: 'nowe.konto.rejon@example.pl', role: 'region', regionId: 7, regionLead: true,
      }),
    ).rejects.toThrow(AccountRegionError);
  });

  it('refuses a region account with no region at all', async () => {
    await expect(
      createAccount(admin, {
        name: 'Bez Rejonu', email: 'nowe.konto.bezrejonu@example.pl', role: 'region', regionId: null, regionLead: true,
      }),
    ).rejects.toThrow(AccountRegionError);
  });

  it('stops an admin from creating a technical account', async () => {
    await expect(
      createAccount(admin, {
        name: 'Podszywacz', email: 'nowe.konto.sys@example.pl', role: 'superadmin', regionId: null, regionLead: false,
      }),
    ).rejects.toThrow(Forbidden);
  });

  it('stops a region account from creating anything', async () => {
    await expect(
      createAccount(regionVII, {
        name: 'Nie Wolno', email: 'nowe.konto.rejon7@example.pl', role: 'viewer', regionId: null, regionLead: false,
      }),
    ).rejects.toThrow(Forbidden);
  });

  it('lets the technical account create the couple responsible for the community', async () => {
    const { account } = await create(caretaker, {
      name: 'Nowa Para Odpowiedzialna', email: 'nowe.konto.admin@example.pl',
      role: 'admin', regionId: null, regionLead: false,
    });
    expect(account.role).toBe('admin');
  });
});

describe('the technical account is out of the admin reach', () => {
  it('refuses a rename, a re-address and an invitation from an admin', async () => {
    // All three are takeover routes: the last one issues a password.
    const id = caretaker.id;
    await expect(renameAccount(admin, id, 'Przejęte')).rejects.toThrow(Forbidden);
    await expect(changeEmail(admin, id, 'przejete@example.pl')).rejects.toThrow(Forbidden);
    await expect(createInvite(admin, id)).rejects.toThrow(Forbidden);
    await expect(setAccountStatus(admin, id, 'disabled')).rejects.toThrow(Forbidden);

    const untouched = await prisma.account.findUniqueOrThrow({ where: { id } });
    expect(untouched.email).toBe('superadmin@example.pl');
    expect(untouched.status).toBe('active');
  });

  it('will not switch off the only active one, even for itself', async () => {
    await expect(setAccountStatus(caretaker, caretaker.id, 'disabled')).rejects.toThrow(Forbidden);
  });

  it('will not let anybody switch off their own account', async () => {
    await expect(setAccountStatus(admin, admin.id, 'disabled')).rejects.toThrow(Forbidden);
  });
});

describe('helpers inside a region', () => {
  const made: bigint[] = [];

  afterEach(async () => {
    for (const id of made) {
      await prisma.audit.deleteMany({ where: { accountId: id } });
      await prisma.account.delete({ where: { id } }).catch(() => undefined);
    }
    made.length = 0;
    await prisma.audit.deleteMany({ where: { description: { contains: 'pomoc.test' } } });
  });

  const addHelper = async (regionId: number, email: string) => {
    await createAccount(admin, {
      name: 'Pomocna Para', email, role: 'region', regionId, regionLead: false,
    });
    const a = await prisma.account.findFirstOrThrow({ where: { email } });
    made.push(a.id);
    return a;
  };

  it('joins a region that already has a responsible couple', async () => {
    const helper = await addHelper(7, 'pomoc.test.a@example.pl');
    expect(helper.regionLead).toBe(false);
    expect(helper.regionId).toBe(7);
  });

  it('accepts more than one, because helpers are not limited', async () => {
    await addHelper(7, 'pomoc.test.b@example.pl');
    await addHelper(7, 'pomoc.test.c@example.pl');
    const inRegion = await prisma.account.count({ where: { role: 'region', regionId: 7 } });
    expect(inRegion).toBe(3);
  });

  it('leaves the regions overview naming the responsible couple', async () => {
    const lead = await prisma.account.findUniqueOrThrow({ where: { email: 'rejon7@example.pl' } });
    await addHelper(7, 'pomoc.test.d@example.pl');

    const stats = await regionStats(admin);
    expect(stats.find((s) => s.id === 7)!.leadName).toBe(lead.name);
  });

  it('refuses to hand over a region through a helper account', async () => {
    // "Przekaż rejon" revokes the outgoing couple's access; a helper is not
    // the region, so replacing one is a deletion and a fresh invitation.
    const helper = await addHelper(7, 'pomoc.test.e@example.pl');
    await expect(
      handOverRegion(admin, helper.id, 'Ktoś Inny', 'ktos.pomoc.test@example.pl'),
    ).rejects.toThrow(Forbidden);
  });

  it('lets a helper edit the couples of its own region and no others', async () => {
    const helper = await addHelper(7, 'pomoc.test.f@example.pl');
    const asUser: User = { id: helper.id, role: helper.role, regionId: helper.regionId };
    expect(canEdit(asUser, { regionId: 7 })).toBe(true);
    expect(canEdit(asUser, { regionId: 3 })).toBe(false);
    expect(listScope(asUser)).toEqual({ deletedAt: null, regionId: 7 });
  });
});

describe('deleting accounts', () => {
  const made: bigint[] = [];

  afterEach(async () => {
    for (const id of made) {
      await prisma.audit.deleteMany({ where: { accountId: id } });
      await prisma.account.delete({ where: { id } }).catch(() => undefined);
    }
    made.length = 0;
    await prisma.audit.deleteMany({ where: { description: { contains: 'kasowana' } } });
  });

  const throwaway = async (email: string) => {
    await createAccount(admin, {
      name: 'Para Kasowana', email, role: 'viewer', regionId: null, regionLead: false,
    });
    const a = await prisma.account.findFirstOrThrow({ where: { email } });
    made.push(a.id);
    return a;
  };

  it('removes the account and the sessions that let it back in', async () => {
    const account = await throwaway('kasowana.a@example.pl');
    await prisma.account.update({
      where: { id: account.id },
      data: { passwordHash: 'x', status: 'active' },
    });
    const token = await createSession(account.id);
    expect(await userFromToken(token)).not.toBeNull();

    await deleteAccount(admin, account.id);

    expect(await prisma.account.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await userFromToken(token)).toBeNull();
  });

  it('leaves the history standing, headless rather than gone', async () => {
    const account = await throwaway('kasowana.b@example.pl');
    const entry = await prisma.audit.create({
      data: { kind: 'edit', description: 'Coś zrobione przez kasowaną parę', accountId: account.id },
    });

    await deleteAccount(admin, account.id);

    // ON DELETE SET NULL: a register that vanishes with the account it
    // accounts for is not a register. The history renders it "konto usunięte".
    const after = await prisma.audit.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.accountId).toBeNull();
    expect(after.description).toBe('Coś zrobione przez kasowaną parę');
    await prisma.audit.delete({ where: { id: entry.id } });
  });

  it('records the removal, naming whose access went', async () => {
    const account = await throwaway('kasowana.c@example.pl');
    await deleteAccount(admin, account.id);

    const entry = await prisma.audit.findFirst({
      where: { kind: 'account', description: { contains: 'Usunięto konto Para Kasowana' } },
      orderBy: { at: 'desc' },
    });
    expect(entry?.accountId).toBe(admin.id);
    await prisma.audit.deleteMany({ where: { description: { contains: 'Para Kasowana' } } });
  });

  it('refuses to delete the caller\'s own account', async () => {
    await expect(deleteAccount(admin, admin.id)).rejects.toThrow(Forbidden);
  });

  it('refuses to delete the only active technical account', async () => {
    await expect(deleteAccount(caretaker, caretaker.id)).rejects.toThrow(Forbidden);
  });

  it('keeps the technical account out of the admin reach', async () => {
    await expect(deleteAccount(admin, caretaker.id)).rejects.toThrow(Forbidden);
    expect(await prisma.account.findUnique({ where: { id: caretaker.id } })).not.toBeNull();
  });

  it('refuses a region account trying to delete anything', async () => {
    const account = await throwaway('kasowana.d@example.pl');
    await expect(deleteAccount(regionVII, account.id)).rejects.toThrow(Forbidden);
  });
});
