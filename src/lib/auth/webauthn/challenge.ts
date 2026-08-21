import type { ChallengePurpose } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

/**
 * A WebAuthn signature proves possession of a key over a value the server
 * chose. That only means anything if the server picked the value, has not
 * accepted it before, and picked it recently — so the value lives here rather
 * than in a cookie, and is deleted the moment it is spent.
 */

export const CHALLENGE_SECONDS = 60;

export class ChallengeError extends Error {
  constructor() {
    // One message for every failure: unknown, expired, spent, and issued for
    // the other ceremony are the same event from the browser's side, and
    // telling them apart would only help somebody probing.
    super('Sesja logowania wygasła — spróbuj jeszcze raz');
    this.name = 'ChallengeError';
  }
}

export async function rememberChallenge(
  challenge: string,
  purpose: ChallengePurpose,
  accountId?: bigint,
): Promise<void> {
  await prisma.webauthnChallenge.create({
    data: {
      challenge,
      purpose,
      accountId: accountId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000),
    },
  });
}

export async function consumeChallenge(
  challenge: string,
  purpose: ChallengePurpose,
): Promise<{ accountId: bigint | null }> {
  // DELETE ... RETURNING in one statement rather than find-then-delete: the
  // delete IS the claim on the challenge, so two requests racing on the same
  // value cannot both win it, and the account id still comes back. Prisma's
  // deleteMany cannot return the deleted row, which is why this is raw SQL.
  const rows = await prisma.$queryRaw<{ account_id: bigint | null }[]>`
    DELETE FROM "webauthn_challenge"
    WHERE "challenge" = ${challenge}
      AND "purpose" = ${purpose}::"ChallengePurpose"
      AND "expires_at" > NOW()
    RETURNING "account_id"
  `;

  const row = rows[0];
  if (!row) throw new ChallengeError();
  return { accountId: row.account_id };
}
