'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CardData, FormationEntry } from '@/lib/couples/card';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { PARISHES, plural } from '@/lib/pl';
import { FormationSection } from './FormationSection';
import { PurgeForm } from './PurgeForm';
import {
  type CardState, deleteCoupleAction, restoreCoupleAction, saveCoupleAction,
} from './actions';
import style from './card.module.css';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.save} disabled={pending}>
      {pending ? 'Zapisywanie…' : 'Zapisz'}
    </button>
  );
}

/**
 * Diacritics stripped both sides, so "brygidy" finds "św. Brygidy" and
 * "gdansk" finds "Gdańsk" — the same courtesy the list search already does
 * in Postgres through immutable_unaccent.
 */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CoupleCard({
  card,
  editable,
  options,
  regionChangeable,
  deleted,
  purgeable,
  restorable,
}: {
  card: CardData;
  editable: boolean;
  options: { circles: { id: string; label: string }[]; parishes: { id: string; label: string }[] };
  regionChangeable: boolean;
  /** Already soft-deleted: readable, not correctable. */
  deleted: boolean;
  purgeable: boolean;
  /** Soft-deleted and this caller may put it back on the lists. */
  restorable: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, saveAction] = useActionState<CardState, FormData>(saveCoupleAction, {});
  const [deleteState, deleteAction] = useActionState<CardState, FormData>(deleteCoupleAction, {});
  const [restoreState, restoreAction] = useActionState<CardState, FormData>(restoreCoupleAction, {});

  // The drawer is edited on a copy — Cancel simply navigates away and the
  // list behind it was never touched.
  const [retreats, setRetreats] = useState<FormationEntry[]>(card.retreats);

  // "__new__" in either select swaps that field for the inputs that describe
  // the entity to create. The save layer already knows how to make them.
  const [parishMode, setParishMode] = useState(card.parishId ?? '');
  const [parishQuery, setParishQuery] = useState('');

  const parishMatches = useMemo(() => {
    const q = fold(parishQuery.trim());
    return q === '' ? options.parishes : options.parishes.filter((p) => fold(p.label).includes(q));
  }, [options.parishes, parishQuery]);

  // Whatever the search says, the parish already chosen stays on the list.
  // Dropping it would leave the select showing the first option instead, and
  // saving would then move the couple to a parish nobody picked.
  const parishChoices = useMemo(() => {
    const chosen = options.parishes.find((p) => p.id === parishMode);
    return chosen && !parishMatches.some((p) => p.id === chosen.id)
      ? [chosen, ...parishMatches]
      : parishMatches;
  }, [options.parishes, parishMatches, parishMode]);
  const [circleMode, setCircleMode] = useState(card.circleId ?? '');

  // showModal is what gives the focus trap, Esc handling and the backdrop.
  // A <dialog open> attribute would render the element without any of them.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function close() {
    router.push('/couples');
  }

  const isNew = card.id === '';
  const kicker = isNew ? 'Nowy wpis' : `Karta pary · rejon ${romanNumeral(card.regionId)}`;
  const title = isNew ? 'Dodaj parę' : `${card.wifeName} i ${card.husbandName} ${card.surname}`;
  const error = state.error ?? deleteState.error ?? restoreState.error;

  return (
    <dialog
      ref={dialog}
      className={style.overlay}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        // Clicking the backdrop closes; clicking inside the panel must not.
        if (e.target === dialog.current) close();
      }}
    >
      <div className={style.panel}>
        <header className={style.header}>
          <div>
            <p className={style.kicker}>{kicker}</p>
            <h2 className={style.title}>{title}</h2>
          </div>
          <button type="button" className={style.close} onClick={close} aria-label="Zamknij">
            ✕
          </button>
        </header>

        {!editable && (
          <p className={style.banner}>
            Tylko podgląd — ta para należy do innego rejonu, edytować może para rejonowa
            lub odpowiedzialni za wspólnotę.
          </p>
        )}

        {error && <p className={style.error} role="alert">{error}</p>}

        <form action={saveAction} className={style.form}>
          <input type="hidden" name="id" value={card.id} />
          <input type="hidden" name="retreats" value={JSON.stringify(retreats)} />

          <label className={style.field}>
            <span className={style.label}>Imię żony</span>
            <input className={style.control} name="wifeName" defaultValue={card.wifeName}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Imię męża</span>
            <input className={style.control} name="husbandName" defaultValue={card.husbandName}
              disabled={!editable} />
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Nazwisko</span>
            <input className={style.control} name="surname" defaultValue={card.surname}
              disabled={!editable} required />
          </label>

          <label className={style.field}>
            <span className={style.label}>E-mail</span>
            <input className={style.control} type="email" name="email" defaultValue={card.email}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Telefon</span>
            <input className={style.control} name="phone" defaultValue={card.phone}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Rejon</span>
            {/*
              A disabled control is not submitted, so an account that may not
              move a couple between regions has to state the region some other
              way. The action falls back to the caller's own region as well;
              this makes the form carry its own value rather than rely on it.
            */}
            {editable && !regionChangeable && (
              <input type="hidden" name="regionId" value={card.regionId} />
            )}
            <select className={style.control} name="regionId" defaultValue={card.regionId}
              disabled={!editable || !regionChangeable}>
              {Array.from({ length: REGION_COUNT }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>{`Rejon ${romanNumeral(r)}`}</option>
              ))}
            </select>
          </label>

          <label className={style.field}>
            <span className={style.label}>Krąg</span>
            <select
              className={style.control}
              name="circleId"
              value={circleMode}
              disabled={!editable}
              onChange={(e) => setCircleMode(e.currentTarget.value)}
            >
              <option value="">— bez kręgu —</option>
              {options.circles.map((c) => (
                <option key={c.id} value={c.id}>{`Krąg ${c.label}`}</option>
              ))}
              <option value="__new__">+ nowy krąg…</option>
            </select>
          </label>

          {circleMode === '__new__' && (
            <div className={`${style.newEntity} ${style.wide}`}>
              <label className={style.field}>
                <span className={style.label}>Numer kręgu</span>
                <input
                  className={style.control}
                  name="newCircleNumber"
                  inputMode="numeric"
                  placeholder="np. 3"
                  disabled={!editable}
                />
              </label>
              <label className={style.field}>
                <span className={style.label}>Patron (opcjonalnie)</span>
                <input
                  className={style.control}
                  name="newCirclePatron"
                  placeholder="np. św. Rity"
                  disabled={!editable}
                />
              </label>
              <p className={style.hint}>
                Krąg powstanie w rejonie wybranym powyżej i przejmie parafię z pola „Parafia”.
              </p>
            </div>
          )}

          {/*
            A div rather than a label: this field holds two controls, and a
            wrapping label binds to the first one only, which would leave the
            select nameless. Each carries its own aria-label instead.

            A select, because it is the only control that states what is chosen
            without being opened — and for most couples what is chosen is
            "inherited from the circle", which an empty text field cannot say.
            The search box exists because an archdiocese has more parishes than
            anybody wants to scroll.
          */}
          <div className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Parafia</span>
            {editable && (
              <input
                className={style.search}
                type="search"
                value={parishQuery}
                onChange={(e) => setParishQuery(e.currentTarget.value)}
                placeholder="Szukaj parafii — nazwa lub miasto"
                aria-label="Szukaj parafii"
              />
            )}
            <select className={style.control} name="parishId" value={parishMode}
              aria-label="Parafia"
              disabled={!editable} onChange={(e) => setParishMode(e.currentTarget.value)}>
              <option value="">— jak w kręgu —</option>
              {parishChoices.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="__new__">+ nowa parafia…</option>
            </select>
            {editable && parishQuery !== '' && (
              <span className={style.fieldHint}>
                {parishMatches.length === 0
                  ? 'Nic nie pasuje — wyczyść wyszukiwanie albo dodaj nową parafię.'
                  : `Lista zawężona do ${plural(parishMatches.length, PARISHES)}.`}
              </span>
            )}
          </div>

          {parishMode === '__new__' && (
            <div className={`${style.newEntity} ${style.wide}`}>
              <label className={style.field}>
                <span className={style.label}>Nazwa parafii</span>
                <input
                  className={style.control}
                  name="newParishName"
                  placeholder="np. św. Brygidy"
                  disabled={!editable}
                />
              </label>
              <label className={style.field}>
                <span className={style.label}>Miasto</span>
                <input
                  className={style.control}
                  name="newParishCity"
                  placeholder="np. Gdańsk"
                  disabled={!editable}
                />
              </label>
              <p className={style.hint}>
                Jeśli taka parafia już istnieje, zostanie użyta zamiast utworzenia drugiej.
              </p>
            </div>
          )}

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Dzieci — imiona i roczniki</span>
            <input className={style.control} name="children" defaultValue={card.children}
              placeholder="np. Marysia 2014, Antek 2017" disabled={!editable} />
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Notatki</span>
            <textarea className={style.control} name="notes" rows={3}
              defaultValue={card.notes} disabled={!editable} />
          </label>

          <div className={style.wide}>
            <FormationSection entries={retreats} onChange={setRetreats} editable={editable} />
          </div>

          {editable && (
            <div className={`${style.footer} ${style.wide}`}>
              <SaveButton />
              <button type="button" className={style.cancel} onClick={close}>Anuluj</button>
            </div>
          )}
        </form>

        {editable && !isNew && (
          <form action={deleteAction}>
            <input type="hidden" name="id" value={card.id} />
            <button type="submit" className={style.remove}>Usuń parę</button>
          </form>
        )}

        {/*
          Restoring comes before erasing, and not only on the screen: a
          record reaches this state by a misclick far more often than by a
          request to be erased.
        */}
        {deleted && restorable && (
          <form action={restoreAction}>
            <input type="hidden" name="id" value={card.id} />
            <button type="submit" className={style.restore}>Przywróć parę</button>
          </form>
        )}

        {purgeable && !isNew && <PurgeForm id={card.id} surname={card.surname} />}

        <p className={style.note}>
          {deleted
            ? restorable
              ? 'Ta para jest usunięta z kartoteki. „Przywróć parę” cofa to w całości, razem z formacją.'
              : 'Ta para jest usunięta z kartoteki. Zostaje tu do trwałego usunięcia na żądanie.'
            : editable
              ? 'Każdy zapis trafia do historii zmian z Twoim kontem i datą.'
              : 'Podgląd bez możliwości edycji.'}
        </p>
      </div>
    </dialog>
  );
}
