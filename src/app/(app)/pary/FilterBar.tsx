'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { type ClientFilters, FORMATION_OPTIONS, toSearchParams } from '@/lib/couples/filters';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { CIRCLES, PARISHES, plural } from '@/lib/pl';
import style from './filterBar.module.css';

type Options = {
  parishes: { id: string; label: string }[];
  circles: { id: string; label: string }[];
};

const DEBOUNCE_MS = 300;

export function FilterBar({
  filters,
  options,
  found,
  total,
  active,
  showRegion,
}: {
  // ClientFilters, not Filters: bigint does not survive the server/client
  // boundary, so parish and circle ids travel as strings.
  filters: ClientFilters;
  options: Options;
  found: number;
  total: number;
  active: boolean;
  showRegion: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function apply(change: Partial<ClientFilters>) {
    // Any filter change returns to page one; a filtered result set has no
    // page 4 to stay on.
    const qs = toSearchParams({ ...filters, ...change, page: 1 }).toString();
    startTransition(() => router.replace(qs ? `/pary?${qs}` : '/pary', { scroll: false }));
  }

  function applySearch(q: string) {
    // Without this every keystroke would be a round trip to the database.
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q }), DEBOUNCE_MS);
  }

  const formationValue =
    filters.formation.kind === 'any' ? 'any'
    : filters.formation.kind === 'has' ? filters.formation.degree
    : filters.formation.kind === 'without' ? `without:${filters.formation.degree}`
    : filters.formation.kind === 'other' ? 'INNE'
    : 'none';

  return (
    <div className={style.bar} aria-busy={pending}>
      <input
        className={`${style.control} ${style.search}`}
        type="search"
        defaultValue={filters.q}
        placeholder="Szukaj: nazwisko, imię, e-mail…"
        aria-label="Szukaj"
        onChange={(e) => applySearch(e.currentTarget.value)}
      />

      {showRegion && (
        <select
          className={`${style.control} ${style.region}`}
          value={filters.region ?? 'all'}
          aria-label="Rejon"
          // Changing the region invalidates both narrower choices.
          onChange={(e) => apply({
            region: e.currentTarget.value === 'all' ? null : Number(e.currentTarget.value),
            parish: null,
            circle: null,
          })}
        >
          <option value="all">Wszystkie rejony</option>
          {Array.from({ length: REGION_COUNT }, (_, i) => i + 1).map((r) => (
            <option key={r} value={r}>{`Rejon ${romanNumeral(r)}`}</option>
          ))}
        </select>
      )}

      <select
        className={`${style.control} ${style.parish}`}
        value={filters.parish ?? 'all'}
        aria-label="Parafia"
        onChange={(e) => apply({
          parish: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
          circle: null,
        })}
      >
        <option value="all">{`Wszystkie — ${plural(options.parishes.length, PARISHES)}`}</option>
        {options.parishes.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      <select
        className={`${style.control} ${style.circle}`}
        value={filters.circle ?? 'all'}
        aria-label="Krąg"
        onChange={(e) => apply({
          circle: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
        })}
      >
        <option value="all">{`Wszystkie — ${plural(options.circles.length, CIRCLES)}`}</option>
        {options.circles.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>

      <select
        className={`${style.control} ${style.formation}`}
        value={formationValue}
        aria-label="Formacja"
        onChange={(e) => {
          const params = toSearchParams({ ...filters, page: 1 });
          if (e.currentTarget.value === 'any') params.delete('formation');
          else params.set('formation', e.currentTarget.value);
          const qs = params.toString();
          startTransition(() => router.replace(qs ? `/pary?${qs}` : '/pary', { scroll: false }));
        }}
      >
        {FORMATION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <span className={style.counter} role="status">
        {found} / {total}{active ? ' (filtr)' : ''}
      </span>
    </div>
  );
}
