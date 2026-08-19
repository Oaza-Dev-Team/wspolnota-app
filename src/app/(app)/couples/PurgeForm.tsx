'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type CardState, purgeCoupleAction } from './actions';
import style from './card.module.css';

function PurgeButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.purge} disabled={!enabled || pending}>
      {pending ? 'Usuwanie…' : 'Usuń trwale'}
    </button>
  );
}

/**
 * The typed surname is the confirmation. A plain "are you sure?" on an
 * irreversible operation gets clicked through by reflex; this one cannot be
 * undone by anything short of restoring a backup.
 */
export function PurgeForm({ id, surname }: { id: string; surname: string }) {
  const [state, action] = useActionState<CardState, FormData>(purgeCoupleAction, {});
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className={style.dangerZone}>
        <button type="button" className={style.dangerToggle} onClick={() => setOpen(true)}>
          Trwale usuń (żądanie RODO)
        </button>
      </div>
    );
  }

  return (
    <form action={action} className={style.dangerZone}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="surname" value={surname} />

      <p className={style.dangerText}>
        Rekord i wpisy o rekolekcjach zostaną skasowane bez możliwości cofnięcia. Wpisy
        w historii zmian zostaną, ale przestaną wskazywać tę rodzinę.
      </p>

      {state.error && (
        <p className={style.error} role="alert">
          {state.error}
        </p>
      )}

      <label className={style.dangerLabel} htmlFor="confirm">
        {`Przepisz nazwisko „${surname}", żeby potwierdzić`}
      </label>
      <input
        className={style.dangerInput}
        id="confirm"
        name="confirm"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.currentTarget.value)}
      />

      <div className={style.dangerActions}>
        <PurgeButton enabled={typed.trim() === surname} />
        <button type="button" className={style.cancel} onClick={() => setOpen(false)}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
