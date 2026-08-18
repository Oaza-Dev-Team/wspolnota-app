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
      // The admin manages other people's access, not their own.
      where: { role: { not: 'admin' } },
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
  return rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'region' ? -1 : 1;
    return (a.regionId ?? 0) - (b.regionId ?? 0);
  });
}
