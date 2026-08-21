'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import { useWebAuthnSupport } from '@/hooks/useWebAuthnSupport';
import type { CredentialSummary } from '@/lib/auth/webauthn/credentials';
import { formatDate } from '@/lib/pl';
import { beginAddKey, finishAddKey, removeKeyAction, renameKeyAction } from './actions';
import style from './account.module.css';

// Mirrors MAX_LABEL in credentials.ts. Not imported: that module also pulls
// in Prisma, and this is a Client Component — a value import (unlike the
// type-only one above, which TypeScript erases entirely) would drag the
// database driver into the browser bundle.
const MAX_LABEL = 60;

type Props = {
  keys: CredentialSummary[];
  /** Just enrolled from an invitation — the one moment a second key is cheap to add. */
  welcome: boolean;
  /** Signed in by scanning a QR code, so no key lives on this device yet. */
  crossDevice: boolean;
};

export function KeyList({ keys, welcome, crossDevice }: Props) {
  // Asked before the add button is offered: a button that cannot work is
  // worse than a sentence explaining why. Renaming and removing need nothing
  // from the browser's WebAuthn API, so they stay available either way.
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // Keyed per credential, not one page-wide flag: removing one key must not
  // freeze the controls on the others, and disabling the button for its own
  // row is what stops a double-click from firing the same removal twice — the
  // second would otherwise hit a bare "record not found" instead of a clean
  // message, since the guard does not paper over that race.
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function addKey() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginAddKey();
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się dodać klucza');
        return;
      }
      const response = await startRegistration({ optionsJSON: begun.options });
      const done = await finishAddKey(response);
      if (done.error) setError(done.error);
    } catch {
      // Includes the person closing the system dialog, which is not an error
      // worth alarming them about.
      setError('Nie udało się dodać klucza. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setRemovingId(id);
    try {
      const done = await removeKeyAction(id);
      if (done.error) setError(done.error);
    } finally {
      setRemovingId(null);
    }
  }

  async function rename(id: string, label: string) {
    setEditing(null);
    setError(null);
    const done = await renameKeyAction(id, label);
    if (done.error) setError(done.error);
  }

  // role="status" rather than role="alert": this is advice, not a failure —
  // a screen reader interrupting for it would be wrong. Errors below stay
  // role="alert". Checked in this order because more than one can be true at
  // once (a fresh invitation always leaves exactly one key), and the most
  // specific, most urgent explanation should win.
  const notice = crossDevice
    ? 'Zalogowano kodem QR z telefonu — na tym urządzeniu nie masz jeszcze własnego '
      + 'klucza. Dodaj go teraz, a następnym razem zalogujesz się tutaj jednym '
      + 'dotknięciem, bez telefonu pod ręką.'
    : welcome
      ? 'Klucz dostępu utworzony. Dodaj teraz drugi, na przykład na telefonie — jeśli '
        + 'zgubisz to jedyne urządzenie, dostęp do kartoteki przywróci już tylko '
        + 'administrator.'
      : keys.length === 0
        ? 'Nie masz jeszcze żadnego klucza na tym koncie. Dodaj go teraz — bez klucza '
          + 'nikt się tym kontem nie zaloguje.'
        : keys.length === 1
          ? 'Masz zapisany tylko jeden klucz dostępu. Dodaj drugi na innym urządzeniu — '
            + 'zgubienie tego jednego oznacza utratę dostępu do kartoteki.'
          : null;

  return (
    <section className={style.panel}>
      <h2 className={style.heading}>Klucze dostępu</h2>

      {notice && (
        <p className={style.notice} role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}

      {supported === false ? (
        <p className={style.error} role="alert">
          Ta przeglądarka nie obsługuje kluczy dostępu. Otwórz kartotekę w telefonie
          albo w aktualnej wersji Chrome lub Edge, żeby dodać kolejny klucz.
        </p>
      ) : (
        supported === true && (
          <button type="button" className={style.button} onClick={addKey} disabled={busy}>
            {busy ? 'Dodawanie…' : 'Dodaj urządzenie'}
          </button>
        )
      )}

      <ul className={style.keys}>
        {keys.map((key) => (
          <li key={key.id} className={style.key}>
            {editing === key.id ? (
              <form
                className={style.rename}
                action={(data) => rename(key.id, String(data.get('label') ?? ''))}
              >
                <label className={style.srOnly} htmlFor={`label-${key.id}`}>
                  {`Nazwa klucza „${key.label}"`}
                </label>
                <input
                  className={style.input}
                  id={`label-${key.id}`}
                  name="label"
                  defaultValue={key.label}
                  maxLength={MAX_LABEL}
                  autoFocus
                />
                <span className={style.renameButtons}>
                  <button type="submit" className={style.linkButton}>
                    Zapisz
                  </button>
                  <button
                    type="button"
                    className={style.linkButton}
                    onClick={() => setEditing(null)}
                  >
                    Anuluj
                  </button>
                </span>
              </form>
            ) : (
              <>
                <span className={style.keyInfo}>
                  <span className={style.keyLabel}>{key.label}</span>
                  <span className={style.keyMeta}>
                    {`dodany ${formatDate(key.createdAt)} · `}
                    {key.lastUsedAt
                      ? `ostatnie użycie ${formatDate(key.lastUsedAt)}`
                      : 'jeszcze nieużywany'}
                  </span>
                </span>
                <span className={style.keyActions}>
                  <button
                    type="button"
                    className={style.linkButton}
                    onClick={() => setEditing(key.id)}
                    aria-label={`Zmień nazwę klucza „${key.label}"`}
                  >
                    Zmień nazwę
                  </button>
                  {/* Hidden rather than shown-and-refused: the server still
                      enforces this (see removeKeyAction), but a lone key is
                      never something this page should let you aim at. */}
                  {keys.length > 1 && (
                    <button
                      type="button"
                      className={style.linkButton}
                      onClick={() => remove(key.id)}
                      disabled={removingId === key.id}
                      aria-label={
                        removingId === key.id
                          ? `Usuwanie klucza „${key.label}"…`
                          : `Usuń klucz „${key.label}"`
                      }
                    >
                      {removingId === key.id ? 'Usuwanie…' : 'Usuń'}
                    </button>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
