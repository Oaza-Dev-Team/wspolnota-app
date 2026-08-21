'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import { unstable_rethrow } from 'next/navigation';
import { useState } from 'react';
import { useWebAuthnSupport } from '@/hooks/useWebAuthnSupport';
import { isCancelledCeremony } from '@/lib/auth/webauthn/cancelled';
import { beginSignIn, finishSignIn } from './actions';
import style from './login.module.css';

export function LoginForm() {
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error` on purpose: one of these is a failure and the
  // other is not, and they must not look alike. See the catch below.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    setNotice(null);
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
      // NotAllowedError means one of two things, and WebAuthn refuses to say
      // which: the person backed out of the system dialog, or this device
      // holds no key for the site. The specification conflates them
      // deliberately, so that a page cannot find out whether somebody has a
      // credential — the same privacy reasoning that removed the e-mail field.
      //
      // So: not the red box, which this audience reads as "I broke it", and
      // not silence either, which would leave the second case with a button
      // that appears to do nothing. A calm notice covers both readings, and
      // the standing hint below the button says what to do about the second.
      //
      // Nothing leaks by treating this case apart: the browser raises it
      // before any request is sent, so it cannot depend on anything the
      // server knows. Every refusal that DOES come from the server — unknown
      // key, disabled account, counter, rate limit — still renders the one
      // identical message below.
      if (isCancelledCeremony(e)) {
        setNotice('Logowanie przerwane — nie wybrano klucza. Możesz spróbować jeszcze raz.');
        return;
      }
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
      {/* role="status", not "alert": nothing failed, so a screen reader has
          no reason to interrupt for it. */}
      {notice && (
        <p className={style.notice} role="status">
          {notice}
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
