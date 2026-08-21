'use server';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/requireUser';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import {
  LastKeyError,
  UnknownKeyError,
  removeCredential,
  renameCredential,
} from '@/lib/auth/webauthn/credentials';
import { labelFor, registrationOptions, saveCredential } from '@/lib/auth/webauthn/register';

export type KeyState = { error?: string };

function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

// A server action is a public POST endpoint; no layout protects it. Every
// action here starts with requireUser() before touching Prisma, and the
// session — never a parameter from the form — is the answer to whose key
// this is. An action that took an account id as an argument would let one
// account manage another's keys.

export async function beginAddKey(): Promise<
  { options: PublicKeyCredentialCreationOptionsJSON } | KeyState
> {
  const u = await requireUser();
  return { options: await registrationOptions(u.id) };
}

export async function finishAddKey(response: RegistrationResponseJSON): Promise<KeyState> {
  const u = await requireUser();
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);

  try {
    const { accountId } = await consumeChallenge(challenge, 'registration');
    if (accountId !== u.id) return { error: 'Nie udało się dodać klucza' };

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Nie udało się dodać klucza' };
    }

    const { credential } = verification.registrationInfo;
    await saveCredential(u.id, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      label: labelFor(response.authenticatorAttachment, credential.transports ?? []),
    });
  } catch (e) {
    if (e instanceof ChallengeError) return { error: e.message };
    throw e;
  }

  revalidatePath('/account');
  return {};
}

export async function renameKeyAction(id: string, label: string): Promise<KeyState> {
  const u = await requireUser();
  try {
    await renameCredential(u.id, id, label);
  } catch (e) {
    // Not credentials' SignInError — that module has no reason to know this
    // page exists. Renaming happens while signed in, on the account's own
    // page, so the failure a stale or already-removed row produces here is
    // UnknownKeyError (see credentials.ts).
    if (e instanceof UnknownKeyError) return { error: e.message };
    throw e;
  }
  revalidatePath('/account');
  return {};
}

export async function removeKeyAction(id: string): Promise<KeyState> {
  const u = await requireUser();
  try {
    await removeCredential(u.id, id);
  } catch (e) {
    // LastKeyError guards the lockout this page exists to prevent.
    // UnknownKeyError covers the same stale-row case as rename above — for
    // example two tabs, or a doubled click that outran per-row disabling.
    if (e instanceof LastKeyError || e instanceof UnknownKeyError) return { error: e.message };
    throw e;
  }
  revalidatePath('/account');
  return {};
}
