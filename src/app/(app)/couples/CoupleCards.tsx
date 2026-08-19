import Link from 'next/link';
import { FormationBadge } from '@/components/FormationBadge';
import { RegionBadge } from '@/components/RegionBadge';
import type { CoupleRow } from '@/lib/couples/queries';
import style from './couples.module.css';

export function CoupleCards({ rows }: { rows: CoupleRow[] }) {
  if (rows.length === 0) {
    return <p className={style.empty}>Brak wyników dla podanych kryteriów.</p>;
  }

  return (
    <div className={style.cards}>
      {rows.map((r) => (
        <Link key={String(r.id)} href={`/couples?card=${r.id}`} className={style.card}>
          <div className={style.cardRow}>
            <span className={style.cardSurname}>{r.surname}</span>
            <RegionBadge region={r.regionId} suffix={r.circle ? `krąg ${r.circle}` : undefined} />
          </div>
          <div className={style.cardRow}>
            <span className={style.cardNames}>{`${r.wifeName} i ${r.husbandName}`}</span>
            <FormationBadge kinds={r.kinds} />
          </div>
          <div className={style.cardMeta}>
            <span>{r.phone ?? '—'}</span>
            <span>{r.email ?? '—'}</span>
            <span>{r.parish ?? '—'}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
