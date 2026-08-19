'use client';

import { useMemo, useRef, useState } from 'react';
import type { ParishOption } from '@/lib/couples/card';
import { PARISHES, plural } from '@/lib/pl';
import style from './card.module.css';

/**
 * Polish diacritics folded one character for one, deliberately not through
 * normalize('NFD'): decomposition changes the length, and the highlight below
 * slices the original string by indices found in the folded one.
 */
const FOLD: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

function fold(s: string): string {
  let out = '';
  for (const c of s) out += FOLD[c] ?? c.toLowerCase();
  return out;
}

/** What the list can offer, in the order it offers it. */
type Row =
  | { kind: 'inherit' }
  | { kind: 'item'; id: string; name: string; city: string; hit: [number, number] | null }
  | { kind: 'create'; text: string };

const INHERIT_LABEL = '— jak w kręgu —';
const MIN_NEW_NAME = 3;

// Fixed rather than from useId: only one card is open at a time, and a
// generated id carries colons that every selector then has to escape.
const LIST_ID = 'parish-listbox';
const rowId = (i: number): string => `parish-opt-${i}`;

export type ParishChoice = { id: string; text: string };

export function ParishCombobox({
  parishes,
  valueId,
  inheritedLabel,
  editable,
  onChange,
}: {
  parishes: ParishOption[];
  /** '' inherits from the circle, '__new__' creates, anything else is an id. */
  valueId: string;
  /** The parish this couple would inherit, or null when its circle has none. */
  inheritedLabel: string | null;
  editable: boolean;
  /** `text` carries what was typed, which prefills the new-parish name. */
  onChange: (choice: ParishChoice) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // What the collapsed field shows for a parish being created: the typed name.
  const [newText, setNewText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...parishes].sort((a, b) => a.label.localeCompare(b.label, 'pl')),
    [parishes],
  );

  const rows = useMemo<Row[]>(() => {
    const typed = query.trim();
    const q = fold(typed);
    const out: Row[] = [];

    // First, always, when it can be reached: the field's most common answer.
    if (q === '' || fold(INHERIT_LABEL).includes(q) || 'jak w kregu'.includes(q)) {
      out.push({ kind: 'inherit' });
    }

    for (const p of sorted) {
      if (q !== '' && !fold(`${p.name} ${p.city}`).includes(q)) continue;
      const at = q === '' ? -1 : fold(p.name).indexOf(q);
      out.push({
        kind: 'item',
        id: p.id,
        name: p.name,
        city: p.city,
        // Absent when the match was on the city rather than the name.
        hit: at === -1 ? null : [at, at + q.length],
      });
    }

    // Last, and only once it means something: a name long enough to be one,
    // that no parish already answers to.
    if (typed.length >= MIN_NEW_NAME && !sorted.some((p) => fold(p.name) === q)) {
      out.push({ kind: 'create', text: typed });
    }
    return out;
  }, [query, sorted]);

  const matched = rows.filter((r) => r.kind === 'item').length;

  const selected = parishes.find((p) => p.id === valueId) ?? null;
  const collapsed =
    valueId === '__new__' ? `${newText} (nowa)`
      : selected ? selected.label
        : '';

  // The list is taller than it is long: keep the highlighted row in view by
  // moving the container, since scrollIntoView would drag the dialog too.
  function reveal(index: number) {
    const list = listRef.current;
    const row = list?.children[index] as HTMLElement | undefined;
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }

  function move(to: number) {
    const next = Math.max(0, Math.min(rows.length - 1, to));
    setActive(next);
    reveal(next);
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    if (row.kind === 'inherit') onChange({ id: '', text: '' });
    else if (row.kind === 'item') onChange({ id: row.id, text: '' });
    else {
      setNewText(row.text);
      onChange({ id: '__new__', text: row.text });
    }
    setOpen(false);
    setQuery('');
  }

  function openList() {
    // Opening clears the query so the whole list is on offer; the choice
    // itself lives in the hidden input and is untouched by this.
    setQuery('');
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      return move(active + (e.key === 'ArrowDown' ? 1 : -1));
    }
    if (!open) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(rows.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  }

  // A read-only card shows the answer and offers nothing: no list, and no
  // hidden input either, because a disabled card must not submit a parish.
  if (!editable) {
    return (
      <input
        className={style.control}
        value={collapsed || INHERIT_LABEL}
        aria-label="Parafia"
        disabled
        readOnly
      />
    );
  }

  const counter =
    query.trim() === ''
      ? `${plural(sorted.length, PARISHES)} — pisz albo wybierz ↑↓`
      : `${matched} z ${sorted.length} ${PARISHES[2]}`;

  return (
    <>
      <input type="hidden" name="parishId" value={valueId} />
      <div className={style.combo}>
        <input
          className={style.control}
          role="combobox"
          aria-expanded={open}
          aria-controls={LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={open ? rowId(active) : undefined}
          aria-label="Parafia"
          autoComplete="off"
          value={open ? query : collapsed}
          placeholder={
            inheritedLabel === null
              ? INHERIT_LABEL
              : `${INHERIT_LABEL} (${inheritedLabel})`
          }
          onFocus={openList}
          onClick={openList}
          onBlur={() => { setOpen(false); setQuery(''); }}
          onChange={(e) => { setQuery(e.currentTarget.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />

        {open && (
          <div className={style.comboList} id={LIST_ID} role="listbox" ref={listRef}>
            {rows.map((row, i) => (
              <div
                key={row.kind === 'item' ? row.id : row.kind}
                id={rowId(i)}
                role="option"
                aria-selected={i === active}
                className={`${style.comboRow} ${i === active ? style.comboRowActive : ''}`}
                onMouseEnter={() => setActive(i)}
                // mousedown, not click: blur fires first and would close the
                // list out from under the pointer.
                onMouseDown={(e) => { e.preventDefault(); choose(row); }}
              >
                {row.kind === 'inherit' && (
                  <>
                    <span>{INHERIT_LABEL}</span>
                    <span className={style.comboMeta}>{inheritedLabel ?? 'krąg bez parafii'}</span>
                  </>
                )}
                {row.kind === 'item' && (
                  <>
                    <span>
                      {row.hit === null ? row.name : (
                        <>
                          {row.name.slice(0, row.hit[0])}
                          <b className={style.comboMark}>{row.name.slice(row.hit[0], row.hit[1])}</b>
                          {row.name.slice(row.hit[1])}
                        </>
                      )}
                    </span>
                    <span className={style.comboMeta}>{row.city}</span>
                  </>
                )}
                {row.kind === 'create' && (
                  <>
                    <span>{`+ nowa parafia „${row.text}”`}</span>
                    <span className={style.comboMeta}>utworzy się przy zapisie</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <span className={style.fieldHint} aria-live="polite">
        {open
          ? counter
          : valueId === '__new__'
            ? 'Nowa parafia — uzupełnij nazwę i miasto poniżej.'
            : selected
              ? 'Parafia własna pary, inna niż parafia kręgu.'
              : `Dziedziczy z kręgu: ${inheritedLabel ?? 'krąg nie ma parafii'}`}
      </span>
    </>
  );
}
