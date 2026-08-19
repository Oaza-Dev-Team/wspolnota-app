import { redirect } from 'next/navigation';
import type { Role } from '@/generated/prisma/enums';
import { accountRows } from '@/lib/accounts/list';
import { canManageAccounts, canManageRole } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { REGION_COUNT } from '@/lib/domain/regions';
import { ViewHeader } from '../ViewHeader';
import { AccountRow } from './AccountRow';
import { NewAccountForm } from './NewAccountForm';
import style from './accounts.module.css';

const ALL_ROLES: readonly Role[] = ['superadmin', 'admin', 'region', 'viewer'];

export default async function AccountsPage() {
  const u = await requireUser();
  // The nav hides the entry, but the address bar does not respect the nav.
  if (!canManageAccounts(u)) redirect('/couples');

  const rows = await accountRows(u);

  // A region shows one responsible couple, so a region that already has an
  // account is not on offer — changing the couple is "Przekaż rejon", which
  // revokes the outgoing access as it goes.
  const taken = new Set(
    rows.filter((r) => r.role === 'region' && r.status !== 'disabled').map((r) => r.regionId),
  );
  const freeRegions = Array.from({ length: REGION_COUNT }, (_, i) => i + 1)
    .filter((id) => !taken.has(id));

  return (
    <>
      <ViewHeader title="Konta" subtitle="Dostępy do kartoteki" />
      <NewAccountForm roles={ALL_ROLES.filter((r) => canManageRole(u, r))} freeRegions={freeRegions} />
      <ul className={style.container} aria-label="Konta">
        {rows.map((row) => (
          <AccountRow key={row.id} row={row} />
        ))}
      </ul>
    </>
  );
}
