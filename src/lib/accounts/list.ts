import type { AccountStatus, Role } from '@/generated/prisma/enums';
import { Forbidden, type User, canManageAccounts, canManageRole } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { formatDate } from '@/lib/pl';

export type AccountRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  regionId: number | null;
  roman: string | null;
  couples: number;
  lastLoginAt: string | null;
  /** Whether the signed-in caller may rename, re-address, invite or switch it. */
  manageable: boolean;
  /** manageable, and switching it off would leave somebody able to get back in. */
  disableable: boolean;
};

export async function accountRows(u: User): Promise<AccountRow[]> {
  if (!canManageAccounts(u)) throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');

  const [accounts, counts] = await Promise.all([
    prisma.account.findMany({
      // The admin is listed too: the couple responsible for the community
      // changes like any other, and its name and address have to be reachable.
      // What stays out of reach is disabling it — see AccountRow.
      select: {
        id: true, email: true, name: true, role: true, status: true,
        regionId: true, lastLoginAt: true,
      },
    }),
    prisma.couple.groupBy({
      by: ['regionId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const couplesByRegion = new Map(counts.map((c) => [c.regionId, c._count._all]));

  // The two ways an installation loses its last way in: the caller switches
  // off their own account, or the final technical account goes dark. Both are
  // decided here so the row component only renders what it is handed.
  const activeCaretakers = accounts.filter(
    (a) => a.role === 'superadmin' && a.status === 'active',
  ).length;

  const rows = accounts.map((a) => ({
    id: String(a.id),
    email: a.email,
    name: a.name,
    role: a.role,
    status: a.status,
    regionId: a.regionId,
    roman: a.regionId === null ? null : romanNumeral(a.regionId),
    couples: a.regionId === null ? 0 : (couplesByRegion.get(a.regionId) ?? 0),
    lastLoginAt: a.lastLoginAt === null ? null : formatDate(a.lastLoginAt),
    manageable: canManageRole(u, a.role),
    disableable:
      canManageRole(u, a.role)
      && a.id !== u.id
      && !(a.role === 'superadmin' && a.status === 'active' && activeCaretakers <= 1),
  }));

  // Technical account, then the couple responsible for the community, then the
  // regions in numerical order, moderator last — the handoff shows the
  // moderator as the closing row.
  const ORDER: Record<Role, number> = { superadmin: 0, admin: 1, region: 2, viewer: 3 };
  const rank = (r: AccountRow) => ORDER[r.role];
  return rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.regionId ?? 0) - (b.regionId ?? 0);
  });
}
