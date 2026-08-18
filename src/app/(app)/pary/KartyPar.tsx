import Link from 'next/link';
import { PlakietkaFormacji } from '@/components/PlakietkaFormacji';
import { PlakietkaRejonu } from '@/components/PlakietkaRejonu';
import type { WierszPary } from '@/lib/pary/zapytania';
import style from './pary.module.css';

export function KartyPar({ wiersze }: { wiersze: WierszPary[] }) {
  if (wiersze.length === 0) {
    return <p className={style.pusty}>Brak wyników dla podanych kryteriów.</p>;
  }

  return (
    <div className={style.karty}>
      {wiersze.map((w) => (
        <Link key={String(w.id)} href={`/pary?karta=${w.id}`} className={style.karta}>
          <div className={style.kartaWiersz}>
            <span className={style.kartaNazwisko}>{w.nazwisko}</span>
            <PlakietkaRejonu rejon={w.rejonId} sufiks={w.krag ? `krąg ${w.krag}` : undefined} />
          </div>
          <div className={style.kartaWiersz}>
            <span className={style.kartaImiona}>{`${w.imieZony} i ${w.imieMeza}`}</span>
            <PlakietkaFormacji rodzaje={w.rodzaje} />
          </div>
          <div className={style.kartaMeta}>
            <span>{w.telefon ?? '—'}</span>
            <span>{w.email ?? '—'}</span>
            <span>{w.parafia ?? '—'}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
