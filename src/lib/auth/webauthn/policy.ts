/**
 * Our own rules, kept apart from the library's so they are visible and tested.
 * SimpleWebAuthn checks the counter too; this stays because the rule is
 * load-bearing and a library upgrade that loosened it must not do so silently.
 *
 * Pure by construction — no I/O, no Prisma import — so both a server module
 * (credentials.ts) and a Client Component (/account's KeyList.tsx) can depend
 * on it directly, without either dragging the other's world along.
 */

/** Shared with the client: an input longer than this is truncated server-side
 * in renameCredential, so the field that accepts the label has to cap it at
 * the same number or a typed label can be cut short with no signal. */
export const MAX_LABEL = 60;

export class ClonedKeyError extends Error {
  constructor() {
    super('Klucz został odrzucony — zgłoś to administratorowi');
    this.name = 'ClonedKeyError';
  }
}

/**
 * A signature counter that fails to advance means the same assertion came
 * twice, or the authenticator was copied. Both are refusals.
 *
 * The exception is an authenticator that does not count at all and reports
 * zero every time — which is what every synced passkey does, because the key
 * exists on several devices and no single one of them holds the true count.
 */
export function checkCounter(stored: bigint, received: bigint): void {
  if (stored === 0n && received === 0n) return;
  if (received <= stored) throw new ClonedKeyError();
}
