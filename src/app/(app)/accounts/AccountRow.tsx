'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountRow as Row } from '@/lib/accounts/list';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { regionColor } from '@/lib/domain/regions';
import { COUPLES, plural } from '@/lib/pl';
import {
  type AccountsState, changeEmailAction, handOverAction, inviteAction,
  renameAccountAction, toggleAccountAction,
} from './actions';
import style from './accounts.module.css';

/** Shown in the badge; a region account uses its Roman numeral instead. */
const CODE: Record<Row['role'], string> = {
  superadmin: 'SYS',
  admin: 'ADM',
  region: '',
  viewer: 'MOD',
};

const STATUS_LABEL: Record<Row['status'], string> = {
  active: 'aktywne',
  disabled: 'wyłączone',
  pending: 'oczekuje',
};

/** Which inline form the row has open; only one at a time. */
type Mode = null | 'name' | 'email' | 'handover';

function ActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.action} disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

export function AccountRow({ row }: { row: Row }) {
  const [toggleState, toggle] = useActionState<AccountsState, FormData>(toggleAccountAction, {});
  const [inviteState, invite] = useActionState<AccountsState, FormData>(inviteAction, {});
  const [renameState, rename] = useActionState<AccountsState, FormData>(renameAccountAction, {});
  const [emailState, editEmail] = useActionState<AccountsState, FormData>(changeEmailAction, {});
  const [handOverState, handOver] = useActionState<AccountsState, FormData>(handOverAction, {});
  const [mode, setMode] = useState<Mode>(null);

  const code = row.roman ?? CODE[row.role];
  const color = row.regionId === null ? 'var(--navy-700)' : regionColor(row.regionId);
  const scope =
    row.role === 'superadmin'
      ? 'Cała wspólnota · konto techniczne'
      : row.role === 'admin'
        ? 'Cała wspólnota · zarządzanie'
        : row.regionId === null
          ? 'Cała wspólnota · podgląd'
          : `Rejon ${row.roman} · ${plural(row.couples, COUPLES)}`;

  const error =
    toggleState.error ?? inviteState.error ?? renameState.error
    ?? emailState.error ?? handOverState.error;
  const inviteLink = inviteState.inviteLink ?? handOverState.inviteLink;

  // Who may do what was decided in list.ts, where the permission rules live.
  // Two separate answers: an account can be editable but not switchable off —
  // the last technical account, or the caller's own.
  const { manageable, disableable } = row;

  return (
    <li className={style.row}>
      <span
        className={style.badge}
        style={{ '--region-color': color } as React.CSSProperties}
        aria-hidden="true"
      >
        {code}
      </span>

      <span className={style.identity}>
        {mode === 'name' ? (
          <form action={rename} className={style.editForm} onSubmit={() => setMode(null)}>
            <input type="hidden" name="id" value={row.id} />
            <input
              className={style.editInput}
              name="name"
              defaultValue={row.name}
              aria-label={`Nazwa pary dla konta ${row.email}`}
              autoFocus
            />
            <ActionButton label="Zapisz" />
            <button type="button" className={style.action} onClick={() => setMode(null)}>
              Anuluj
            </button>
          </form>
        ) : (
          <span className={style.nameRow}>
            <span className={style.name}>{row.name}</span>
            {manageable && (
              <button
                type="button"
                className={style.rename}
                onClick={() => setMode('name')}
                aria-label={`Zmień nazwę pary dla konta ${row.email}`}
              >
                Zmień
              </button>
            )}
          </span>
        )}

        {mode === 'email' ? (
          <form action={editEmail} className={style.editForm} onSubmit={() => setMode(null)}>
            <input type="hidden" name="id" value={row.id} />
            <input
              className={style.editInput}
              name="email"
              type="email"
              defaultValue={row.email}
              aria-label={`Adres e-mail konta ${row.name}`}
              autoFocus
            />
            <ActionButton label="Zapisz" />
            <button type="button" className={style.action} onClick={() => setMode(null)}>
              Anuluj
            </button>
          </form>
        ) : (
          <span className={style.nameRow}>
            <span className={style.email}>{row.email}</span>
            {manageable && (
              <button
                type="button"
                className={style.rename}
                onClick={() => setMode('email')}
                aria-label={`Popraw adres e-mail konta ${row.name}`}
              >
                Popraw
              </button>
            )}
          </span>
        )}
      </span>

      <span className={style.scope}>{scope}</span>
      <span className={style.lastLogin}>{row.lastLoginAt ?? '—'}</span>

      <span className={`${style.status} ${style[row.status]}`}>{STATUS_LABEL[row.status]}</span>

      {(disableable || (manageable && row.status === 'pending')) && (
        <span className={style.buttons}>
          {row.status === 'pending' ? (
            <form action={invite}>
              <input type="hidden" name="id" value={row.id} />
              <ActionButton label="Zaproś" />
            </form>
          ) : disableable && (
            <form action={toggle}>
              <input type="hidden" name="id" value={row.id} />
              <input
                type="hidden"
                name="next"
                value={row.status === 'active' ? 'disabled' : 'active'}
              />
              <ActionButton label={row.status === 'active' ? 'Wyłącz' : 'Włącz'} />
            </form>
          )}

          {row.role === 'region' && manageable && (
            <button
              type="button"
              className={style.action}
              onClick={() => setMode('handover')}
              aria-label={`Przekaż rejon ${row.roman} innej parze`}
            >
              Przekaż rejon…
            </button>
          )}
        </span>
      )}

      {mode === 'handover' && (
        <form action={handOver} className={style.handover} onSubmit={() => setMode(null)}>
          <input type="hidden" name="id" value={row.id} />
          <p className={style.handoverNote}>
            Nowa para przejmuje rejon. Hasło ustępującej pary przestaje działać, jej
            sesje kończą się natychmiast, a Ty dostajesz link zaproszenia do przekazania.
          </p>
          <label className={style.editField}>
            <span className={style.editLabel}>Nowa para</span>
            <input
              className={style.editInput}
              name="name"
              placeholder="np. Ewa i Jan Cichy"
              aria-label={`Nowa para dla rejonu ${row.roman}`}
              autoFocus
              required
            />
          </label>
          <label className={style.editField}>
            <span className={style.editLabel}>Adres e-mail</span>
            <input
              className={style.editInput}
              name="email"
              type="email"
              placeholder="np. cichy@example.pl"
              aria-label={`Adres e-mail nowej pary dla rejonu ${row.roman}`}
              required
            />
          </label>
          <span className={style.handoverButtons}>
            <ActionButton label="Potwierdź przekazanie" />
            <button type="button" className={style.action} onClick={() => setMode(null)}>
              Anuluj
            </button>
          </span>
        </form>
      )}

      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}

      {inviteLink && (
        <p className={style.invite} role="status">
          {`Link zaproszenia — skopiuj i przekaż tej parze. Jest ważny ${INVITE_DAYS} dni i działa raz:`}
          <code className={style.inviteLink}>{inviteLink}</code>
        </p>
      )}
    </li>
  );
}
