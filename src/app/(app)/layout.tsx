import { canManageAccounts, listScope } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import type { ViewKey } from '@/lib/navigation';
import { Shell } from './Shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();

  const [account, coupleCount] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: u.id }, select: { name: true } }),
    // Counted within the user's own scope, so a region account sees the size
    // of its region rather than of the community.
    prisma.couple.count({ where: listScope(u) }),
  ]);

  const counts: Partial<Record<ViewKey, number>> = { couples: coupleCount };
  if (u.role !== 'region') counts.regions = REGION_COUNT;
  if (canManageAccounts(u)) {
    // Matches what the accounts view lists, admin included.
    counts.accounts = await prisma.account.count();
  }

  return (
    <Shell user={u} accountName={account.name} counts={counts}>
      {children}
    </Shell>
  );
}
