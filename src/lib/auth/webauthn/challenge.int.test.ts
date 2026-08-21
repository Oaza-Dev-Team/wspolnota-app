import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ChallengeError, consumeChallenge, rememberChallenge } from './challenge';

// Every value handed out is tracked here, whether or not the test under it
// expects consumeChallenge to have already deleted the row itself — a
// challenge refused for the wrong purpose or already expired is never
// reachable by the DELETE ... RETURNING in consumeChallenge, so it would
// otherwise outlive the test. Tracking unconditionally, rather than only in
// the tests known to need it, also covers whatever gets added here later.
const created: string[] = [];

function value() {
  const v = randomBytes(32).toString('base64url');
  created.push(v);
  return v;
}

afterEach(async () => {
  await prisma.webauthnChallenge.deleteMany({ where: { challenge: { in: created.splice(0) } } });
});

it('gives back what was remembered', async () => {
  const c = value();
  await rememberChallenge(c, 'authentication');
  await expect(consumeChallenge(c, 'authentication')).resolves.toEqual({ accountId: null });
});

it('carries the account through a registration', async () => {
  const a = await prisma.account.create({
    data: {
      email: `chal-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Testowi',
      role: 'viewer',
      status: 'pending',
      webauthnUserId: value(),
    },
  });
  const c = value();
  await rememberChallenge(c, 'registration', a.id);

  await expect(consumeChallenge(c, 'registration')).resolves.toEqual({ accountId: a.id });
  await prisma.account.delete({ where: { id: a.id } });
});

it('spends a challenge once, so a recorded response cannot be replayed', async () => {
  const c = value();
  await rememberChallenge(c, 'authentication');
  await consumeChallenge(c, 'authentication');
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses a challenge issued for the other ceremony', async () => {
  const c = value();
  await rememberChallenge(c, 'registration');
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses one that has expired', async () => {
  const c = value();
  await prisma.webauthnChallenge.create({
    data: { challenge: c, purpose: 'authentication', expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses one nobody issued', async () => {
  await expect(consumeChallenge(value(), 'authentication')).rejects.toThrow(ChallengeError);
});
