import { redirect } from 'next/navigation';
import { pobierzUzytkownika } from '@/lib/auth/requireUser';
import { Formularz } from './Formularz';
import style from './logowanie.module.css';

export default async function StronaLogowania() {
  if (await pobierzUzytkownika()) redirect('/pary');

  return (
    <div className={style.ekran}>
      <section className={style.lewa}>
        <div className={style.brand}>
          <span className={style.monogram} aria-hidden="true">ŚŻ</span>
          <span className={style.podpis}>
            Ruch Światło-Życie
            <br />
            Archidiecezja Gdańska
          </span>
        </div>

        <div className={style.srodek}>
          <h1 className={style.tytul}>
            Kartoteka
            <br />
            <em>Domowego Kościoła</em>
          </h1>
          <p className={style.lead}>
            Jedenaście rejonów, jedna wspólna baza. Pary rejonowe prowadzą swoją część
            kartoteki, para odpowiedzialna za wspólnotę widzi całość.
          </p>
        </div>

        <p className={style.stopkaLewa}>Archidiecezja Gdańska</p>
      </section>

      <section className={style.prawa}>
        <h2 className={style.naglowekFormularza}>Zaloguj się</h2>
        <Formularz />
        <p className={style.stopkaFormularza}>
          Dostęp nadaje para odpowiedzialna za wspólnotę.
        </p>
      </section>
    </div>
  );
}
