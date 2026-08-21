import { requireUser } from '@/lib/auth/requireUser';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { ROLE_LABELS } from '@/lib/domain/roles';
import { ViewHeader } from '../ViewHeader';
import style from './account.module.css';
import { PasswordForm } from './PasswordForm';

/**
 * Every role reaches this page: it is the only place an account can change its
 * own password, and the invitation link that set the first one is single use.
 */
export default async function AccountPage() {
  const u = await requireUser();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: u.id },
    select: { name: true, email: true },
  });

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

      <div className={style.panel}>
        <h2 className={style.heading}>Zmiana hasła</h2>
        <PasswordForm />
      </div>
    </>
  );
}
