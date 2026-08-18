import { requireUser } from '@/lib/auth/requireUser';
import { tytulListy } from '@/lib/nawigacja';
import { type FiltryKlienta, czyAktywne, parseFiltry } from '@/lib/pary/filtry';
import { opcjeFiltrow, queryPary } from '@/lib/pary/zapytania';
import { NaglowekWidoku } from '../NaglowekWidoku';
import { KartyPar } from './KartyPar';
import { Paginacja } from './Paginacja';
import { PasekFiltrow } from './PasekFiltrow';
import { TabelaPar } from './TabelaPar';
import style from './pary.module.css';

export default async function StronaPar({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. Synchronous access was removed.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await requireUser();
  const filtry = parseFiltry(await searchParams);

  const [{ wiersze, znalezione, wszystkie }, opcje] = await Promise.all([
    queryPary(u, filtry),
    opcjeFiltrow(u, filtry),
  ]);

  const { tytul, podtytul } = tytulListy(u, wszystkie);

  // bigint does not cross the server/client boundary — the filter bar is a
  // client component, so ids travel as strings.
  const filtryDlaKlienta: FiltryKlienta = {
    ...filtry,
    parafia: filtry.parafia === null ? null : String(filtry.parafia),
    krag: filtry.krag === null ? null : String(filtry.krag),
  };
  const opcjeDlaKlienta = {
    parafie: opcje.parafie.map((p) => ({ id: String(p.id), etykieta: p.etykieta })),
    kregi: opcje.kregi.map((k) => ({ id: String(k.id), etykieta: k.etykieta })),
  };

  return (
    <>
      <NaglowekWidoku tytul={tytul} podtytul={podtytul} />

      <PasekFiltrow
        filtry={filtryDlaKlienta}
        opcje={opcjeDlaKlienta}
        znalezione={znalezione}
        wszystkie={wszystkie}
        aktywne={czyAktywne(filtry)}
        // A region account has exactly one region; the selector would be a
        // single-option control that cannot change anything.
        pokazRejon={u.rola !== 'rejon'}
      />

      <div className={style.tylkoDesktop}>
        <TabelaPar wiersze={wiersze} filtry={filtry} uzytkownik={u} />
      </div>
      <div className={style.tylkoMobile}>
        <KartyPar wiersze={wiersze} />
      </div>

      <Paginacja filtry={filtry} znalezione={znalezione} />
    </>
  );
}
