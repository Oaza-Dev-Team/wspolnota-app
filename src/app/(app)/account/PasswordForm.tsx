'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/policy';
import { type PasswordState, changePasswordAction } from './actions';
import style from './account.module.css';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.button} disabled={pending}>
      {pending ? 'Zapisywanie…' : 'Zmień hasło'}
    </button>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className={style.form}>
      {state.error && (
        <p className={style.error} role="alert">
          {state.error}
        </p>
      )}

      {state.done && (
        <p className={style.done} role="status">
          Hasło zostało zmienione. Pozostałe zalogowane urządzenia zostały wylogowane.
        </p>
      )}

      <div className={style.field}>
        <label className={style.label} htmlFor="current">Obecne hasło</label>
        <input
          className={style.input}
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className={style.field}>
        <label className={style.label} htmlFor="next">
          {`Nowe hasło — co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
        </label>
        <input
          className={style.input}
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <div className={style.field}>
        <label className={style.label} htmlFor="repeat">Powtórz nowe hasło</label>
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
