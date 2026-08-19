import { redirect } from 'next/navigation';
import type { Role } from '@/generated/prisma/enums';
import { accountRows } from '@/lib/accounts/list';
import { canManageAccounts, canManageRole } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { REGION_COUNT } from '@/lib/domain/regions';
import { ViewHeader } from '../ViewHeader';
import { AccountRow } from './AccountRow';
import type { AccountKind } from './actions';
import { NewAccountForm } from './NewAccountForm';
import style from './accounts.module.css';

/** In the order the select offers them: widest reach first. */
const ALL_KINDS: readonly { kind: AccountKind; role: Role }[] = [
  { kind: 'superadmin', role: 'superadmin' },
  { kind: 'admin', role: 'admin' },
  { kind: 'region-lead', role: 'region' },
  { kind: 'region-helper', role: 'region' },
  { kind: 'viewer', role: 'viewer' },
];

export default async function AccountsPage() {
  const u = await requireUser();
  // The nav hides the entry, but the address bar does not respect the nav.
  if (!canManageAccounts(u)) redirect('/couples');

  const rows = await accountRows(u);

  // A region names one responsible couple, so a region that already has one is
  // not on offer — changing it is "Przekaż rejon", which revokes the outgoing
  // access as it goes. Helpers carry no such limit and may join any region.
  // Every lead counts, disabled ones included: that is what the partial unique
  // index behind the column enforces.
  const taken = new Set(rows.filter((r) => r.regionLead).map((r) => r.regionId));
  const allRegions = Array.from({ length: REGION_COUNT }, (_, i) => i + 1);
  const freeRegions = allRegions.filter((id) => !taken.has(id));

  return (
    <>
      <ViewHeader title="Konta" subtitle="Dostępy do kartoteki" />
      <NewAccountForm
        kinds={ALL_KINDS.filter((k) => canManageRole(u, k.role)).map((k) => k.kind)}
        freeRegions={freeRegions}
        allRegions={allRegions}
      />
      <ul className={style.container} aria-label="Konta">
        {rows.map((row) => (
          <AccountRow key={row.id} row={row} />
        ))}
      </ul>
    </>
  );
}
