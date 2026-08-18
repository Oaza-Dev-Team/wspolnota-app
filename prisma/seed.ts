// Only Next.js loads .env automatically. This script runs under tsx, so it
// must load the environment itself — without this the client throws on the
// missing DATABASE_URL. Keep it first: db.ts reads the variable at import time.
import 'dotenv/config';
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { zahashuj } from '@/lib/auth/hasla';
import { prisma } from '@/lib/db';
import { STOPNIE } from '@/lib/domena/rekolekcje';
import { ROMAN } from '@/lib/domena/rejony';
import {
  DZIECI, IMIONA_MESKIE, IMIONA_ZENSKIE, MIEJSCA_REKOLEKCJI,
  NAZWISKA, PARAFIE, PATRONI,
} from './seed/dane';

const LICZBA_PAR = 300;
const HASLO_TESTOWE = 'kartoteka123';

/** Deterministic PRNG (mulberry32) so reseeding reproduces the same data. */
function losowy(ziarno: number) {
  let a = ziarno;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = losowy(20260818);
const wybierz = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

/**
 * Picks the formation entries for couple `i`.
 *
 * The distribution is engineered, not random, because the acceptance
 * checklist requires all 17 formation filter options to return a non-empty
 * result. Indices 0..8 are reserved to guarantee that:
 *   0      → no entries at all           (covers "Bez żadnych rekolekcji")
 *   1..7   → exactly one degree each     (covers every "Bez <stopień>")
 *   8      → every degree plus INNE      (covers every "Ma <stopień>" and "Ma inne")
 * The rest get a realistic prefix of the path, sometimes with gaps.
 */
function formacjaDlaPary(i: number): RodzajRekolekcji[] {
  if (i === 0) return [];
  if (i >= 1 && i <= 7) return [STOPNIE[i - 1]!];
  if (i === 8) return [...STOPNIE, 'INNE'];

  const ile = Math.floor(rnd() * (STOPNIE.length + 1));
  const wybrane = STOPNIE.slice(0, ile).filter(() => rnd() > 0.15);
  if (rnd() > 0.85) wybrane.push('INNE');
  return wybrane;
}

function adresEmail(nazwisko: string, i: number): string {
  // ł has no Unicode decomposition, so it must be replaced before NFD.
  const bezOgonkow = nazwisko
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return `${bezOgonkow}${i}@example.pl`;
}

function numerTelefonu(): string {
  const blok = () => String(Math.floor(rnd() * 900) + 100);
  return `+48 ${500 + Math.floor(rnd() * 400)} ${blok()} ${blok()}`;
}

async function main() {
  console.log('Czyszczenie bazy...');
  await prisma.rekolekcje.deleteMany();
  await prisma.para.deleteMany();
  await prisma.krag.deleteMany();
  await prisma.sesja.deleteMany();
  await prisma.audyt.deleteMany();
  await prisma.konto.deleteMany();
  await prisma.parafia.deleteMany();
  await prisma.rejon.deleteMany();

  console.log('Rejony...');
  for (let i = 1; i <= 12; i++) {
    await prisma.rejon.create({ data: { id: i, numerRzym: ROMAN[i - 1]! } });
  }

  console.log('Parafie...');
  const parafie = [];
  for (const [nazwa, miasto] of PARAFIE) {
    parafie.push(await prisma.parafia.create({ data: { nazwa, miasto } }));
  }

  console.log('Kregi...');
  const kregi = [];
  for (let rejonId = 1; rejonId <= 12; rejonId++) {
    const ile = 4 + Math.floor(rnd() * 3); // 4-6 circles per region
    for (let numer = 1; numer <= ile; numer++) {
      kregi.push(await prisma.krag.create({
        data: {
          rejonId, numer,
          patron: wybierz(PATRONI),
          parafiaId: wybierz(parafie).id,
        },
      }));
    }
  }

  console.log('Konta...');
  const hash = await zahashuj(HASLO_TESTOWE);
  await prisma.konto.create({
    data: {
      email: 'admin@example.pl', nazwa: 'Maria i Piotr Lewandowscy',
      rola: 'admin', hashHasla: hash, status: 'aktywne',
    },
  });
  await prisma.konto.create({
    data: {
      email: 'moderator@example.pl', nazwa: 'ks. Marek Górzyński',
      rola: 'podglad', hashHasla: hash, status: 'aktywne',
    },
  });
  for (let rejonId = 1; rejonId <= 12; rejonId++) {
    // Region XII stays unstaffed, so the "oczekuje" status and the
    // "Do obsadzenia" tile both have data behind them.
    const oczekuje = rejonId === 12;
    await prisma.konto.create({
      data: {
        email: `rejon${rejonId}@example.pl`,
        nazwa: oczekuje
          ? 'Do obsadzenia'
          : `${wybierz(IMIONA_ZENSKIE)} i ${wybierz(IMIONA_MESKIE)} ${wybierz(NAZWISKA)}`,
        rola: 'rejon', rejonId,
        hashHasla: oczekuje ? null : hash,
        status: oczekuje ? 'oczekuje' : 'aktywne',
        ostatnieLogowanie: oczekuje
          ? null
          : new Date(Date.now() - Math.floor(rnd() * 30) * 86400000),
      },
    });
  }

  console.log(`Pary (${LICZBA_PAR})...`);
  for (let i = 0; i < LICZBA_PAR; i++) {
    const krag = wybierz(kregi);
    const nazwisko = wybierz(NAZWISKA);
    const para = await prisma.para.create({
      data: {
        imieZony: wybierz(IMIONA_ZENSKIE),
        imieMeza: wybierz(IMIONA_MESKIE),
        nazwisko,
        email: adresEmail(nazwisko, i),
        telefon: numerTelefonu(),
        rejonId: krag.rejonId,
        kragId: krag.id,
        // A minority belong to a parish other than their circle's, which is
        // what makes the parafia_efektywna coalesce necessary.
        parafiaId: rnd() > 0.85 ? wybierz(parafie).id : null,
        dzieci: wybierz(DZIECI) || null,
        notatki: rnd() > 0.9 ? 'Kontakt przez e-mail.' : null,
      },
    });

    for (const rodzaj of formacjaDlaPary(i)) {
      await prisma.rekolekcje.create({
        data: {
          paraId: para.id,
          rodzaj,
          rok: 2005 + Math.floor(rnd() * 20),
          miejsce: wybierz(MIEJSCA_REKOLEKCJI),
          nazwa: rodzaj === 'INNE' ? 'Rekolekcje ewangelizacyjne' : null,
        },
      });
    }
  }

  console.log(`Gotowe. Haslo do wszystkich kont testowych: ${HASLO_TESTOWE}`);
}

// No top-level await: the project has no "type": "module", so tsx loads .ts
// files as CommonJS and top-level await fails with ERR_REQUIRE_ASYNC_MODULE.
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
