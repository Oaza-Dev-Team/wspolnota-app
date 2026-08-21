'use server';

import { MIN_PASSWORD_LENGTH } from '@/lib/accounts/policy';
import { PasswordError, changeOwnPassword } from '@/lib/accounts/self';
import { requireUser, setSessionCookie } from '@/lib/auth/requireUser';

export type PasswordState = { error?: string; done?: boolean };

export async function changePasswordAction(
  _state: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  // A server action is a public POST endpoint. Session first, always — and
  // here the session is also the answer to whose password this is.
  const u = await requireUser();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  // The two typed-twice checks belong here rather than in the library: the
  // repeat field exists only on this form, and the length is worth saying
  // before the database is touched.
  if (next !== repeat) return { error: 'Nowe hasła nie są takie same' };
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków` };
  }

  let token: string;
  try {
    token = await changeOwnPassword(u, current, next);
  } catch (e) {
    if (e instanceof PasswordError) return { error: e.message };
    throw e;
  }

  // Changing the password ended every session, this one included. The fresh
  // token keeps the couple who made the change signed in.
  await setSessionCookie(token);
  return { done: true };
}
