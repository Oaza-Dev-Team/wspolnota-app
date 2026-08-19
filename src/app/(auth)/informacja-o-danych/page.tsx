import Link from 'next/link';
import { AUDIT_RETENTION_MONTHS } from '@/lib/audit/policy';
import style from './notice.module.css';

/**
 * Outside the (app) group and open without a session: the people whose data
 * this is do not have accounts here.
 *
 * The legally binding wording belongs to the controller. This page is the
 * scaffolding with the gaps left visible — an invented privacy notice that
 * looks finished is worse than one that plainly is not.
 */
export const metadata = {
  title: 'Informacja o przetwarzaniu danych — Kartoteka DK',
};

function Gap({ children }: { children: React.ReactNode }) {
  return <span className={style.gap}>[do uzupełnienia: {children}]</span>;
}

export default function DataNoticePage() {
  return (
    <div className={style.page}>
      <main className={style.sheet}>
        <h1 className={style.title}>Informacja o przetwarzaniu danych</h1>
        <p className={style.lead}>
          Dotyczy kartoteki małżeństw Domowego Kościoła — gałęzi rodzinnej Ruchu
          Światło-Życie w archidiecezji gdańskiej.
        </p>

        <section className={style.section}>
          <h2 className={style.heading}>Kto przetwarza dane</h2>
          <p className={style.body}>
            Administratorem danych jest <Gap>pełna nazwa i adres administratora</Gap>.
            W sprawach dotyczących danych można pisać na <Gap>adres kontaktowy</Gap>.
          </p>
        </section>

        <section className={style.section}>
          <h2 className={style.heading}>Jakie dane i po co</h2>
          <p className={style.body}>
            Prowadzimy kartotekę par należących do wspólnoty, żeby utrzymywać kontakt,
            organizować rekolekcje i prowadzić statystykę formacji. Przetwarzamy:
          </p>
          <ul className={style.list}>
            <li>imiona i nazwisko małżonków,</li>
            <li>adres e-mail i numer telefonu,</li>
            <li>przynależność do rejonu, parafii i kręgu,</li>
            <li>przebieg formacji — rodzaj rekolekcji, rok i miejsce,</li>
            <li>imiona i lata urodzenia dzieci, jeśli para je poda,</li>
            <li>notatki wpisane przez parę rejonową.</li>
          </ul>
          <p className={style.body}>
            Przynależność do wspólnoty religijnej i dane dzieci to dane szczególnej
            kategorii w rozumieniu art. 9 RODO. Podstawa prawna przetwarzania:{' '}
            <Gap>podstawa prawna — art. 6 i art. 9 RODO</Gap>.
          </p>
        </section>

        <section className={style.section}>
          <h2 className={style.heading}>Kto ma dostęp</h2>
          <p className={style.body}>
            Para rejonowa widzi wyłącznie pary swojego rejonu. Para odpowiedzialna za
            wspólnotę widzi całość. Moderator ma podgląd bez możliwości edycji. Każde
            wejście do danych i każdy eksport zostaje odnotowany w rejestrze zmian.
          </p>
          <p className={style.body}>
            Dane są przechowywane na serwerze w Unii Europejskiej, prowadzonym przez{' '}
            <Gap>dostawca hostingu i umowa powierzenia</Gap>. Nie przekazujemy ich poza
            Europejski Obszar Gospodarczy.
          </p>
        </section>

        <section className={style.section}>
          <h2 className={style.heading}>Jak długo</h2>
          <p className={style.body}>
            Dane pary przechowujemy przez czas jej przynależności do wspólnoty oraz{' '}
            <Gap>okres po odejściu ze wspólnoty</Gap>. Rejestr zmian i eksportów
            przechowujemy przez {AUDIT_RETENTION_MONTHS} miesięcy — po tym czasie wpisy
            są usuwane automatycznie.
          </p>
        </section>

        <section className={style.section}>
          <h2 className={style.heading}>Twoje prawa</h2>
          <p className={style.body}>
            Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia i
            ograniczenia przetwarzania, a także prawo do przenoszenia danych i do
            wniesienia sprzeciwu. Możesz też wnieść skargę do Prezesa Urzędu Ochrony
            Danych Osobowych.
          </p>
          <p className={style.body}>
            Żądanie usunięcia danych realizujemy trwale: rekord i wpisy o rekolekcjach
            są kasowane. W rejestrze zmian zostaje sam ślad, że operacja się odbyła —
            bez danych, które pozwoliłyby wskazać rodzinę.
          </p>
        </section>

        <section className={style.section}>
          <h2 className={style.heading}>Zabezpieczenia</h2>
          <p className={style.body}>
            Połączenie jest szyfrowane, hasła przechowujemy wyłącznie w postaci skrótów
            argon2id, a fonty i inne zasoby strony serwujemy z własnego serwera — Twoja
            przeglądarka nie łączy się przy tym z żadną firmą trzecią.
          </p>
        </section>

        <Link href="/logowanie" className={style.back}>
          ← Wróć do logowania
        </Link>
      </main>
    </div>
  );
}
