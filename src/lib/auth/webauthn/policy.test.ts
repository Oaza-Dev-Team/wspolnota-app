import { describe, expect, it } from 'vitest';
import { ClonedKeyError, checkCounter } from './policy';

describe('checkCounter', () => {
  it('accepts a counter that moved forward', () => {
    expect(() => checkCounter(4n, 5n)).not.toThrow();
  });

  it('rejects one that stood still: the same assertion was replayed', () => {
    expect(() => checkCounter(5n, 5n)).toThrow(ClonedKeyError);
  });

  it('rejects one that went backwards: the authenticator was cloned', () => {
    expect(() => checkCounter(5n, 4n)).toThrow(ClonedKeyError);
  });

  it('accepts zero against zero, because synced passkeys never count', () => {
    // Apple and Google platform authenticators always report zero: the key
    // lives on several devices at once, so a monotonic counter is meaningless.
    // A naive "must increase" rule would lock out nearly every user we have.
    expect(() => checkCounter(0n, 0n)).not.toThrow();
  });

  it('still rejects a drop to zero from a counting authenticator', () => {
    expect(() => checkCounter(7n, 0n)).toThrow(ClonedKeyError);
  });
});
