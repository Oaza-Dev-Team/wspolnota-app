import Link from 'next/link';
import { PlakietkaFormacji } from '@/components/PlakietkaFormacji';
import { PlakietkaRejonu } from '@/components/PlakietkaRejonu';
import { type Uzytkownik, mozeEdytowac } from '@/lib/auth/permissions';
import { type Filtry, type KluczSortowania, doSearchParams } from '@/lib/pary/filtry';
import type { WierszPary } from '@/lib/pary/zapytania';
import style from './pary.module.css';

const KOLUMNY: { klucz: KluczSortowania; etykieta: string }[] = [
  { klucz: 'nazwisko', etykieta: 'Nazwisko' },
  { klucz: 'imiona', etykieta: 'Imiona' },
  { klucz: 'email', etykieta: 'E-mail' },
  { klucz: 'telefon', etykieta: 'Telefon' },
  { klucz: 'rejon', etykieta: 'Rejon' },
  { klucz: 'parafia', etykieta: 'Parafia' },
  { klucz: 'krag', etykieta: 'Krąg' },
];

function linkSortowania(f: Filtry, klucz: KluczSortowania): string {
  // Clicking the active column flips direction; any other column starts ascending.
  const dir = f.sort === klucz && f.dir === 'asc' ? 'desc' : 'asc';
  const qs = doSearchParams({ ...f, sort: klucz, dir, strona: 1 }).toString();
  return qs ? `/pary?${qs}` : '/pary';
}

function ariaSort(f: Filtry, klucz: KluczSortowania): 'ascending' | 'descending' | 'none' {
  if (f.sort !== klucz) return 'none';
  return f.dir === 'asc' ? 'ascending' : 'descending';
}

export function TabelaPar({
  wiersze,
  filtry,
  uzytkownik,
}: {
  wiersze: WierszPary[];
  filtry: Filtry;
  uzytkownik: Uzytkownik;
}) {
  if (wiersze.length === 0) {
    return (
      <div className={style.kontener}>
        <p className={style.pusty}>Brak wyników dla podanych kryteriów.</p>
      </div>
    );
  }

  return (
    <div className={style.kontener}>
      <div className={style.przewijanie}>
        <table className={style.tabela}>
          <thead>
            <tr>
              {KOLUMNY.map((k) => (
                <th key={k.klucz} scope="col" aria-sort={ariaSort(filtry, k.klucz)}>
                  <Link
                    href={linkSortowania(filtry, k.klucz)}
                    className={`${style.naglowekSortowania} ${
                      filtry.sort === k.klucz ? style.naglowekAktywny : ''
                    }`}
                  >
                    {k.etykieta}
                    {filtry.sort === k.klucz ? (filtry.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </Link>
                </th>
              ))}
              {/* Formation is a computed badge, so it is not sortable. */}
              <th scope="col"><span className={style.naglowekZwykly}>Formacja</span></th>
              <th scope="col"><span className={style.naglowekZwykly}>&nbsp;</span></th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => (
              <tr key={String(w.id)}>
                <td className={style.nazwisko}>{w.nazwisko}</td>
                <td>{`${w.imieZony} i ${w.imieMeza}`}</td>
                <td>{w.email ?? '—'}</td>
                <td className={style.mono}>{w.telefon ?? '—'}</td>
                <td><PlakietkaRejonu rejon={w.rejonId} /></td>
                <td>{w.parafia ?? '—'}</td>
                <td className={style.mono}>{w.krag ?? '—'}</td>
                <td><PlakietkaFormacji rodzaje={w.rodzaje} /></td>
                <td className={style.akcja}>
                  {/* The interactive element is a real link, so keyboard
                      navigation works without tabindex on the row. */}
                  <Link href={`/pary?karta=${w.id}`} className={style.linkAkcji}>
                    {mozeEdytowac(uzytkownik, { rejonId: w.rejonId }) ? 'Edytuj →' : 'Podgląd →'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
