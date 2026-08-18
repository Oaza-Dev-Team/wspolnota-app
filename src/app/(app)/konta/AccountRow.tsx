'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountRow as Row } from '@/lib/accounts/list';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { regionColor } from '@/lib/domain/regions';
import { COUPLES, plural } from '@/lib/pl';
import { type AccountsState, inviteAction, toggleAccountAction } from './actions';
import style from './accounts.module.css';

const STATUS_LABEL: Record<Row['status'], string> = {
  active: 'aktywne',
  disabled: 'wyłączone',
  pending: 'oczekuje',
};

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

  const code = row.roman ?? 'MOD';
  const color = row.regionId === null ? 'var(--navy-700)' : regionColor(row.regionId);
  const scope =
    row.regionId === null
      ? 'Cała wspólnota · podgląd'
      : `Rejon ${row.roman} · ${plural(row.couples, COUPLES)}`;

  const error = toggleState.error ?? inviteState.error;

  return (
    <div className={style.row}>
      <span
        className={style.badge}
        style={{ '--region-color': color } as React.CSSProperties}
        aria-hidden="true"
      >
        {code}
      </span>

      <span className={style.identity}>
        <span className={style.name}>{row.name}</span>
        <span className={style.email}>{row.email}</span>
      </span>

      <span className={style.scope}>{scope}</span>
      <span className={style.lastLogin}>{row.lastLoginAt ?? '—'}</span>

      <span className={`${style.status} ${style[row.status]}`}>{STATUS_LABEL[row.status]}</span>

      {row.status === 'pending' ? (
        <form action={invite}>
          <input type="hidden" name="id" value={row.id} />
          <ActionButton label="Zaproś" />
        </form>
      ) : (
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

      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}

      {inviteState.inviteLink && (
        <p className={style.invite} role="status">
          {`Link zaproszenia — skopiuj i przekaż tej parze. Jest ważny ${INVITE_DAYS} dni i działa raz:`}
          <code className={style.inviteLink}>{inviteState.inviteLink}</code>
        </p>
      )}
    </div>
  );
}
