import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/requireUser';
import { LoginForm } from './LoginForm';
import style from './login.module.css';

export default async function LoginPage() {
  if (await currentUser()) redirect('/couples');

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
            Kartoteka
            <br />
            <em>Domowego Kościoła</em>
          </h1>
          <p className={style.lead}>
            Jedenaście rejonów, jedna wspólna baza. Pary rejonowe prowadzą swoją część
            kartoteki, para odpowiedzialna za wspólnotę widzi całość.
          </p>
        </div>

        <p className={style.leftFooter}>Archidiecezja Gdańska</p>
      </section>

      <section className={style.right}>
        <h2 className={style.formHeading}>Zaloguj się</h2>
        <LoginForm />
        <p className={style.formFooter}>
          Dostęp nadaje para odpowiedzialna za wspólnotę.
          <br />
          <Link href="/privacy" className={style.noticeLink}>
            Informacja o przetwarzaniu danych
          </Link>
        </p>
      </section>
    </div>
  );
}
