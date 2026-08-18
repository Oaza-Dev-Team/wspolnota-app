'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/policy';
import style from '../../logowanie/login.module.css';
import { type InviteState, redeemAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.button} disabled={pending}>
      {pending ? 'Zapisywanie…' : 'Ustaw hasło'}
    </button>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<InviteState, FormData>(redeemAction, {});

  return (
    <form action={action} className={style.form}>
      {state.error && (
        <p className={style.error} role="alert">
          {state.error}
        </p>
      )}

      {/* The token travels in the body, not in the action URL: request paths
          end up in server logs and browser history, and this one is a
          credential. */}
      <input type="hidden" name="token" value={token} />

      <div className={style.field}>
        <label className={style.label} htmlFor="password">
          {`Nowe hasło — co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
        </label>
        <input
          className={style.input}
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <div className={style.field}>
        <label className={style.label} htmlFor="repeat">
          Powtórz hasło
        </label>
        <input
          className={style.input}
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
