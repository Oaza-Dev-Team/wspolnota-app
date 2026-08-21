'use server';

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearAttempts, isRateLimited, recordAttempt } from '@/lib/auth/rateLimit';
import { setSessionCookie } from '@/lib/auth/requireUser';
import {
  SignInError,
  authenticationOptions,
  completeSignIn,
  resolveCredential,
} from '@/lib/auth/webauthn/authenticate';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import { ClonedKeyError } from '@/lib/auth/webauthn/policy';

export type LoginState = { error?: string };

function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

/**
 * The counter is per address, never global: one shared bucket would mean the
 * fifteen accounts locking each other out. The sign-in form no longer asks for
 * an e-mail, so the address is the only key left — and the right one, since
 * what is being limited is challenge rows, not guesses at a secret.
 */
async function limitKey(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return `ip:${forwarded?.split(',')[0]?.trim() ?? 'unknown'}`;
}

export async function beginSignIn(): Promise<
  { options: PublicKeyCredentialRequestOptionsJSON } | LoginState
> {
  // A signature is not guessable, so this no longer defends the password it
  // once did. It stays to keep the challenge table from being flooded.
  const key = await limitKey();
  if (await isRateLimited(key)) {
    return { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' };
  }
  await recordAttempt(key);
  return { options: await authenticationOptions() };
}

export async function finishSignIn(response: AuthenticationResponseJSON): Promise<LoginState> {
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);
  // A signature that arrived from another device means this one was reached by
  // scanning a QR code — the hardest path we offer, and the one nobody wants
  // to repeat weekly. The response says so, so we can catch that moment and
  // offer to store a key here instead. Redirecting to /account rather than
  // showing a banner over the list keeps the offer next to the button that
  // acts on it.
  const crossDevice = response.authenticatorAttachment === 'cross-platform';

  try {
    await consumeChallenge(challenge, 'authentication');
    const { credential, account } = await resolveCredential(response.id);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as never,
      },
      // The second factor. Never leave this at its default.
      requireUserVerification: true,
    });

    if (!verification.verified) throw new SignInError();

    const token = await completeSignIn(
      credential.id,
      account.id,
      BigInt(verification.authenticationInfo.newCounter),
    );
    await setSessionCookie(token);
    // Whoever got in is not the traffic the limiter is for. Without this a
    // couple signing in from one address every week would eventually meet
    // their own earlier attempts.
    await clearAttempts(await limitKey());
  } catch (e) {
    if (e instanceof SignInError || e instanceof ChallengeError || e instanceof ClonedKeyError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(crossDevice ? '/account?crossDevice=1' : '/couples');
}
