import {
  type PublicKeyCredentialRequestOptionsJSON,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';
import { createSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { rememberChallenge } from './challenge';
import { rpConfig } from './config';
import { checkCounter } from './policy';

export class SignInError extends Error {
  constructor() {
    // One message for everything: unknown key, disabled account, account still
    // holding an invitation. Telling them apart would answer questions the
    // sign-in screen has no business answering.
    super('Nie udało się zalogować tym kluczem');
    this.name = 'SignInError';
  }
}

export async function authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = rpConfig();

  const options = await generateAuthenticationOptions({
    rpID,
    // Deliberately empty. Listing the account's credentials would require
    // knowing the account, which would require an e-mail field, which would
    // make the form a way of discovering who has an account. Discoverable
    // credentials let the browser answer instead.
    allowCredentials: [],
    userVerification: 'required',
  });

  await rememberChallenge(options.challenge, 'authentication');
  return options;
}

export async function resolveCredential(credentialId: string) {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { account: true },
  });
  if (!credential) throw new SignInError();
  return { credential, account: credential.account };
}

/**
 * Runs after the signature has been verified. Returns the raw session token —
 * the only moment it exists outside the cookie — and the caller puts it there.
 */
export async function completeSignIn(
  credentialId: string,
  accountId: bigint,
  newCounter: bigint,
): Promise<string> {
  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential || credential.accountId !== accountId) throw new SignInError();

  // Before anything is written: a counter that failed to advance means a
  // replay or a copied authenticator.
  checkCounter(credential.counter, newCounter);

  // findUnique, not findUniqueOrThrow: the GDPR permanent-deletion path
  // (src/lib/accounts/manage.ts) really does tx.account.delete an account, so
  // a row that vanished between the credential read and here must fail
  // through SignInError too — never a raw Prisma not-found leaking out of
  // this function's one-message-for-everything door.
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  // Re-checked here rather than trusted from the lookup: an account disabled
  // between the challenge and the signature must not get in.
  if (!account || account.status !== 'active') throw new SignInError();

  await prisma.$transaction([
    prisma.credential.update({
      where: { id: credentialId },
      data: { counter: newCounter, lastUsedAt: new Date() },
    }),
    prisma.account.update({ where: { id: accountId }, data: { lastLoginAt: new Date() } }),
  ]);

  return createSession(accountId);
}
