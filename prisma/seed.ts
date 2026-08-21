// Only Next.js loads .env automatically. This script runs under tsx, so it
// must load the environment itself — without this the client throws on the
// missing DATABASE_URL. Keep it first: db.ts reads the variable at import time.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import type { RetreatKind } from '@/generated/prisma/enums';
import { hashToken, INVITE_DAYS } from '@/lib/accounts/manage';
import { prisma } from '@/lib/db';
import { REGION_COUNT, ROMAN } from '@/lib/domain/regions';
import { DEGREES } from '@/lib/domain/retreats';
import {
  CHILDREN, HUSBAND_NAMES, PARISHES, PATRONS, RETREAT_PLACES, SURNAMES, WIFE_NAMES,
} from './seed/data';

const COUPLE_COUNT = 300;

/** Deterministic PRNG (mulberry32) so reseeding reproduces the same data. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = seeded(20260818);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/**
 * Picks the formation entries for couple `i`.
 *
 * The distribution is engineered, not random, because the acceptance
 * checklist requires all 17 formation filter options to return a non-empty
 * result. Indices 0..8 are reserved to guarantee that:
 *   0      → no entries at all           (covers "no retreats at all")
 *   1..7   → exactly one degree each     (covers every "without <degree>")
 *   8      → every degree plus INNE      (covers every "has <degree>" and "has other")
 * The rest get a realistic prefix of the path, sometimes with gaps.
 */
function formationFor(i: number): RetreatKind[] {
  if (i === 0) return [];
  if (i >= 1 && i <= 7) return [DEGREES[i - 1]!];
  if (i === 8) return [...DEGREES, 'INNE'];

  const count = Math.floor(rnd() * (DEGREES.length + 1));
  const chosen = DEGREES.slice(0, count).filter(() => rnd() > 0.15);
  if (rnd() > 0.85) chosen.push('INNE');
  return chosen;
}

function emailFor(surname: string, i: number): string {
  // ł has no Unicode decomposition, so it must be replaced before NFD.
  const plain = surname
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return `${plain}${i}@example.pl`;
}

function phoneNumber(): string {
  const block = () => String(Math.floor(rnd() * 900) + 100);
  return `+48 ${500 + Math.floor(rnd() * 400)} ${block()} ${block()}`;
}

type Invite = { email: string; token: string };

/**
 * Every seeded account starts exactly as a freshly created one does: no key,
 * holding a one-time invitation. There is no passkey to fake here — a working
 * credential needs a private key held by a real authenticator — so `pending`
 * plus an invitation is the only honest state to leave any of them in. The
 * caller registers the invite's token so main() can print every link once
 * the database is filled.
 */
function invite(email: string, invites: Invite[]) {
  const token = randomBytes(32).toString('base64url');
  invites.push({ email, token });
  return {
    status: 'pending' as const,
    inviteTokenHash: hashToken(token),
    inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * This script empties every table before it writes, and it ships inside the
 * `migrate` image — the very container the runbook tells you to open on the
 * server to create the first account. One `npm run db:seed` typed there would
 * erase the community and replace it with three hundred invented families and
 * fifteen accounts nobody holds a passkey for.
 *
 * So it refuses unless a variable says otherwise, and that variable lives in
 * `.env`, which `.dockerignore` keeps out of every image. Locally it is simply
 * there; on the server there is nothing to forget to set.
 */
function assertSeedAllowed(): void {
  if (process.env['SEED_ALLOW_WIPE'] === '1') return;
  throw new Error(
    'Seed kasuje wszystkie tabele i odmawia bez SEED_ALLOW_WIPE=1 w .env. '
    + 'To jest skrypt deweloperski. Na produkcji pierwsze konto zakłada '
    + '`npm run create-superadmin`, a danych nie zasiewa się wcale.',
  );
}

async function main() {
  assertSeedAllowed();

  console.log('Clearing database...');
  await prisma.retreat.deleteMany();
  await prisma.couple.deleteMany();
  await prisma.circle.deleteMany();
  await prisma.session.deleteMany();
  await prisma.audit.deleteMany();
  await prisma.account.deleteMany();
  await prisma.parish.deleteMany();
  await prisma.region.deleteMany();

  console.log('Regions...');
  for (let i = 1; i <= REGION_COUNT; i++) {
    await prisma.region.create({ data: { id: i, romanNumeral: ROMAN[i - 1]! } });
  }

  console.log('Parishes...');
  const parishes = [];
  for (const [name, city] of PARISHES) {
    parishes.push(await prisma.parish.create({ data: { name, city } }));
  }

  console.log('Circles...');
  const circles = [];
  for (let regionId = 1; regionId <= REGION_COUNT; regionId++) {
    const count = 4 + Math.floor(rnd() * 3); // 4-6 circles per region
    for (let number = 1; number <= count; number++) {
      circles.push(await prisma.circle.create({
        data: { regionId, number, patron: pick(PATRONS), parishId: pick(parishes).id },
      }));
    }
  }

  console.log('Accounts...');
  const invites: Invite[] = [];

  await prisma.account.create({
    data: {
      email: 'superadmin@example.pl', name: 'Konto techniczne',
      role: 'superadmin', ...invite('superadmin@example.pl', invites),
    },
  });

  await prisma.account.create({
    data: {
      email: 'admin@example.pl', name: 'Maria i Piotr Lewandowscy',
      role: 'admin', ...invite('admin@example.pl', invites),
    },
  });
  await prisma.account.create({
    data: {
      email: 'moderator@example.pl', name: 'ks. Marek Górzyński',
      role: 'viewer', ...invite('moderator@example.pl', invites),
    },
  });
  for (let regionId = 1; regionId <= REGION_COUNT; regionId++) {
    // The last region stays unstaffed in name, so the "Do obsadzenia" tile
    // has data behind it — every account is `pending` now, staffed or not,
    // since none of them holds a key yet.
    const email = `rejon${regionId}@example.pl`;
    const unstaffed = regionId === REGION_COUNT;
    await prisma.account.create({
      data: {
        email,
        name: unstaffed
          ? 'Do obsadzenia'
          : `${pick(WIFE_NAMES)} i ${pick(HUSBAND_NAMES)} ${pick(SURNAMES)}`,
        role: 'region', regionId, regionLead: true,
        ...invite(email, invites),
      },
    });
  }

  // One helper, so the "several accounts in one region" shape has data behind
  // it: the regions overview must keep naming the responsible couple.
  await prisma.account.create({
    data: {
      email: 'rejon1.pomoc@example.pl',
      name: `${pick(WIFE_NAMES)} i ${pick(HUSBAND_NAMES)} ${pick(SURNAMES)}`,
      role: 'region', regionId: 1, regionLead: false,
      ...invite('rejon1.pomoc@example.pl', invites),
    },
  });

  console.log(`Couples (${COUPLE_COUNT})...`);
  for (let i = 0; i < COUPLE_COUNT; i++) {
    const circle = pick(circles);
    const surname = pick(SURNAMES);
    const couple = await prisma.couple.create({
      data: {
        wifeName: pick(WIFE_NAMES),
        husbandName: pick(HUSBAND_NAMES),
        surname,
        email: emailFor(surname, i),
        phone: phoneNumber(),
        regionId: circle.regionId,
        circleId: circle.id,
        // A minority belong to a parish other than their circle's, which is
        // what makes the effective-parish coalesce necessary.
        parishId: rnd() > 0.85 ? pick(parishes).id : null,
        children: pick(CHILDREN) || null,
        notes: rnd() > 0.9 ? 'Kontakt przez e-mail.' : null,
      },
    });

    for (const kind of formationFor(i)) {
      await prisma.retreat.create({
        data: {
          coupleId: couple.id,
          kind,
          year: 2005 + Math.floor(rnd() * 20),
          place: pick(RETREAT_PLACES),
          name: kind === 'INNE' ? 'Rekolekcje ewangelizacyjne' : null,
        },
      });
    }
  }

  console.log('Done.');
  console.log('\nKonta czekają na klucz. Otwórz link i utwórz klucz w DevTools →');
  console.log('More tools → WebAuthn → Enable virtual authenticator environment.\n');
  for (const { email, token } of invites) {
    console.log(`  ${email.padEnd(28)} http://localhost:3000/invite/${token}`);
  }
}

// No top-level await: the project has no "type": "module", so tsx loads .ts
// files as CommonJS and top-level await fails with ERR_REQUIRE_ASYNC_MODULE.
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
