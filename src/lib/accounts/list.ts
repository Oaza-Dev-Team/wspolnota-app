import type { AccountStatus, Role } from '@/generated/prisma/enums';
import { Forbidden, type User, canManageAccounts } from '@/lib/auth/permissions';
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
  }));

  // Regions in numerical order, the moderator at the bottom — the handoff
  // shows it as the last row.
  // Admin first, then regions in numerical order, moderator last — the handoff
  // shows the moderator as the closing row.
  const rank = (r: AccountRow) => (r.role === 'admin' ? 0 : r.role === 'region' ? 1 : 2);
  return rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.regionId ?? 0) - (b.regionId ?? 0);
  });
}
