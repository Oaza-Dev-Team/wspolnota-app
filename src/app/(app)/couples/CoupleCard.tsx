'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CardData, CircleOption, FormationEntry, ParishOption } from '@/lib/couples/card';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { FormationSection } from './FormationSection';
import { ParishCombobox } from './ParishCombobox';
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
  options: { circles: CircleOption[]; parishes: ParishOption[] };
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
  const [newParishText, setNewParishText] = useState('');
  const newParishCityRef = useRef<HTMLInputElement>(null);

  const [circleMode, setCircleMode] = useState(card.circleId ?? '');

  // Which parish the couple would inherit if it kept no parish of its own.
  // Read from the circle selected at this moment, not from the saved one, so
  // the sentence under the field stays true after changing circle.
  const inheritedParish =
    options.circles.find((c) => c.id === circleMode)?.parishLabel ?? null;

  // The name came from the combobox, so the only thing left to type is the city.
  useEffect(() => {
    if (parishMode === '__new__') newParishCityRef.current?.focus();
  }, [parishMode]);

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

          <div className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Parafia</span>
            <ParishCombobox
              parishes={options.parishes}
              valueId={parishMode}
              inheritedLabel={inheritedParish}
              editable={editable}
              onChange={(choice) => { setParishMode(choice.id); setNewParishText(choice.text); }}
            />
          </div>

          {parishMode === '__new__' && (
            <div className={`${style.newEntity} ${style.wide}`}>
              <label className={style.field}>
                <span className={style.label}>Nazwa parafii</span>
                <input
                  className={style.control}
                  name="newParishName"
                  // Whatever was typed into the combobox: the name is known,
                  // which is why the focus below goes to the city instead.
                  defaultValue={newParishText}
                  key={newParishText}
                  placeholder="np. św. Brygidy"
                  disabled={!editable}
                />
              </label>
              <label className={style.field}>
                <span className={style.label}>Miasto</span>
                <input
                  className={style.control}
                  name="newParishCity"
                  ref={newParishCityRef}
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
