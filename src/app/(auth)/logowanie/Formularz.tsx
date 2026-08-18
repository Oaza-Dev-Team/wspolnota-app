'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type StanLogowania, zaloguj } from './akcje';
import style from './logowanie.module.css';

function Przycisk() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.przycisk} disabled={pending}>
      {pending ? 'Logowanie…' : 'Zaloguj się'}
    </button>
  );
}

export function Formularz() {
  const [stan, akcja] = useActionState<StanLogowania, FormData>(zaloguj, {});

  return (
    <form action={akcja} className={style.formularz}>
      {stan.blad && (
        <p className={style.blad} role="alert">
          {stan.blad}
        </p>
      )}

      <div className={style.pole}>
        <label className={style.etykieta} htmlFor="email">Adres e-mail</label>
        <input
          className={style.input}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className={style.pole}>
        <label className={style.etykieta} htmlFor="haslo">Hasło</label>
        <input
          className={style.input}
          id="haslo"
          name="haslo"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Przycisk />
    </form>
  );
}
