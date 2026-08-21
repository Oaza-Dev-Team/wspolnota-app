const PORT = 3010;

/**
 * Puts a fresh invitation on a seeded account and returns its raw token, via
 * the local support server (see support/testServer.ts — spec files cannot
 * import Prisma directly, since Playwright's own loader cannot require() the
 * generated client).
 *
 * Always issues a new one rather than trusting whatever the seed (or an
 * earlier test) left behind, and always wipes the account's existing keys
 * first. Two reasons, not one:
 *  - `accountForInvite` only cares about the token hash and its expiry, so a
 *    stale invite would resolve just as well — but re-using the seed's own
 *    invite would mean every test signing in as the same account shares one
 *    token, and the first test to redeem it would silently invalidate it for
 *    every test after.
 *  - Wiping credentials keeps a test's OWN key count honest. Without it,
 *    `passkey.spec.ts`'s very first assertion (`getByRole('listitem')` has
 *    count 1 right after enrolling) would instead see however many keys an
 *    earlier test left on this same seeded account — the authenticator that
 *    created them lived in a browser context that has since closed, but the
 *    database row it wrote survives.
 */
export async function inviteFor(email: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${PORT}/invite?email=${encodeURIComponent(email)}`);
  if (!res.ok) {
    throw new Error(`inviteFor(${email}) failed: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

/**
 * Flips an account straight to `active`, with no key and no WebAuthn ceremony
 * at all — see support/testServer.ts for why this exists: every seeded
 * account starts `pending` now, and admin-views.spec.ts needs some of them to
 * already look staffed before its tests run, which is not itself a claim
 * about passkeys.
 */
export async function activate(email: string): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${PORT}/activate?email=${encodeURIComponent(email)}`);
  if (!res.ok) {
    throw new Error(`activate(${email}) failed: ${res.status} ${await res.text()}`);
  }
}
