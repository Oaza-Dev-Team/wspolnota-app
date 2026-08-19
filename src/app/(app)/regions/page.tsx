import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/requireUser';
import { REGION_COUNT, regionColor, romanNumeral } from '@/lib/domain/regions';
import { CIRCLES, COUPLES, PARISHES, plural } from '@/lib/pl';
import { regionStats } from '@/lib/regions/stats';
import { ViewHeader } from '../ViewHeader';
import style from './regions.module.css';

export default async function RegionsPage() {
  const u = await requireUser();
  // A region account has exactly one region; the overview would be a page
  // with a single tile leading back to the list it is already on.
  if (u.role === 'region') redirect('/couples');

  const stats = await regionStats(u);

  return (
    <>
      <ViewHeader
        title={`Rejony I–${romanNumeral(REGION_COUNT)}`}
        subtitle="Kliknij rejon, aby przejść do jego listy par"
      />

      <div className={style.grid}>
        {stats.map((r) => (
          <Link
            key={r.id}
            href={`/couples?region=${r.id}`}
            className={style.tile}
            style={{ '--region-color': regionColor(r.id) } as React.CSSProperties}
          >
            <div className={style.head}>
              <span className={style.name}>{`Rejon ${r.roman}`}</span>
              <span className={style.count}>{plural(r.couples, COUPLES)}</span>
            </div>

            <div>
              <div className={style.leadLabel}>Para odpowiedzialna</div>
              {r.leadName ? (
                <div className={style.leadName}>{r.leadName}</div>
              ) : (
                <div className={style.unstaffed}>Do obsadzenia</div>
              )}
              <div className={style.meta}>
                {`${plural(r.circles, CIRCLES)} · ${plural(r.parishes, PARISHES)}`}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
