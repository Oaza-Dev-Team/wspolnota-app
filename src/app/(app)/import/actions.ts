'use server';

import { revalidatePath } from 'next/cache';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { type ImportIssue, analyzeWorkbook, applyImport } from '@/lib/couples/import';

export type ImportState = {
  error?: string;
  issues?: ImportIssue[];
  toCreate?: number;
  toUpdate?: number;
  applied?: { created: number; updated: number };
};

/**
 * One action for both steps, told apart by the submit button that sent the
 * form. The plan allowed for two forms passing the file between them through
 * DataTransfer; a single form needs none of that, because the file input keeps
 * its file across the preview render.
 */
export async function importAction(
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  // A server action is a public POST endpoint. Session first, always.
  const u = await requireUser();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Wybierz plik XLSX' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  let plan;
  try {
    plan = await analyzeWorkbook(u, buffer);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { error: 'Nie udało się odczytać pliku. Czy to na pewno XLSX?' };
  }

  const preview: ImportState = {
    issues: plan.issues,
    toCreate: plan.toCreate.length,
    toUpdate: plan.toUpdate.length,
  };

  if (formData.get('intent') !== 'apply') return preview;

  // The file is read again on confirmation rather than the plan being carried
  // through the form: a plan holds bigint and nested objects that FormData
  // cannot express, and re-reading means the user commits what the file says
  // now, not what it said when the preview was drawn.
  if (plan.issues.length > 0) {
    return { ...preview, error: 'Plik nadal zawiera błędy — nic nie zapisano' };
  }

  try {
    const applied = await applyImport(u, plan);
    revalidatePath('/couples');
    return { applied };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { ...preview, error: 'Import się nie powiódł — nic nie zapisano' };
  }
}
