'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountRow as Row } from '@/lib/accounts/list';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { regionColor } from '@/lib/domain/regions';
import { COUPLES, plural } from '@/lib/pl';
import {
  type AccountsState, changeEmailAction, deleteAccountAction, handOverAction,
  inviteAction, renameAccountAction, toggleAccountAction,
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
type Mode = null | 'name' | 'email' | 'handover' | 'delete';

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
  const [deleteState, remove] = useActionState<AccountsState, FormData>(deleteAccountAction, {});
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
          : row.regionLead
            ? `Rejon ${row.roman} · ${plural(row.couples, COUPLES)}`
            : `Rejon ${row.roman} · pomoc w kartotece`;

  const error =
    toggleState.error ?? inviteState.error ?? renameState.error
    ?? emailState.error ?? handOverState.error ?? deleteState.error;
  const inviteLink = inviteState.inviteLink ?? handOverState.inviteLink;
  // The same link means two different things: a first invitation for an
  // account that has no key, and a reset for one that has.
  const isReset = inviteState.inviteLink !== undefined && row.status !== 'pending';

  // Who may do what was decided in list.ts, where the permission rules live.
  // An account can be editable and still not removable: the caller's own, or
  // the last active technical one, are what somebody signs back in through.
  const { manageable, loadBearing } = row;
  const removable = manageable && !loadBearing;

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

      {manageable && (
        <span className={style.buttons}>
          {/* An invitation is a key reset in everything but name, so the
              same button serves an account that never had one and an account
              whose couple has lost access to theirs. Only the wording differs. */}
          <form action={invite}>
            <input type="hidden" name="id" value={row.id} />
            <ActionButton label={row.status === 'pending' ? 'Zaproś' : 'Nowy klucz…'} />
          </form>

          {removable && (
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

          {/* A helper is not the region: it is replaced by deleting it. */}
          {row.regionLead && manageable && (
            <button
              type="button"
              className={style.action}
              onClick={() => setMode('handover')}
              aria-label={`Przekaż rejon ${row.roman} innej parze`}
            >
              Przekaż rejon…
            </button>
          )}

          {removable && (
            <button
              type="button"
              className={style.action}
              onClick={() => setMode('delete')}
              aria-label={`Usuń konto ${row.name}`}
            >
              Usuń…
            </button>
          )}
        </span>
      )}

      {mode === 'handover' && (
        <form action={handOver} className={style.handover} onSubmit={() => setMode(null)}>
          <input type="hidden" name="id" value={row.id} />
          <p className={style.handoverNote}>
            Nowa para przejmuje rejon. Klucz ustępującej pary przestaje działać, jej
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

      {mode === 'delete' && (
        <form action={remove} className={style.handover} onSubmit={() => setMode(null)}>
          <input type="hidden" name="id" value={row.id} />
          <p className={style.handoverNote}>
            {`Konto ${row.name} zniknie razem ze swoimi sesjami. Wpisy w historii zmian `}
            {'zostaną — bez nazwy, jako „konto usunięte”. Tego się nie cofa; żeby tylko '}
            {'odebrać dostęp na jakiś czas, użyj „Wyłącz”.'}
          </p>
          <span className={style.handoverButtons}>
            <ActionButton label="Potwierdź usunięcie" />
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
          {isReset
            ? `Link do zarejestrowania nowego klucza — skopiuj i przekaż tej parze. Jest ważny ${INVITE_DAYS} dni i działa raz:`
            : `Link zaproszenia — skopiuj i przekaż tej parze. Jest ważny ${INVITE_DAYS} dni i działa raz:`}
          <code className={style.inviteLink}>{inviteLink}</code>
          {/* A handover revokes as it goes, and a pending account has nothing
              to revoke; a reset leaves the old key standing, and whoever
              passes the link on has to know that. */}
          {isReset && ' Dotychczasowy klucz działa do chwili użycia linku — żeby zabrać dostęp od razu, najpierw „Wyłącz”.'}
        </p>
      )}
    </li>
  );
}
