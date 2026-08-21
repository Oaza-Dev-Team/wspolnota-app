'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWebAuthnSupport } from '@/hooks/useWebAuthnSupport';
import { isCancelledCeremony } from '@/lib/auth/webauthn/cancelled';
import { beginEnrollment, finishEnrollment } from './actions';
import style from '../../login/login.module.css';

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  // Asked before anything is offered: a button that cannot work is worse than
  // a sentence explaining why, and this is the moment we can tell.
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enrol() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginEnrollment(token);
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się rozpocząć');
        return;
      }
      const response = await startRegistration({ optionsJSON: begun.options });
      const done = await finishEnrollment(token, response);
      if (done.error) {
        setError(done.error);
        return;
      }
      router.push('/account?welcome=1');
    } catch (e) {
      // Closing the system dialog is a decision, not a failure: the button is
      // simply ready again. Everything else keeps the message.
      if (isCancelledCeremony(e)) return;
      setError('Nie udało się utworzyć klucza. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <p className={style.error} role="alert">
        Ta przeglądarka nie obsługuje kluczy dostępu. Otwórz ten link w telefonie
        albo w aktualnej wersji Chrome lub Edge. Jeśli to nie pomoże, skontaktuj
        się z administratorem kartoteki.
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
      <button type="button" className={style.button} onClick={enrol} disabled={busy}>
        {busy ? 'Tworzenie klucza…' : 'Utwórz klucz'}
      </button>
    </div>
  );
}
