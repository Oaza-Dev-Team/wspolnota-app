'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { NotFound, createCouple, deleteCouple, updateCouple } from '@/lib/couples/save';
import { saveSchema } from '@/lib/couples/schema';

export type CardState = { error?: string };

function textOr(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = textOr(v);
  return s === '' ? null : s;
}

function numberOr(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A server action is a public POST endpoint. requireUser comes first and the
 * write layer checks permissions again — the protected layout does not cover
 * this call, and a hidden button proves nothing.
 */
export async function saveCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();

  // The form ships the entries as JSON with the year as a string, because that
  // is what a text input produces; the schema wants a number.
  const rawEntries = JSON.parse(textOr(formData.get('retreats')) || '[]') as {
    kind: string; year: string; place: string; name: string;
  }[];

  const parsed = saveSchema.safeParse({
    couple: {
      wifeName: textOr(formData.get('wifeName')),
      husbandName: textOr(formData.get('husbandName')),
      surname: textOr(formData.get('surname')),
      email: textOr(formData.get('email')),
      phone: textOr(formData.get('phone')),
      regionId: numberOr(formData.get('regionId'), u.regionId ?? 1),
      circleId: emptyToNull(formData.get('circleId')),
      newCircle: null,
      parishId: emptyToNull(formData.get('parishId')),
      newParish: null,
      children: textOr(formData.get('children')),
      notes: textOr(formData.get('notes')),
    },
    retreats: rawEntries.map((r) => ({ ...r, year: Number(r.year) })),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Popraw dane w formularzu' };
  }

  const id = emptyToNull(formData.get('id'));

  try {
    if (id === null) await createCouple(u, parsed.data);
    else await updateCouple(u, BigInt(id), parsed.data);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect('/pary?saved=1');
}

export async function deleteCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();
  const id = emptyToNull(formData.get('id'));
  if (id === null) return { error: 'Brak identyfikatora pary' };

  try {
    await deleteCouple(u, BigInt(id));
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect('/pary?deleted=1');
}
