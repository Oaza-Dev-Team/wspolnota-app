import Link from 'next/link';
import { type Filters, PAGE_SIZE, toSearchParams } from '@/lib/couples/filters';
import style from './couples.module.css';

function href(f: Filters, page: number): string {
  const qs = toSearchParams({ ...f, page }).toString();
  return qs ? `/pary?${qs}` : '/pary';
}

export function Pagination({ filters, found }: { filters: Filters; found: number }) {
  const pages = Math.ceil(found / PAGE_SIZE);
  if (pages <= 1) return null;

  return (
    <nav className={style.pagination} aria-label="Strony wyników">
      {filters.page > 1 && (
        <Link href={href(filters, filters.page - 1)} className={style.pageLink}>
          ← Poprzednia
        </Link>
      )}
      <span className={style.pageCounter}>
        Strona {filters.page} z {pages}
      </span>
      {filters.page < pages && (
        <Link href={href(filters, filters.page + 1)} className={style.pageLink}>
          Następna →
        </Link>
      )}
    </nav>
  );
}
