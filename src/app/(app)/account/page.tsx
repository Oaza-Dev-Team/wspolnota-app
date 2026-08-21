import { requireUser } from '@/lib/auth/requireUser';
import { listCredentials } from '@/lib/auth/webauthn/credentials';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { ROLE_LABELS } from '@/lib/domain/roles';
import { ViewHeader } from '../ViewHeader';
import style from './account.module.css';
import { KeyList } from './KeyList';

/**
 * Every role reaches this page: it is the only place an account can manage
 * its own passkeys, and the invitation link that registered the first one is
 * single use.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; crossDevice?: string }>;
}) {
  const u = await requireUser();
  const { welcome, crossDevice } = await searchParams;

  const [account, keys] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: u.id },
      select: { name: true, email: true },
    }),
    listCredentials(u.id),
  ]);

  const role = u.role === 'region' && u.regionId !== null
    ? `${ROLE_LABELS[u.role]} · rejon ${romanNumeral(u.regionId)}`
    : ROLE_LABELS[u.role];

  return (
    <>
      <ViewHeader title="Moje konto" subtitle="Twoje dane dostępowe" />

      <div className={style.panel}>
        <dl className={style.summary}>
          <div className={style.entry}>
            <dt className={style.term}>Para</dt>
            <dd className={style.value}>{account.name}</dd>
          </div>
          <div className={style.entry}>
            <dt className={style.term}>Adres e-mail</dt>
            <dd className={style.value}>{account.email}</dd>
          </div>
          <div className={style.entry}>
            <dt className={style.term}>Rola</dt>
            <dd className={style.value}>{role}</dd>
          </div>
        </dl>
        {/* Both are the admin's to change, and saying so here saves a round of
            "why is this greyed out". */}
        <p className={style.hint}>
          Nazwę pary i adres e-mail zmienia para odpowiedzialna za wspólnotę.
        </p>
      </div>

      <KeyList keys={keys} welcome={welcome === '1'} crossDevice={crossDevice === '1'} />
    </>
  );
}
