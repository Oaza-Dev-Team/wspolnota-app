'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import { unstable_rethrow } from 'next/navigation';
import { useState } from 'react';
import { useWebAuthnSupport } from '@/hooks/useWebAuthnSupport';
import { beginSignIn, finishSignIn } from './actions';
import style from './login.module.css';

export function LoginForm() {
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginSignIn();
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się zalogować');
        return;
      }
      const response = await startAuthentication({ optionsJSON: begun.options });
      const done = await finishSignIn(response);
      if (done?.error) setError(done.error);
    } catch (e) {
      // finishSignIn ends with redirect(). Next.js signals that internally by
      // rejecting this very promise with a NEXT_REDIRECT-tagged error (see
      // server-action-reducer.js) — the navigation itself already happened
      // by the time we get here, but this catch would otherwise report it as
      // a failed sign-in. unstable_rethrow lets it through unchanged; any
      // other error falls through to the generic message below.
      unstable_rethrow(e);
      setError('Nie udało się zalogować. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <p className={style.error} role="alert">
        Ta przeglądarka nie obsługuje kluczy dostępu. Otwórz kartotekę w telefonie
        albo w aktualnej wersji Chrome lub Edge.
      </p>
    );
  }

  return (
    <div className={style.form}>
      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={style.button} onClick={signIn} disabled={busy}>
        {busy ? 'Logowanie…' : 'Zaloguj się kluczem'}
      </button>
      <p className={style.hint}>
        Nie masz klucza na tym urządzeniu? W oknie, które się pojawi, wybierz
        „Użyj innego urządzenia” i zeskanuj kod telefonem.
      </p>
    </div>
  );
}
