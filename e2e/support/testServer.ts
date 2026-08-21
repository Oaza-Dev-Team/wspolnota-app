// A tiny local HTTP helper for the e2e suite, started as its own Playwright
// `webServer` entry and run under tsx — same as e2e/prepare.ts used to be.
//
// Spec files need to reach into the database (a fresh invitation per test —
// see support/invites.ts), but they cannot import Prisma directly: Playwright
// loads .spec.ts files with its own TypeScript loader, which cannot require()
// the generated Prisma client (an ES module) — confirmed by hand, the failure
// is the exact "exports is not defined" prepare.ts's own comment described.
// tsx handles that interop correctly (it already runs prisma/seed.ts), so this
// server does the Prisma work in a process Playwright never has to load as a
// module, and spec files talk to it over plain HTTP instead.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { hashToken } from '@/lib/accounts/manage';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { prisma } from '@/lib/db';

const PORT = 3010;

/** Puts a fresh invitation on a seeded account and returns its raw token. See
 * support/invites.ts for why every call issues a new one and wipes the
 * account's existing keys. */
async function inviteFor(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.account.update({
    where: { email },
    data: {
      status: 'pending',
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.credential.deleteMany({ where: { account: { email } } });
  return token;
}

/**
 * Flips an account straight to `active`, without a key and without touching
 * the WebAuthn ceremony at all. Seed accounts all start `pending` now (every
 * one of them waits on an invitation — see prisma/seed.ts), which is honest
 * for the seed but leaves nothing for admin-views.spec.ts's account/region
 * displays to distinguish "staffed" from "not yet" unless something first
 * restores that distinction. Enrolling ten region leads for real would only
 * be testing enrolment again — passkey.spec.ts already does that thoroughly
 * — so this is a direct, cheap fixture nudge for tests that are not
 * themselves about the ceremony.
 */
async function activate(email: string): Promise<void> {
  await prisma.account.update({ where: { email }, data: { status: 'active' } });
}

async function main() {
  // The sign-in rate limiter is keyed by IP now, not by e-mail
  // (src/lib/auth/rateLimit.ts), so every /login attempt across the WHOLE
  // suite shares one bucket of 10 attempts per 15 minutes. One run alone
  // stays far under that — most sign-ins in this suite go through enrolment,
  // which never calls the rate-limited beginSignIn action at all — but
  // nothing else clears loginAttempt rows, so repeated runs of `npm run e2e`
  // within the same 15-minute window (a developer iterating, a CI retry)
  // would accumulate anyway. This server starts once per run, so clearing
  // here keeps every run starting from zero, the same job e2e/prepare.ts did
  // for the password-based limiter it replaced.
  const { count } = await prisma.loginAttempt.deleteMany();
  console.log(`[e2e support server] cleared ${count} login attempt(s)`);

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
        if (url.pathname === '/health') {
          res.writeHead(200);
          res.end('ok');
          return;
        }
        if (url.pathname === '/invite') {
          const email = url.searchParams.get('email');
          if (!email) throw new Error('missing "email" query parameter');
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(await inviteFor(email));
          return;
        }
        if (url.pathname === '/activate') {
          const email = url.searchParams.get('email');
          if (!email) throw new Error('missing "email" query parameter');
          await activate(email);
          res.writeHead(200);
          res.end('ok');
          return;
        }
        res.writeHead(404);
        res.end();
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(e instanceof Error ? e.message : String(e));
      }
    })();
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[e2e support server] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
