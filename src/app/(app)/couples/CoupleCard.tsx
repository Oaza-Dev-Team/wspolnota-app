'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CardData, FormationEntry } from '@/lib/couples/card';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { FormationSection } from './FormationSection';
import { PurgeForm } from './PurgeForm';
import { type CardState, deleteCoupleAction, saveCoupleAction } from './actions';
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
}: {
  card: CardData;
  editable: boolean;
  options: { circles: { id: string; label: string }[]; parishes: { id: string; label: string }[] };
  regionChangeable: boolean;
  /** Already soft-deleted: readable, not correctable. */
  deleted: boolean;
  purgeable: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, saveAction] = useActionState<CardState, FormData>(saveCoupleAction, {});
  const [deleteState, deleteAction] = useActionState<CardState, FormData>(deleteCoupleAction, {});

  // The drawer is edited on a copy — Cancel simply navigates away and the
  // list behind it was never touched.
  const [retreats, setRetreats] = useState<FormationEntry[]>(card.retreats);

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
  const error = state.error ?? deleteState.error;

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
            <select className={style.control} name="regionId" defaultValue={card.regionId}
              disabled={!editable || !regionChangeable}>
              {Array.from({ length: REGION_COUNT }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>{`Rejon ${romanNumeral(r)}`}</option>
              ))}
            </select>
          </label>

          <label className={style.field}>
            <span className={style.label}>Krąg</span>
            <select className={style.control} name="circleId" defaultValue={card.circleId ?? ''}
              disabled={!editable}>
              <option value="">— bez kręgu —</option>
              {options.circles.map((c) => (
                <option key={c.id} value={c.id}>{`Krąg ${c.label}`}</option>
              ))}
            </select>
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Parafia</span>
            <select className={style.control} name="parishId" defaultValue={card.parishId ?? ''}
              disabled={!editable}>
              <option value="">— jak w kręgu —</option>
              {options.parishes.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

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

        {purgeable && !isNew && <PurgeForm id={card.id} surname={card.surname} />}

        <p className={style.note}>
          {deleted
            ? 'Ta para jest usunięta z kartoteki. Zostaje tu do trwałego usunięcia na żądanie.'
            : editable
              ? 'Każdy zapis trafia do historii zmian z Twoim kontem i datą.'
              : 'Podgląd bez możliwości edycji.'}
        </p>
      </div>
    </dialog>
  );
}
