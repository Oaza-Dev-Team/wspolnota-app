'use client';

import type { RetreatKind } from '@/generated/prisma/enums';
import type { FormationEntry } from '@/lib/couples/card';
import { RETREAT_KINDS, nextDegree } from '@/lib/domain/retreats';
import { ENTRIES, plural } from '@/lib/pl';
import style from './card.module.css';

export function FormationSection({
  entries,
  onChange,
  editable,
}: {
  entries: FormationEntry[];
  onChange: (entries: FormationEntry[]) => void;
  editable: boolean;
}) {
  function change(i: number, patch: Partial<FormationEntry>) {
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  function add() {
    // Suggests the earliest degree the couple is missing; once every degree is
    // present it falls through to INNE.
    const kind = nextDegree(entries.map((e) => e.kind));
    onChange([...entries, { kind, year: '', place: '', name: '' }]);
  }

  return (
    <section className={style.formation}>
      <div className={style.formationHeader}>
        <h3 className={style.formationTitle}>Formacja — przebyte rekolekcje</h3>
        <span className={style.formationCount}>{plural(entries.length, ENTRIES)}</span>
      </div>

      {entries.length === 0 && <p className={style.noEntries}>Brak wpisów o rekolekcjach.</p>}

      {entries.map((e, i) => (
        <div className={style.entry} key={i}>
          <select
            className={`${style.entryControl} ${style.entryKind}`}
            value={e.kind}
            aria-label={`Rodzaj rekolekcji ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { kind: ev.currentTarget.value as RetreatKind })}
          >
            {RETREAT_KINDS.map((r) => (
              <option key={r.kind} value={r.kind}>{r.name}</option>
            ))}
          </select>

          <input
            className={`${style.entryControl} ${style.entryYear}`}
            value={e.year}
            placeholder="rok"
            inputMode="numeric"
            aria-label={`Rok ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { year: ev.currentTarget.value })}
          />

          <input
            className={`${style.entryControl} ${style.entryPlace}`}
            value={e.place}
            placeholder="miejsce"
            aria-label={`Miejsce ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { place: ev.currentTarget.value })}
          />

          {/* Only INNE carries a free-text name, and then it is required. */}
          {e.kind === 'INNE' && (
            <input
              className={`${style.entryControl} ${style.entryName}`}
              value={e.name}
              placeholder="nazwa rekolekcji"
              aria-label={`Nazwa rekolekcji ${i + 1}`}
              disabled={!editable}
              onChange={(ev) => change(i, { name: ev.currentTarget.value })}
            />
          )}

          {editable && (
            <button
              type="button"
              className={style.entryRemove}
              aria-label={`Usuń wpis ${i + 1}`}
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {editable && (
        <button type="button" className={style.addEntry} onClick={add}>
          + Dodaj rekolekcje
        </button>
      )}
    </section>
  );
}
