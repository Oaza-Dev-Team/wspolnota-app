'use server';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { InviteError, accountForInvite } from '@/lib/accounts/manage';
import { setSessionCookie } from '@/lib/auth/requireUser';
import { createSession } from '@/lib/auth/session';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import { labelFor, registrationOptions, saveCredential } from '@/lib/auth/webauthn/register';

export type EnrollState = { error?: string };

/** The challenge the browser actually signed, read back out of the response so
 * the server can look up the row it issued. */
function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

export async function beginEnrollment(
  token: string,
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON } | EnrollState> {
  try {
    const accountId = await accountForInvite(token);
    return { options: await registrationOptions(accountId) };
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }
}

export async function finishEnrollment(
  token: string,
  response: RegistrationResponseJSON,
): Promise<EnrollState> {
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);

  try {
    const accountId = await accountForInvite(token);

    const { accountId: challengeOwner } = await consumeChallenge(challenge, 'registration');
    // The challenge was issued for one account; a response carrying somebody
    // else's is not a registration we asked for.
    if (challengeOwner !== accountId) return { error: 'Nie udało się zarejestrować klucza' };

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // The whole design rests on this: without user verification a passkey is
      // possession alone, not two factors.
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Nie udało się zarejestrować klucza' };
    }

    const { credential } = verification.registrationInfo;
    await saveCredential(accountId, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      label: labelFor(response.authenticatorAttachment, credential.transports ?? []),
    });

    // createSession directly, NOT completeSignIn: that one guards against a
    // counter which failed to advance, and a key registered a line ago has by
    // definition not advanced past the value just stored. The signature has
    // already been verified here, so there is nothing left for it to check.
    //
    // Signed in at all because the old flow's reasoning is gone: it made the
    // person type the new password once more before trusting it, and a
    // signature repeated proves nothing. This is also the only moment we know
    // they are at the screen, which is where the second-key prompt belongs.
    await setSessionCookie(await createSession(accountId));
    return {};
  } catch (e) {
    if (e instanceof InviteError || e instanceof ChallengeError) return { error: e.message };
    throw e;
  }
}
