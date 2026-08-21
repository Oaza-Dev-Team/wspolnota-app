import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useSyncExternalStore } from 'react';

// Support never changes while the page is open, so there is nothing to
// subscribe to — this is a one-time client-only read, not a value that needs
// watching. useSyncExternalStore is what lets that read happen without
// setState inside an effect (which `react-hooks/set-state-in-effect` forbids
// in this project): getServerSnapshot answers "unknown" for the first paint
// (there is no `window` on the server to ask), and the real answer appears
// the moment React reconciles on the client.
const noSubscription = () => () => {};

/**
 * Whether this browser can do WebAuthn at all. `null` until the client has
 * settled the question — every screen that offers a passkey action asks this
 * first, because a button that cannot work is worse than a sentence
 * explaining why.
 */
export function useWebAuthnSupport(): boolean | null {
  return useSyncExternalStore(noSubscription, browserSupportsWebAuthn, () => null);
}
