'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { purgeCouple } from '@/lib/couples/purge';
import {
  MissingParish, NotFound, createCouple, deleteCouple, restoreCouple, updateCouple,
} from '@/lib/couples/save';
import { parseParishCell } from '@/lib/couples/columns';
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
  // Absent must mean absent. Number(null) is 0, and 0 is finite, so the
  // fallback below never fired for a field the form did not send — which is
  // every disabled one, because a disabled control is not submitted.
  if (typeof v !== 'string' || v.trim() === '') return fallback;
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

  const newCircleWanted = formData.get('circleId') === '__new__';

  // The parish arrives as text, whether picked from the suggestions or typed
  // fresh. Both take the same road: the save layer upserts on (name, city), so
  // a known parish is found and an unknown one created. Blank means the couple
  // inherits whichever parish its circle belongs to.
  const parishText = textOr(formData.get('parish')).trim();
  const parish = parishText === '' ? null : parseParishCell(parishText);
  if (parishText !== '' && parish === null) {
    return { error: 'Parafię podaj jako „nazwa, miasto" — np. św. Brygidy, Gdańsk' };
  }

  const parsed = saveSchema.safeParse({
    couple: {
      wifeName: textOr(formData.get('wifeName')),
      husbandName: textOr(formData.get('husbandName')),
      surname: textOr(formData.get('surname')),
      email: textOr(formData.get('email')),
      phone: textOr(formData.get('phone')),
      regionId: numberOr(formData.get('regionId'), u.regionId ?? 1),
      circleId: newCircleWanted ? null : emptyToNull(formData.get('circleId')),
      // A blank number would fail z.number().int() with a range message rather
      // than something the user can act on, so it is caught before parsing.
      newCircle: newCircleWanted
        ? {
            number: Number(textOr(formData.get('newCircleNumber'))),
            patron: textOr(formData.get('newCirclePatron')),
            // null: inherit whatever the parish field resolves to in this
            // same save, existing or freshly created.
            parishId: null,
          }
        : null,
      parishId: null,
      newParish: parish,
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
    // A new circle needs a parish; without one the row would violate the FK.
    if (e instanceof MissingParish) {
      return { error: 'Nowy krąg musi mieć parafię — wpisz ją w polu „Parafia"' };
    }
    throw e;
  }

  revalidatePath('/couples');
  redirect('/couples?saved=1');
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

  revalidatePath('/couples');
  redirect('/couples?deleted=1');
}

/**
 * Permanent erasure on request. The typed surname is the confirmation: an
 * "are you sure?" on an irreversible operation gets clicked through by reflex,
 * and this one cannot be undone by anything short of a database restore.
 */
export async function purgeCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();
  const id = emptyToNull(formData.get('id'));
  if (id === null) return { error: 'Brak identyfikatora pary' };

  const typed = textOr(formData.get('confirm')).trim();
  const surname = textOr(formData.get('surname')).trim();
  if (typed !== surname) {
    return { error: `Przepisz nazwisko „${surname}", żeby potwierdzić` };
  }

  try {
    await purgeCouple(u, BigInt(id));
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/couples');
  redirect('/couples?purged=1');
}

/**
 * The undo that soft deletion always implied. Whoever could delete the couple
 * can put it back — the write layer checks that, not this.
 */
export async function restoreCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();
  const id = emptyToNull(formData.get('id'));
  if (id === null) return { error: 'Brak identyfikatora pary' };

  try {
    await restoreCouple(u, BigInt(id));
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para nie jest usunięta' };
    throw e;
  }

  revalidatePath('/couples');
  revalidatePath('/regions');
  redirect('/couples?restored=1');
}
