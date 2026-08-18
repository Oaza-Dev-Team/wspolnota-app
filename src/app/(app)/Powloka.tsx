import Link from 'next/link';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { numerRzymski } from '@/lib/domena/rejony';
import { type KluczWidoku, pozycjeNawigacji } from '@/lib/nawigacja';
import style from './powloka.module.css';

const ETYKIETY_ROL: Record<Uzytkownik['rola'], string> = {
  admin: 'Para odpowiedzialna za wspólnotę',
  rejon: 'Para rejonowa',
  podglad: 'Moderator — podgląd',
};

function kodKonta(u: Uzytkownik): string {
  if (u.rola === 'admin') return 'ADM';
  if (u.rola === 'podglad') return 'MOD';
  return u.rejonId === null ? '—' : numerRzymski(u.rejonId);
}

export function Powloka({
  uzytkownik,
  nazwaKonta,
  aktywny,
  liczniki,
  children,
}: {
  uzytkownik: Uzytkownik;
  nazwaKonta: string;
  aktywny: KluczWidoku;
  liczniki: Partial<Record<KluczWidoku, number>>;
  children: React.ReactNode;
}) {
  return (
    <div className={style.aplikacja}>
      <nav className={style.sidebar} aria-label="Nawigacja główna">
        <div className={style.brand}>
          <span className={style.monogram} aria-hidden="true">ŚŻ</span>
          <span>
            <span className={style.brandNazwa}>Kartoteka DK</span>
            <br />
            <span className={style.brandPodpis}>Archidiec. Gdańska</span>
          </span>
        </div>

        <div className={style.nawigacja}>
          {pozycjeNawigacji(uzytkownik).map((p) => (
            <Link
              key={p.klucz}
              href={p.href}
              className={`${style.pozycja} ${p.klucz === aktywny ? style.pozycjaAktywna : ''}`}
              aria-current={p.klucz === aktywny ? 'page' : undefined}
            >
              <span>{p.etykieta}</span>
              {liczniki[p.klucz] !== undefined && (
                <span className={style.licznik}>{liczniki[p.klucz]}</span>
              )}
            </Link>
          ))}
        </div>

        <div className={style.stopka}>
          <div className={style.konto}>
            <span className={style.awatar} aria-hidden="true">{kodKonta(uzytkownik)}</span>
            <span>
              <span className={style.kontoNazwa}>{nazwaKonta}</span>
              <br />
              <span className={style.kontoRola}>{ETYKIETY_ROL[uzytkownik.rola]}</span>
            </span>
          </div>
          <form action="/wyloguj" method="post">
            <button type="submit" className={style.wyloguj}>Wyloguj</button>
          </form>
        </div>
      </nav>

      <main className={style.main}>{children}</main>
    </div>
  );
}
