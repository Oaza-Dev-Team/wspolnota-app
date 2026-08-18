'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type LoginState, signIn } from './actions';
import style from './login.module.css';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.button} disabled={pending}>
      {pending ? 'Logowanie…' : 'Zaloguj się'}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className={style.form}>
      {state.error && (
        <p className={style.error} role="alert">
          {state.error}
        </p>
      )}

      <div className={style.field}>
        <label className={style.label} htmlFor="email">Adres e-mail</label>
        <input
          className={style.input}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className={style.field}>
        <label className={style.label} htmlFor="password">Hasło</label>
        <input
          className={style.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
