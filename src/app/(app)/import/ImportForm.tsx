'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RECORDS, ROWS, plural } from '@/lib/pl';
import { type ImportState, importAction } from './actions';
import style from './import.module.css';

function Submit({
  intent,
  label,
  busy,
  variant,
}: {
  intent: 'analyze' | 'apply';
  label: string;
  busy: string;
  variant: 'primary' | 'confirm';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      className={variant === 'confirm' ? style.confirm : style.primary}
      disabled={pending}
    >
      {pending ? busy : label}
    </button>
  );
}

export function ImportForm() {
  const [state, act] = useActionState<ImportState, FormData>(importAction, {});
  const [fileChosen, setFileChosen] = useState(false);

  const issues = state.issues;
  const analyzed = issues !== undefined && !state.applied;
  const total = (state.toCreate ?? 0) + (state.toUpdate ?? 0);
  const ready = analyzed && issues.length === 0 && total > 0;

  return (
    <div className={style.wrapper}>
      <p className={style.hint}>
        Nie masz pliku w tym układzie?{' '}
        <a href="/eksport/szablon" className={style.link}>
          Pobierz pusty szablon
        </a>{' '}
        albo wyeksportuj obecną kartotekę i popraw ją w arkuszu.
      </p>

      {/*
        One form for both steps, told apart by the submit button. The chosen
        file survives the preview render, so confirming re-submits the same
        input and no copying between forms is needed.
      */}
      <form action={act} className={style.form}>
        <div className={style.row}>
          <label className={style.field}>
            <span className={style.label}>Plik XLSX</span>
            <input
              className={style.file}
              type="file"
              name="file"
              accept=".xlsx"
              required
              onChange={(e) => setFileChosen(e.currentTarget.files!.length > 0)}
            />
          </label>
          <Submit intent="analyze" label="Sprawdź plik" busy="Sprawdzam…" variant="primary" />
        </div>

        {state.error && (
          <p className={style.error} role="alert">
            {state.error}
          </p>
        )}

        {state.applied && (
          <p className={style.success} role="status">
            Zaimportowano: {plural(state.applied.created, RECORDS)} nowych,{' '}
            {plural(state.applied.updated, RECORDS)} zaktualizowanych.
          </p>
        )}

        {analyzed && (
          <section className={style.preview}>
            <h2 className={style.previewTitle}>Podgląd</h2>
            <p className={style.summary}>
              Do dodania: <strong>{state.toCreate}</strong>
              {' · '}
              Do aktualizacji: <strong>{state.toUpdate}</strong>
              {' · '}
              Z błędami: <strong>{issues.length}</strong>
            </p>

            {issues.length > 0 && (
              <ul className={style.issues}>
                {issues.map((issue) => (
                  <li key={`${issue.row}-${issue.message}`} className={style.issue}>
                    <span className={style.issueRow}>wiersz {issue.row}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}

            {ready ? (
              <>
                <p className={style.hint}>
                  Sprawdź liczby powyżej — zapis obejmie {plural(total, ROWS)}.
                </p>
                <Submit
                  intent="apply"
                  label="Zatwierdź import"
                  busy="Importuję…"
                  variant="confirm"
                />
              </>
            ) : (
              <p className={style.hint}>
                {issues.length > 0
                  ? 'Popraw wskazane wiersze w pliku i wgraj go ponownie. Nic nie zostało zapisane.'
                  : 'Plik nie zawiera żadnych wierszy do zapisania.'}
              </p>
            )}
          </section>
        )}
      </form>

      {!fileChosen && !state.applied && !analyzed && (
        <p className={style.hint}>Wybierz plik, żeby zobaczyć podgląd.</p>
      )}
    </div>
  );
}
