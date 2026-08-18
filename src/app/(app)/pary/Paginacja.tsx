import Link from 'next/link';
import { type Filtry, ROZMIAR_STRONY, doSearchParams } from '@/lib/pary/filtry';
import style from './pary.module.css';

function link(f: Filtry, strona: number): string {
  const qs = doSearchParams({ ...f, strona }).toString();
  return qs ? `/pary?${qs}` : '/pary';
}

export function Paginacja({ filtry, znalezione }: { filtry: Filtry; znalezione: number }) {
  const stron = Math.ceil(znalezione / ROZMIAR_STRONY);
  if (stron <= 1) return null;

  return (
    <nav className={style.paginacja} aria-label="Strony wyników">
      {filtry.strona > 1 && (
        <Link href={link(filtry, filtry.strona - 1)} className={style.stronaLink}>
          ← Poprzednia
        </Link>
      )}
      <span className={style.stronaLicznik}>
        Strona {filtry.strona} z {stron}
      </span>
      {filtry.strona < stron && (
        <Link href={link(filtry, filtry.strona + 1)} className={style.stronaLink}>
          Następna →
        </Link>
      )}
    </nav>
  );
}
