import Link from 'next/link';
import { FormationBadge } from '@/components/FormationBadge';
import { RegionBadge } from '@/components/RegionBadge';
import { type User, canEdit } from '@/lib/auth/permissions';
import { type Filters, type SortKey, toSearchParams } from '@/lib/couples/filters';
import type { CoupleRow } from '@/lib/couples/queries';
import style from './couples.module.css';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'surname', label: 'Nazwisko' },
  { key: 'names', label: 'Imiona' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefon' },
  { key: 'region', label: 'Rejon' },
  { key: 'parish', label: 'Parafia' },
  { key: 'circle', label: 'Krąg' },
];

function sortHref(f: Filters, key: SortKey): string {
  // Clicking the active column flips direction; any other column starts ascending.
  const dir = f.sort === key && f.dir === 'asc' ? 'desc' : 'asc';
  const qs = toSearchParams({ ...f, sort: key, dir, page: 1 }).toString();
  return qs ? `/couples?${qs}` : '/couples';
}

function ariaSort(f: Filters, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (f.sort !== key) return 'none';
  return f.dir === 'asc' ? 'ascending' : 'descending';
}

export function CoupleTable({
  rows,
  filters,
  user,
}: {
  rows: CoupleRow[];
  filters: Filters;
  user: User;
}) {
  if (rows.length === 0) {
    return (
      <div className={style.container}>
        <p className={style.empty}>Brak wyników dla podanych kryteriów.</p>
      </div>
    );
  }

  return (
    <div className={style.container}>
      <div className={style.scroller}>
        <table className={style.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" aria-sort={ariaSort(filters, c.key)}>
                  <Link
                    href={sortHref(filters, c.key)}
                    className={`${style.sortLink} ${
                      filters.sort === c.key ? style.sortActive : ''
                    }`}
                  >
                    {c.label}
                    {filters.sort === c.key ? (filters.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </Link>
                </th>
              ))}
              {/* Formation is a computed badge, so it is not sortable. */}
              <th scope="col"><span className={style.plainHeader}>Formacja</span></th>
              <th scope="col"><span className={style.plainHeader}>&nbsp;</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td className={style.surname}>{r.surname}</td>
                <td>{`${r.wifeName} i ${r.husbandName}`}</td>
                <td>{r.email ?? '—'}</td>
                <td className={style.mono}>{r.phone ?? '—'}</td>
                <td><RegionBadge region={r.regionId} /></td>
                <td>{r.parish ?? '—'}</td>
                <td className={style.mono}>{r.circle ?? '—'}</td>
                <td><FormationBadge kinds={r.kinds} /></td>
                <td className={style.action}>
                  {/* The interactive element is a real link, so keyboard
                      navigation works without tabindex on the row. */}
                  <Link href={`/couples?card=${r.id}`} className={style.actionLink}>
                    {canEdit(user, { regionId: r.regionId }) ? 'Edytuj →' : 'Podgląd →'}
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
