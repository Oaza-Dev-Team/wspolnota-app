import { requireUser } from '@/lib/auth/requireUser';
import { type ClientFilters, hasActiveFilter, parseFilters } from '@/lib/couples/filters';
import { filterOptions, queryCouples } from '@/lib/couples/queries';
import { listHeading } from '@/lib/navigation';
import { ViewHeader } from '../ViewHeader';
import { CoupleCards } from './CoupleCards';
import { CoupleTable } from './CoupleTable';
import { FilterBar } from './FilterBar';
import { Pagination } from './Pagination';
import style from './couples.module.css';

export default async function CouplesPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. Synchronous access was removed.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await requireUser();
  const filters = parseFilters(await searchParams);

  const [{ rows, found, total }, options] = await Promise.all([
    queryCouples(u, filters),
    filterOptions(u, filters),
  ]);

  const { title, subtitle } = listHeading(u, total);

  // bigint does not cross the server/client boundary — the filter bar is a
  // client component, so ids travel as strings.
  const clientFilters: ClientFilters = {
    ...filters,
    parish: filters.parish === null ? null : String(filters.parish),
    circle: filters.circle === null ? null : String(filters.circle),
  };
  const clientOptions = {
    parishes: options.parishes.map((p) => ({ id: String(p.id), label: p.label })),
    circles: options.circles.map((c) => ({ id: String(c.id), label: c.label })),
  };

  return (
    <>
      <ViewHeader title={title} subtitle={subtitle} />

      <FilterBar
        filters={clientFilters}
        options={clientOptions}
        found={found}
        total={total}
        active={hasActiveFilter(filters)}
        // A region account has exactly one region; the selector would be a
        // single-option control that cannot change anything.
        showRegion={u.role !== 'region'}
      />

      <div className={style.desktopOnly}>
        <CoupleTable rows={rows} filters={filters} user={u} />
      </div>
      <div className={style.mobileOnly}>
        <CoupleCards rows={rows} />
      </div>

      <Pagination filters={filters} found={found} />
    </>
  );
}
