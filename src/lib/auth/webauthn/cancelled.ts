/**
 * Pure, like policy.ts next to it — no I/O, no Prisma — so the three Client
 * Components that run a WebAuthn ceremony can share one answer to the same
 * question.
 */

/**
 * Did the person simply back out of the system dialog?
 *
 * Escaping Windows Hello or Touch ID rejects the ceremony with a DOMException
 * named `NotAllowedError`. @simplewebauthn/browser wraps it in a WebAuthnError
 * but copies `cause.name` onto itself (see helpers/webAuthnError.js), so the
 * one check covers both the raw exception and the wrapped one; `cause` is
 * examined as well in case a future version stops copying the name.
 *
 * Worth its own function because of who reads the screen: this community's
 * accounts belong to people who take a red box to mean they broke something
 * and reach for the telephone. Somebody changing their mind is not an error,
 * and the same is true of the dialog timing out — which the platform also
 * reports as NotAllowedError, and which likewise leaves the button ready for
 * another try.
 */
export function isCancelledCeremony(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const error = e as { name?: unknown; cause?: { name?: unknown } };
  return error.name === 'NotAllowedError' || error.cause?.name === 'NotAllowedError';
}
