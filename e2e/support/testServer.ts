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
//
// This is a standing network listener, not a one-shot script like
// prisma/seed.ts — and `/invite` is a genuine account-takeover primitive: given
// only an e-mail address it hands back a fresh, valid invitation token and
// deletes the account's existing keys. Binding to 127.0.0.1 is not enough of
// a guard on its own, so main() below refuses to start at all unless it is
// deliberately opted into — see assertSafeToRun() — and both mutating routes
// require POST, so a crawler, a prefetch, or a stray GET link can never
// trigger them.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { hashToken } from '@/lib/accounts/manage';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { prisma } from '@/lib/db';
import { SUPPORT_SERVER_PORT } from './config';

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

/**
 * Refuses to run against anything but a deliberate, disposable test database.
 * Two independent checks, not one: NODE_ENV alone would not stop somebody
 * running `npm run e2e:support` by hand against a `.env` pointed at a real
 * deployment, and the opt-in alone would not stop it surviving into a
 * production build's environment by accident. playwright.config.ts sets
 * E2E_SUPPORT for exactly this server's webServer entry, so the suite runs
 * unchanged; nothing else should ever set it.
 */
function assertSafeToRun(): void {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_SUPPORT !== '1') {
    console.error(
      '[e2e support server] refusing to start: this server accepts requests that mutate ' +
        'accounts (a fresh invitation, forced activation) with no authentication at all — ' +
        'it must never run anywhere near a real database. Set E2E_SUPPORT=1 (and never ' +
        'NODE_ENV=production) to run it deliberately; playwright.config.ts already does this ' +
        'for the e2e suite.',
    );
    process.exit(1);
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Both mutating routes take the same one field, either as a query parameter
 * (used by this suite's own client) or a JSON body — accepting both costs
 * nothing and keeps the route usable from `curl` while debugging. */
async function emailFrom(req: http.IncomingMessage, url: URL): Promise<string> {
  const fromQuery = url.searchParams.get('email');
  if (fromQuery) return fromQuery;
  const body = await readBody(req);
  if (body) {
    const parsed = JSON.parse(body) as { email?: string };
    if (parsed.email) return parsed.email;
  }
  throw new Error('missing "email"');
}

async function main() {
  assertSafeToRun();

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
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${SUPPORT_SERVER_PORT}`);

        if (url.pathname === '/health' && req.method === 'GET') {
          res.writeHead(200);
          res.end('ok');
          return;
        }

        // Both routes below mutate the database, so GET is refused outright —
        // a crawler, a prefetch, or a stray link must not be able to trigger
        // them. See this file's header for the fuller reasoning.
        if (url.pathname === '/invite') {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' });
            res.end('use POST');
            return;
          }
          const email = await emailFrom(req, url);
          // Awaited before writeHead, not inline in res.end's argument list —
          // a rejection here must still reach the catch block below, which it
          // cannot do once headers are already sent.
          const token = await inviteFor(email);
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(token);
          return;
        }
        if (url.pathname === '/activate') {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' });
            res.end('use POST');
            return;
          }
          const email = await emailFrom(req, url);
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

  server.listen(SUPPORT_SERVER_PORT, '127.0.0.1', () => {
    console.log(`[e2e support server] listening on http://127.0.0.1:${SUPPORT_SERVER_PORT}`);
  });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
