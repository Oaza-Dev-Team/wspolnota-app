import { redirect } from 'next/navigation';
import { accountRows } from '@/lib/accounts/list';
import { canManageAccounts } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { ViewHeader } from '../ViewHeader';
import { AccountRow } from './AccountRow';
import style from './accounts.module.css';

export default async function AccountsPage() {
  const u = await requireUser();
  // The nav hides the entry, but the address bar does not respect the nav.
  if (!canManageAccounts(u)) redirect('/pary');

  const rows = await accountRows(u);

  return (
    <>
      <ViewHeader title="Konta rejonów" subtitle="Dostępy par rejonowych i moderatora" />
      <div className={style.container}>
        {rows.map((row) => (
          <AccountRow key={row.id} row={row} />
        ))}
      </div>
    </>
  );
}
