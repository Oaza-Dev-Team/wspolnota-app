import Link from 'next/link';
import { Toast } from '@/components/Toast';
import { canChangeRegion, canPurge } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { blankCard, cardOptions, loadCard } from '@/lib/couples/card';
import { type ClientFilters, hasActiveFilter, parseFilters, toSearchParams } from '@/lib/couples/filters';
import { filterOptions, queryCouples } from '@/lib/couples/queries';
import { listHeading } from '@/lib/navigation';
import { ViewHeader } from '../ViewHeader';
import { CoupleCard } from './CoupleCard';
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
  const params = await searchParams;
  const filters = parseFilters(params);

  const cardParam = (() => {
    const v = params['card'];
    return Array.isArray(v) ? v[0] : v;
  })();

  const [{ rows, found, total }, options] = await Promise.all([
    queryCouples(u, filters),
    filterOptions(u, filters),
  ]);

  const { title, subtitle } = listHeading(u, total);

  // The export must carry whatever the user is looking at, so its address is
  // built from the same filters the list was rendered with.
  const exportQuery = toSearchParams(filters).toString();
  const exportHref = exportQuery ? `/eksport?${exportQuery}` : '/eksport';

  // The drawer is a URL state, so the back button works and a card can be
  // linked to. Its content is fetched here, on the server.
  let drawer: React.ReactNode = null;
  if (cardParam === 'new' && u.role !== 'viewer') {
    const blank = blankCard(u);
    drawer = (
      <CoupleCard
        card={blank}
        editable
        options={await cardOptions(blank.regionId)}
        regionChangeable={canChangeRegion(u)}
        deleted={false}
        purgeable={false}
      />
    );
  } else if (cardParam && /^\d+$/.test(cardParam)) {
    // An unknown or soft-deleted id simply opens nothing — a stale link from
    // browser history has no business breaking the page.
    const result = await loadCard(u, BigInt(cardParam));
    if (result) {
      drawer = (
        <CoupleCard
          card={result.card}
          editable={result.editable}
          options={await cardOptions(result.card.regionId)}
          regionChangeable={canChangeRegion(u)}
          deleted={result.deleted}
          purgeable={canPurge(u)}
        />
      );
    }
  }

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
      <ViewHeader title={title} subtitle={subtitle}>
        <a href={exportHref} className={style.exportButton}>Eksport XLSX</a>
        {u.role !== 'viewer' && (
          <Link href="/pary?card=new" className={style.addButton}>
            + Dodaj parę
          </Link>
        )}
      </ViewHeader>

      <FilterBar
        filters={clientFilters}
        options={clientOptions}
        found={found}
        total={total}
        active={hasActiveFilter(filters)}
        // A region account has exactly one region; the selector would be a
        // single-option control that cannot change anything.
        showRegion={u.role !== 'region'}
        // Only whoever may erase a record for good has a reason to see the
        // ones already taken off the lists.
        showDeleted={canPurge(u)}
      />

      <div className={style.desktopOnly}>
        <CoupleTable rows={rows} filters={filters} user={u} />
      </div>
      <div className={style.mobileOnly}>
        <CoupleCards rows={rows} />
      </div>

      <Pagination filters={filters} found={found} />

      {drawer}
      {params['saved'] && <Toast text="Zapisano zmiany" />}
      {params['deleted'] && <Toast text="Para usunięta z kartoteki" />}
      {params['purged'] && <Toast text="Dane usunięte trwale" />}
    </>
  );
}
