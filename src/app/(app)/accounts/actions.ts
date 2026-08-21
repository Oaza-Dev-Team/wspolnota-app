'use server';

import { revalidatePath } from 'next/cache';
import {
  AccountNameError, AccountRegionError, EmailError, changeEmail, createAccount,
  createInvite, deleteAccount, handOverRegion, renameAccount, setAccountStatus,
} from '@/lib/accounts/manage';
import type { Role } from '@/generated/prisma/enums';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';

export type AccountsState = { error?: string; inviteLink?: string };

/**
 * The raw token exists only in the response that carries it: the database
 * keeps a digest, so the link is unrecoverable once the screen is gone.
 */
function inviteUrl(token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return `${base}/invite/${token}`;
}

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
    revalidatePath('/accounts');
    return { inviteLink: inviteUrl(token) };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }
}

export async function renameAccountAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  const name = formData.get('name');
  if (typeof name !== 'string') return { error: 'Podaj nazwę pary' };

  try {
    await renameAccount(u, id, name);
  } catch (e) {
    if (e instanceof Forbidden || e instanceof AccountNameError) return { error: e.message };
    throw e;
  }

  revalidatePath('/accounts');
  // The regions overview shows the same name on its tiles.
  revalidatePath('/regions');
  return {};
}

export async function changeEmailAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  const email = formData.get('email');
  if (typeof email !== 'string') return { error: 'Podaj adres e-mail' };

  try {
    await changeEmail(u, id, email);
  } catch (e) {
    if (e instanceof Forbidden || e instanceof EmailError) return { error: e.message };
    throw e;
  }

  revalidatePath('/accounts');
  return {};
}

export async function handOverAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  const name = formData.get('name');
  const email = formData.get('email');
  if (typeof name !== 'string' || typeof email !== 'string') {
    return { error: 'Podaj nazwę pary i adres e-mail' };
  }

  let token: string;
  try {
    token = await handOverRegion(u, id, name, email);
  } catch (e) {
    if (e instanceof Forbidden || e instanceof EmailError || e instanceof AccountNameError) {
      return { error: e.message };
    }
    throw e;
  }

  revalidatePath('/accounts');
  revalidatePath('/regions');
  // The incoming couple has no key yet, so the invite is the whole point
  // of the operation and has to come back to the screen.
  return { inviteLink: inviteUrl(token) };
}

/**
 * What the form offers, which is not quite the role: a region account is
 * either the couple responsible for the region or one of its helpers, and
 * those two read as separate choices to whoever fills the form in even though
 * no permission tells them apart.
 */
const KINDS = {
  superadmin: { role: 'superadmin', regionLead: false },
  admin: { role: 'admin', regionLead: false },
  'region-lead': { role: 'region', regionLead: true },
  'region-helper': { role: 'region', regionLead: false },
  viewer: { role: 'viewer', regionLead: false },
} as const satisfies Record<string, { role: Role; regionLead: boolean }>;

export type AccountKind = keyof typeof KINDS;

function kindFrom(formData: FormData): (typeof KINDS)[AccountKind] | null {
  const raw = formData.get('role');
  // Anything else in the POST body is somebody probing.
  return typeof raw === 'string' && raw in KINDS ? KINDS[raw as AccountKind] : null;
}

export async function createAccountAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();

  const kind = kindFrom(formData);
  if (kind === null) return { error: 'Wybierz rolę konta' };

  const name = formData.get('name');
  const email = formData.get('email');
  if (typeof name !== 'string' || typeof email !== 'string') {
    return { error: 'Podaj nazwę pary i adres e-mail' };
  }

  // Only a region account carries one, and the select that offers it is hidden
  // for every other role — so an absent value here is the normal case.
  const rawRegion = formData.get('regionId');
  const regionId = typeof rawRegion === 'string' && /^\d+$/.test(rawRegion)
    ? Number(rawRegion)
    : null;

  let token: string;
  try {
    token = await createAccount(u, { name, email, regionId, ...kind });
  } catch (e) {
    if (
      e instanceof Forbidden || e instanceof EmailError
      || e instanceof AccountNameError || e instanceof AccountRegionError
    ) {
      return { error: e.message };
    }
    throw e;
  }

  revalidatePath('/accounts');
  revalidatePath('/regions');
  // The account has no password: without this link nobody can ever use it.
  return { inviteLink: inviteUrl(token) };
}

export async function deleteAccountAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  try {
    await deleteAccount(u, id);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }

  revalidatePath('/accounts');
  // The regions overview names the responsible couple, which may be the one
  // that just went, and the history renders the entries it left behind.
  revalidatePath('/regions');
  revalidatePath('/history');
  return {};
}
