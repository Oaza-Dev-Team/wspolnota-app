'use server';

import { redirect } from 'next/navigation';
import { InviteError, redeemInvite } from '@/lib/accounts/manage';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/policy';

export type InviteState = { error?: string };

export async function redeemAction(
  _state: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  if (password !== repeat) return { error: 'Hasła nie są takie same' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków` };
  }

  try {
    await redeemInvite(token, password);
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }

  // Redeeming does not sign anyone in: the new password should be typed once
  // more before it is trusted, and the login screen is where that belongs.
  redirect('/logowanie?invited=1');
}
