import { describe, expect, it } from 'vitest';
import { isCancelledCeremony } from './cancelled';

/** What a browser throws when the person escapes the system dialog. */
function notAllowed(): Error {
  const e = new Error('The operation either timed out or was not allowed.');
  e.name = 'NotAllowedError';
  return e;
}

describe('isCancelledCeremony', () => {
  it('recognises the raw DOMException', () => {
    expect(isCancelledCeremony(notAllowed())).toBe(true);
  });

  // @simplewebauthn/browser copies cause.name onto its own WebAuthnError
  // (helpers/webAuthnError.js), which is why the name check catches both —
  // but the cause is checked too, in case a version stops copying it.
  it('recognises the wrapped WebAuthnError, by name or by cause', () => {
    const wrapped = new Error('passthrough', { cause: notAllowed() });
    wrapped.name = 'NotAllowedError';
    expect(isCancelledCeremony(wrapped)).toBe(true);

    const causeOnly = new Error('passthrough', { cause: notAllowed() });
    causeOnly.name = 'WebAuthnError';
    expect(isCancelledCeremony(causeOnly)).toBe(true);
  });

  it('leaves every other failure to the red box', () => {
    const other = new Error('Klucz został odrzucony');
    other.name = 'InvalidStateError';
    expect(isCancelledCeremony(other)).toBe(false);
    expect(isCancelledCeremony(new Error('cokolwiek'))).toBe(false);
  });

  it('survives a rejection that is not an object at all', () => {
    expect(isCancelledCeremony(null)).toBe(false);
    expect(isCancelledCeremony(undefined)).toBe(false);
    expect(isCancelledCeremony('NotAllowedError')).toBe(false);
  });
});
