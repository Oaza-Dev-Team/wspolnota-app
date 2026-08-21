'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { beginEnrollment, finishEnrollment } from './actions';
import style from '../../login/login.module.css';

// Support never changes while the page is open, so there is nothing to
// subscribe to — this is a one-time client-only read, not a value that needs
// watching. useSyncExternalStore is what lets that read happen without
// setState inside an effect: getServerSnapshot answers "unknown" for the
// first paint (there is no `window` on the server to ask), and the real
// answer appears the moment React reconciles on the client.
const noSubscription = () => () => {};

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  // Asked before anything is offered: a button that cannot work is worse than
  // a sentence explaining why, and this is the moment we can tell.
  const supported = useSyncExternalStore(noSubscription, browserSupportsWebAuthn, () => null);
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
    } catch {
      // Includes the person closing the system dialog, which is not an error
      // worth alarming them about.
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
