import {
  type PublicKeyCredentialCreationOptionsJSON,
  generateRegistrationOptions,
} from '@simplewebauthn/server';
import { prisma } from '@/lib/db';
import { rememberChallenge } from './challenge';
import { RP_NAME, rpConfig } from './config';

export type VerifiedCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[];
  label: string;
};

/**
 * The list in /account has to distinguish one key from another, and nobody
 * wants to read "internal" there. The guess is deliberately coarse; the point
 * is a starting name the person can change, not accuracy.
 */
export function labelFor(attachment: string | undefined, transports: string[]): string {
  if (transports.includes('usb') || transports.includes('nfc')) return 'Kluczyk USB';
  if (transports.includes('hybrid')) return 'Telefon';
  if (attachment === 'platform' || transports.includes('internal')) return 'To urządzenie';
  return 'Klucz dostępu';
}

export async function registrationOptions(
  accountId: bigint,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = rpConfig();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { email: true, name: true, webauthnUserId: true },
  });

  const existing = await prisma.credential.findMany({
    where: { accountId },
    select: { id: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // Opaque and stored on the authenticator; the WebAuthn spec forbids
    // anything personal here. The name and display name below are the
    // readable half, and they are what the picker shows the person.
    // webauthnUserId is a hyphenated UUID (see Account.webauthnUserId), not
    // base64url, so it is encoded as raw UTF-8 bytes rather than decoded as
    // base64url. Nothing reads the handle back — a sign-in resolves the
    // account through the credential relation — so there is no decode side
    // that has to match this encoding.
    userID: new TextEncoder().encode(account.webauthnUserId),
    userName: account.email,
    userDisplayName: account.name,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      // Discoverable, so signing in needs no e-mail field — which also means
      // the form cannot be used to find out who has an account.
      residentKey: 'required',
      // Load-bearing: this is the second factor. Without it a passkey is
      // possession alone.
      userVerification: 'required',
    },
  });

  await rememberChallenge(options.challenge, 'registration', accountId);
  return options;
}

/**
 * Writes the key and everything that must be true at the same moment: the
 * account becomes usable, the invitation stops working, and the history says
 * so. One transaction, per the project rule about audit.
 */
export async function saveCredential(
  accountId: bigint,
  credential: VerifiedCredential,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.credential.create({
      data: {
        id: credential.id,
        accountId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
        label: credential.label,
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: { status: 'active', inviteTokenHash: null, inviteExpiresAt: null },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Zarejestrowano klucz dostępu: „${credential.label}"`,
        accountId,
      },
    });
  });
}
