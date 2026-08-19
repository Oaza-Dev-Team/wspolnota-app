// Only Next.js loads .env automatically. This script runs under tsx, so it
// must load the environment itself — without this the client throws on the
// missing DATABASE_URL. Keep it first: db.ts reads the variable at import time.
import 'dotenv/config';
import type { RetreatKind } from '@/generated/prisma/enums';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db';
import { REGION_COUNT, ROMAN } from '@/lib/domain/regions';
import { DEGREES } from '@/lib/domain/retreats';
import {
  CHILDREN, HUSBAND_NAMES, PARISHES, PATRONS, RETREAT_PLACES, SURNAMES, WIFE_NAMES,
} from './seed/data';

const COUPLE_COUNT = 300;
const TEST_PASSWORD = 'kartoteka123';

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

async function main() {
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
  const hash = await hashPassword(TEST_PASSWORD);
  await prisma.account.create({
    data: {
      email: 'superadmin@example.pl', name: 'Konto techniczne',
      role: 'superadmin', passwordHash: hash, status: 'active',
    },
  });

  await prisma.account.create({
    data: {
      email: 'admin@example.pl', name: 'Maria i Piotr Lewandowscy',
      role: 'admin', passwordHash: hash, status: 'active',
    },
  });
  await prisma.account.create({
    data: {
      email: 'moderator@example.pl', name: 'ks. Marek Górzyński',
      role: 'viewer', passwordHash: hash, status: 'active',
    },
  });
  for (let regionId = 1; regionId <= REGION_COUNT; regionId++) {
    // The last region stays unstaffed, so the "pending" status and the
    // "Do obsadzenia" tile both have data behind them.
    const pending = regionId === REGION_COUNT;
    await prisma.account.create({
      data: {
        email: `rejon${regionId}@example.pl`,
        name: pending
          ? 'Do obsadzenia'
          : `${pick(WIFE_NAMES)} i ${pick(HUSBAND_NAMES)} ${pick(SURNAMES)}`,
        role: 'region', regionId, regionLead: true,
        passwordHash: pending ? null : hash,
        status: pending ? 'pending' : 'active',
        lastLoginAt: pending
          ? null
          : new Date(Date.now() - Math.floor(rnd() * 30) * 86400000),
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
      passwordHash: hash, status: 'active',
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

  console.log(`Done. Password for every test account: ${TEST_PASSWORD}`);
}

// No top-level await: the project has no "type": "module", so tsx loads .ts
// files as CommonJS and top-level await fails with ERR_REQUIRE_ASYNC_MODULE.
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
