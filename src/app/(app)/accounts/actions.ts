'use server';

import { revalidatePath } from 'next/cache';
import { createInvite, setAccountStatus } from '@/lib/accounts/manage';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';

export type AccountsState = { error?: string; inviteLink?: string };

function idFrom(formData: FormData): bigint | null {
  const raw = formData.get('id');
  return typeof raw === 'string' && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

export async function toggleAccountAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  // A server action is a public POST endpoint. Session first, always.
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  const next = formData.get('next') === 'disabled' ? 'disabled' : 'active';

  try {
    await setAccountStatus(u, id, next);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }

  revalidatePath('/accounts');
  return {};
}

export async function inviteAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  try {
    const token = await createInvite(u, id);
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    revalidatePath('/accounts');
    // The raw token exists only here; the row shows it once and it is never
    // recoverable afterwards, because only its digest was stored.
    return { inviteLink: `${base}/invite/${token}` };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }
}
