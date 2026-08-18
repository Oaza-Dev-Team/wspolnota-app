'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { LICZBA_REJONOW, numerRzymski } from '@/lib/domena/rejony';
import { KREGI, PARAFIE, odmiana } from '@/lib/pl';
import { type FiltryKlienta, OPCJE_FORMACJI, doSearchParams } from '@/lib/pary/filtry';
import style from './filtry.module.css';

type Opcje = {
  parafie: { id: string; etykieta: string }[];
  kregi: { id: string; etykieta: string }[];
};

const ODBICIE_MS = 300;

export function PasekFiltrow({
  filtry,
  opcje,
  znalezione,
  wszystkie,
  aktywne,
  pokazRejon,
}: {
  // FiltryKlienta, not Filtry: bigint does not survive the server/client
  // boundary, so parish and circle ids travel as strings.
  filtry: FiltryKlienta;
  opcje: Opcje;
  znalezione: number;
  wszystkie: number;
  aktywne: boolean;
  pokazRejon: boolean;
}) {
  const router = useRouter();
  const [wTrakcie, startTransition] = useTransition();
  const odbicie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(odbicie.current), []);

  function zastosuj(zmiana: Partial<FiltryKlienta>) {
    // Any filter change returns to page one; a filtered result set has no
    // page 4 to stay on.
    const qs = doSearchParams({ ...filtry, ...zmiana, strona: 1 }).toString();
    startTransition(() => router.replace(qs ? `/pary?${qs}` : '/pary', { scroll: false }));
  }

  function zastosujSzukanie(q: string) {
    // Without this every keystroke would be a round trip to the database.
    clearTimeout(odbicie.current);
    odbicie.current = setTimeout(() => zastosuj({ q }), ODBICIE_MS);
  }

  const wartoscFormacji =
    filtry.formacja.rodzaj === 'dowolna' ? 'all'
    : filtry.formacja.rodzaj === 'ma' ? filtry.formacja.stopien
    : filtry.formacja.rodzaj === 'bez' ? `bez:${filtry.formacja.stopien}`
    : filtry.formacja.rodzaj === 'inne' ? 'INNE'
    : 'brak';

  return (
    <div className={style.pasek} aria-busy={wTrakcie}>
      <input
        className={`${style.kontrolka} ${style.szukaj}`}
        type="search"
        defaultValue={filtry.q}
        placeholder="Szukaj: nazwisko, imię, e-mail…"
        aria-label="Szukaj"
        onChange={(e) => zastosujSzukanie(e.currentTarget.value)}
      />

      {pokazRejon && (
        <select
          className={`${style.kontrolka} ${style.rejon}`}
          value={filtry.rejon ?? 'all'}
          aria-label="Rejon"
          // Changing the region invalidates both narrower choices.
          onChange={(e) => zastosuj({
            rejon: e.currentTarget.value === 'all' ? null : Number(e.currentTarget.value),
            parafia: null,
            krag: null,
          })}
        >
          <option value="all">Wszystkie rejony</option>
          {Array.from({ length: LICZBA_REJONOW }, (_, i) => i + 1).map((r) => (
            <option key={r} value={r}>{`Rejon ${numerRzymski(r)}`}</option>
          ))}
        </select>
      )}

      <select
        className={`${style.kontrolka} ${style.parafia}`}
        value={filtry.parafia ?? 'all'}
        aria-label="Parafia"
        onChange={(e) => zastosuj({
          parafia: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
          krag: null,
        })}
      >
        <option value="all">{`Wszystkie — ${odmiana(opcje.parafie.length, PARAFIE)}`}</option>
        {opcje.parafie.map((p) => (
          <option key={p.id} value={p.id}>{p.etykieta}</option>
        ))}
      </select>

      <select
        className={`${style.kontrolka} ${style.krag}`}
        value={filtry.krag ?? 'all'}
        aria-label="Krąg"
        onChange={(e) => zastosuj({
          krag: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
        })}
      >
        <option value="all">{`Wszystkie — ${odmiana(opcje.kregi.length, KREGI)}`}</option>
        {opcje.kregi.map((k) => (
          <option key={k.id} value={k.id}>{k.etykieta}</option>
        ))}
      </select>

      <select
        className={`${style.kontrolka} ${style.formacja}`}
        value={wartoscFormacji}
        aria-label="Formacja"
        onChange={(e) => {
          const params = doSearchParams({ ...filtry, strona: 1 });
          if (e.currentTarget.value === 'all') params.delete('formacja');
          else params.set('formacja', e.currentTarget.value);
          const qs = params.toString();
          startTransition(() => router.replace(qs ? `/pary?${qs}` : '/pary', { scroll: false }));
        }}
      >
        {OPCJE_FORMACJI.map((o) => (
          <option key={o.wartosc} value={o.wartosc}>{o.etykieta}</option>
        ))}
      </select>

      <span className={style.licznik} role="status">
        {znalezione} / {wszystkie}{aktywne ? ' (filtr)' : ''}
      </span>
    </div>
  );
}
