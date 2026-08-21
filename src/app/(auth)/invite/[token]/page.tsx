import Image from 'next/image';
import { redirect } from 'next/navigation';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { currentUser } from '@/lib/auth/requireUser';
import style from '../../login/login.module.css';
import { InviteForm } from './InviteForm';

/**
 * Outside the (app) group: whoever follows an invite has no session yet, so
 * the shell — and the requireUser() it depends on — must not stand in the way.
 * The token is validated only when the form is submitted; showing this page
 * for an invalid token reveals nothing.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (await currentUser()) redirect('/couples');

  const { token } = await params;

  return (
    <div className={style.screen}>
      <section className={style.left}>
        <div className={style.brand}>
          <span className={style.monogram}>
            <Image src="/phos-zoe.png" alt="" width={32} height={32} priority />
          </span>
          <span className={style.caption}>
            Ruch Światło-Życie
            <br />
            Archidiecezja Gdańska
          </span>
        </div>

        <div className={style.middle}>
          <h1 className={style.title}>
            Zaproszenie do
            <br />
            <em>Kartoteki</em>
          </h1>
          <p className={style.lead}>
            {`Utwórz klucz dostępu — potwierdzisz go odciskiem palca albo PIN-em
            urządzenia. Hasła nie będzie. Link działa raz i wygasa po ${INVITE_DAYS} dniach.`}
          </p>
        </div>

        <p className={style.leftFooter}>Archidiecezja Gdańska</p>
      </section>

      <section className={style.right}>
        <h2 className={style.formHeading}>Utwórz klucz dostępu</h2>
        <InviteForm token={token} />
        <p className={style.formFooter}>
          Jeśli to zaproszenie trafiło tu przez pomyłkę — wystarczy zamknąć tę stronę.
          Bez utworzenia klucza nic się nie zmienia.
        </p>
      </section>
    </div>
  );
}
