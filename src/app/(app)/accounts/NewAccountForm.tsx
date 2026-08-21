'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { romanNumeral } from '@/lib/domain/regions';
import { type AccountKind, type AccountsState, createAccountAction } from './actions';
import style from './accounts.module.css';

const KIND_LABEL: Record<AccountKind, string> = {
  superadmin: 'Konto techniczne',
  admin: 'Para odpowiedzialna za wspólnotę',
  'region-lead': 'Para odpowiedzialna za rejon',
  'region-helper': 'Pomocnik rejonu',
  viewer: 'Moderator — tylko podgląd',
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.action} disabled={pending}>
      {pending ? '…' : 'Utwórz konto'}
    </button>
  );
}

/**
 * Until this existed, accounts came only from the seed and from the bootstrap
 * script. A new account starts where every account starts: `pending`, holding
 * a one-time invitation the caller passes on by hand — there is no SMTP in
 * this project.
 */
export function NewAccountForm({
  kinds,
  freeRegions,
  allRegions,
}: {
  /** What this caller may create. An admin never sees the technical account here. */
  kinds: AccountKind[];
  /** Regions with no responsible couple yet — only that role is limited to one. */
  freeRegions: number[];
  /** Every region: a helper may join one that already has a responsible couple. */
  allRegions: number[];
}) {
  const [state, create] = useActionState<AccountsState, FormData>(createAccountAction, {});
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AccountKind>(kinds[0] ?? 'viewer');

  // Collapse once the account exists, stay open when it did not — the message
  // is about what the caller just typed and closing would hide the field it
  // refers to. Adjusting state while rendering rather than in an effect is the
  // documented way to react to a value that changed underneath.
  const [seenLink, setSeenLink] = useState<string | undefined>(undefined);
  if (state.inviteLink !== seenLink) {
    setSeenLink(state.inviteLink);
    if (state.inviteLink !== undefined) setOpen(false);
  }

  // Both live outside the form so that collapsing it does not take away the
  // only copy of an invitation that exists nowhere else. The group around
  // them is what gives the alert a scope: Next renders its own role="alert"
  // route announcer, so a bare lookup finds two.
  const notices = (
    <>
      {state.error && (
        <p className={style.error} role="alert">
          {state.error}
        </p>
      )}
      {state.inviteLink && (
        <p className={style.invite} role="status">
          {`Link zaproszenia — skopiuj i przekaż tej parze. Jest ważny ${INVITE_DAYS} dni i działa raz:`}
          <code className={style.inviteLink}>{state.inviteLink}</code>
        </p>
      )}
    </>
  );

  if (!open) {
    return (
      <div className={style.newAccountBar} role="group" aria-label="Dodawanie konta">
        <button type="button" className={style.action} onClick={() => setOpen(true)}>
          + Dodaj konto
        </button>
        {notices}
      </div>
    );
  }

  const regions = kind === 'region-lead' ? freeRegions : allRegions;
  const needsRegion = kind === 'region-lead' || kind === 'region-helper';
  const regionsExhausted = needsRegion && regions.length === 0;

  return (
    <div className={style.newAccountBar} role="group" aria-label="Dodawanie konta">
      {/*
        Named so a test — and a screen reader — can address the fields inside
        it. Every row on this page carries buttons whose aria-label mentions
        "adres e-mail" and "rejon", and those match a bare field lookup.
      */}
      <form action={create} className={style.newAccount} aria-label="Nowe konto">
        <p className={style.handoverNote}>
          Konto powstaje bez klucza dostępu. Dostaniesz jednorazowy link, który przekazujesz tej
          parze — dopiero ona rejestruje na nim swój klucz.
        </p>

        <label className={style.editField}>
          <span className={style.editLabel}>Nazwa pary</span>
          <input
            className={style.editInput}
            name="name"
            placeholder="np. Ewa i Jan Cichy"
            autoFocus
            required
          />
        </label>

        <label className={style.editField}>
          <span className={style.editLabel}>Adres e-mail</span>
          <input
            className={style.editInput}
            name="email"
            type="email"
            placeholder="np. cichy@example.pl"
            required
          />
        </label>

        {/*
          aria-label on the selects below: a wrapping label lends a select an
          accessible name assembled from the label's whole text content, and
          that content includes every option. Without it "Rola" never matches
          exactly and "Rejon" matches the option reading "Para rejonowa".
        */}
        <label className={style.editField}>
          <span className={style.editLabel}>Rola</span>
          <select
            className={style.editInput}
            name="role"
            aria-label="Rola konta"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as AccountKind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>

        {needsRegion && !regionsExhausted && (
          <label className={style.editField}>
            <span className={style.editLabel}>Rejon</span>
            <select
              className={style.editInput}
              name="regionId"
              aria-label="Rejon konta"
              required
            >
              {regions.map((id) => (
                <option key={id} value={id}>{`Rejon ${romanNumeral(id)}`}</option>
              ))}
            </select>
          </label>
        )}

        {regionsExhausted && (
          <p className={style.handoverNote}>
            Każdy rejon ma już parę odpowiedzialną. Żeby ją zmienić, użyj
            „Przekaż rejon…” w jej wierszu — to odbiera dostęp ustępującej parze.
            Kogoś do pomocy dołożysz przez „Pomocnik rejonu”.
          </p>
        )}

        <span className={style.handoverButtons}>
          {!regionsExhausted && <SubmitButton />}
          <button type="button" className={style.action} onClick={() => setOpen(false)}>
            Anuluj
          </button>
        </span>
      </form>
      {notices}
    </div>
  );
}
