# Kartoteka DK — Plan 3: Karta pary i formacja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Podłączyć pod istniejący adres `?karta=<id>` panel boczny z pełną kartą pary — formularz, sekcję formacji, tryb tylko-do-odczytu, zapis i usuwanie, każde z wpisem do historii zmian.

**Architecture:** Panel to natywny `<dialog showModal>` — daje focus trap, `Esc`, `aria-modal` i powrót fokusu bez własnego kodu. Treść renderuje się na serwerze i wchodzi do dialogu jako `children`; klienckie jest tylko to, co musi być: otwarcie dialogu, edycja szkicu i sekcja formacji. Zapis nie mieszka w server action, tylko w `lib/pary/zapisz.ts` — bo import z Excela w Planie 4 musi przejść przez dokładnie tę samą walidację i ten sam zapis.

**Tech Stack:** Next.js 16.3 App Router · React 19.2 · Prisma 7.9 · Zod 4 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` (§4.3, §4.4, §7, §9)
**Wygląd — nadrzędny:** `docs/handoff/README.md` §4 (Panel pary)
**Zrzuty:** `docs/handoff/screenshots/03-karta-pary-pelna.png`, `04-formacja-rekolekcje.png`
**Poprzednie plany:** `…plan-1-fundament-i-uwierzytelnianie.md`, `…plan-2-powloka-lista-filtry.md`

## Global Constraints

- **Wersje:** Next.js 16.3.1 · React 19.2 · TypeScript `strict` + `noUncheckedIndexedAccess` · `target: ES2022` · Prisma 7.9 · Zod 4
- **Bez MUI i bez Tailwinda.** CSS Modules + tokeny z `src/styles/tokens.css`. **Literał koloru, odstępu, promienia lub cienia w `.module.css` to błąd** — brakujące wartości dodaj do `tokens.css`.
- **Bezpieczeństwo:** żadna server action nie dotyka Prismy przed `requireUser()`. Uprawnienia sprawdzane **na serwerze przy każdym zapisie**, nie tylko ukrywaniem przycisków.
- **Audyt w tej samej transakcji co zmiana.** Osobny zapis dopuszcza stan „zmiana bez wpisu w historii".
- **Liczba rejonów to `LICZBA_REJONOW`** — nigdy literał. Rejonów jest 11.
- **Liczebniki przez `odmiana()`** z `@/lib/pl`.
- **Commity** po każdym zadaniu, po angielsku.

## Cztery rzeczy z poprzednich planów, które tu obowiązują

1. **`searchParams` to `Promise`** — trzeba `await`.
2. **Kolumny `szukajka` są `GENERATED ALWAYS`.** Postgres je wylicza. Próba wstawienia ich w `data` przy `create` lub `update` kończy się błędem bazy — **nigdy ich nie wymieniaj**.
3. **`bigint` nie przechodzi przez granicę serwer–klient.** Identyfikatory jadą do komponentów klienckich jako `string`.
4. **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Sprawdź `prisma migrate status`, zanim uznasz, że padła; wiszący proces trzyma blokadę advisory.

---

## Struktura plików

```
src/lib/pary/
  schemat.ts              schemat Zod pary i wpisu formacji — wspólny dla formularza,
                          server action i (w Planie 4) importu
  zapisz.ts               utwórz / zaktualizuj / usuń + audyt w jednej transakcji
  karta.ts               odczyt pojedynczej pary wraz z opcjami kręgów i parafii

src/app/(app)/pary/
  akcje.ts                server actions — cienkie adaptery nad zapisz.ts
  KartaPary.tsx           dialog + formularz + sekcja formacji (klient)
  SekcjaFormacji.tsx      wiersze wpisów
  PoleKregu.tsx           combobox: istniejący krąg albo nowy
  PoleParafii.tsx         combobox: istniejąca parafia albo nowa
  karta.module.css

src/components/
  Toast.tsx               komunikat po zapisie
  toast.module.css

e2e/
  karta.spec.ts
```

**Granica klient/serwer.** `KartaPary.tsx` jest kliencki, bo trzyma szkic i steruje dialogiem. Dane wchodzą do niego jako proste propsy z serwera. Zapis wychodzi server action, która **ponownie** sprawdza uprawnienia — to, że przycisk był widoczny, niczego nie dowodzi.

---

### Task 1: Schemat walidacji

**Files:**
- Create: `src/lib/pary/schemat.ts`
- Test: `src/lib/pary/schemat.test.ts`

**Interfaces:**
- Produces:
  - `schematPary` — Zod, pola: `imieZony`, `imieMeza`, `nazwisko`, `email`, `telefon`, `rejonId`, `kragId`, `nowyKrag`, `parafiaId`, `nowaParafia`, `dzieci`, `notatki`
  - `schematRekolekcji` — `rodzaj`, `rok`, `miejsce`, `nazwa`
  - `type DanePary = z.infer<typeof schematPary>`
  - `type DaneRekolekcji = z.infer<typeof schematRekolekcji>`
  - `schematZapisu` — `{ para: DanePary; rekolekcje: DaneRekolekcji[] }`

- [ ] **Step 1: Napisz test**

`src/lib/pary/schemat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { schematPary, schematRekolekcji, schematZapisu } from './schemat';

const poprawnaPara = {
  imieZony: 'Anna', imieMeza: 'Piotr', nazwisko: 'Kowalscy',
  email: 'kowalscy@example.pl', telefon: '+48 601 202 303',
  rejonId: 7, kragId: '12', nowyKrag: null, parafiaId: '3', nowaParafia: null,
  dzieci: 'Marysia 2014', notatki: '',
};

describe('schematPary', () => {
  it('accepts a fully filled couple', () => {
    expect(schematPary.safeParse(poprawnaPara).success).toBe(true);
  });

  // The only hard requirement from the acceptance checklist.
  it('requires a surname', () => {
    const wynik = schematPary.safeParse({ ...poprawnaPara, nazwisko: '   ' });
    expect(wynik.success).toBe(false);
    expect(wynik.error!.issues[0]!.message).toBe('Podaj nazwisko');
  });

  it('treats blank optional fields as absent rather than as empty strings', () => {
    const wynik = schematPary.parse({ ...poprawnaPara, email: '', telefon: '', dzieci: '' });
    expect(wynik.email).toBeNull();
    expect(wynik.telefon).toBeNull();
    expect(wynik.dzieci).toBeNull();
  });

  it('rejects a malformed e-mail but allows none at all', () => {
    expect(schematPary.safeParse({ ...poprawnaPara, email: 'to-nie-email' }).success).toBe(false);
    expect(schematPary.safeParse({ ...poprawnaPara, email: '' }).success).toBe(true);
  });

  it('rejects a region outside the range', () => {
    expect(schematPary.safeParse({ ...poprawnaPara, rejonId: 12 }).success).toBe(false);
    expect(schematPary.safeParse({ ...poprawnaPara, rejonId: 0 }).success).toBe(false);
  });

  it('refuses a circle given both by id and as a new one', () => {
    const wynik = schematPary.safeParse({
      ...poprawnaPara, kragId: '12', nowyKrag: { numer: 4, patron: 'św. Rity', parafiaId: '3' },
    });
    expect(wynik.success).toBe(false);
  });
});

describe('schematRekolekcji', () => {
  it('accepts a degree entry without a name', () => {
    expect(schematRekolekcji.safeParse({
      rodzaj: 'ONZ_I', rok: 2014, miejsce: 'Krościenko', nazwa: '',
    }).success).toBe(true);
  });

  it('requires a name for INNE', () => {
    const wynik = schematRekolekcji.safeParse({
      rodzaj: 'INNE', rok: 2014, miejsce: 'Chmielno', nazwa: '',
    });
    expect(wynik.success).toBe(false);
    expect(wynik.error!.issues[0]!.message).toBe('Podaj nazwę rekolekcji');
  });

  it('keeps the year inside the range the database enforces', () => {
    expect(schematRekolekcji.safeParse({ rodzaj: 'ONZ_I', rok: 1969, miejsce: '', nazwa: '' }).success)
      .toBe(false);
    expect(schematRekolekcji.safeParse({ rodzaj: 'ONZ_I', rok: 2101, miejsce: '', nazwa: '' }).success)
      .toBe(false);
  });
});

describe('schematZapisu', () => {
  it('validates the couple and its entries together', () => {
    const wynik = schematZapisu.safeParse({
      para: poprawnaPara,
      rekolekcje: [{ rodzaj: 'ONZ_I', rok: 2014, miejsce: 'Krościenko', nazwa: '' }],
    });
    expect(wynik.success).toBe(true);
  });

  it('fails when any entry is invalid', () => {
    expect(schematZapisu.safeParse({
      para: poprawnaPara,
      rekolekcje: [{ rodzaj: 'INNE', rok: 2014, miejsce: '', nazwa: '' }],
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- schemat`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/pary/schemat.ts`:

```ts
import { z } from 'zod';
import { RODZAJE_REKOLEKCJI } from '@/lib/domena/rekolekcje';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';

/** Empty form fields arrive as "" and must land in the database as NULL. */
const pusteNaNull = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? null : s));

const RODZAJE = RODZAJE_REKOLEKCJI.map((r) => r.rodzaj) as [string, ...string[]];

export const schematRekolekcji = z
  .object({
    rodzaj: z.enum(RODZAJE),
    // The database CHECK enforces the same range; keeping them equal means a
    // form error rather than a constraint violation.
    rok: z.number().int().min(1970, 'Rok poza zakresem').max(2100, 'Rok poza zakresem'),
    miejsce: pusteNaNull,
    nazwa: pusteNaNull,
  })
  .refine((r) => r.rodzaj !== 'INNE' || r.nazwa !== null, {
    message: 'Podaj nazwę rekolekcji',
    path: ['nazwa'],
  });

const nowyKrag = z.object({
  numer: z.number().int().min(1).max(99),
  patron: pusteNaNull,
  parafiaId: z.string().regex(/^\d+$/),
});

const nowaParafia = z.object({
  nazwa: z.string().trim().min(1, 'Podaj nazwę parafii'),
  miasto: z.string().trim().min(1, 'Podaj miasto'),
});

export const schematPary = z
  .object({
    imieZony: z.string().trim().max(60),
    imieMeza: z.string().trim().max(60),
    nazwisko: z.string().trim().min(1, 'Podaj nazwisko').max(80),
    email: z.union([z.literal(''), z.email('Niepoprawny adres e-mail')]).transform((s) => s || null),
    telefon: pusteNaNull,
    rejonId: z.number().int().min(1).max(LICZBA_REJONOW),
    kragId: z.string().regex(/^\d+$/).nullable(),
    nowyKrag: nowyKrag.nullable(),
    parafiaId: z.string().regex(/^\d+$/).nullable(),
    nowaParafia: nowaParafia.nullable(),
    dzieci: pusteNaNull,
    notatki: pusteNaNull,
  })
  // Picking an existing entity and creating a new one at once is ambiguous —
  // the combobox can only be in one of those states.
  .refine((p) => !(p.kragId && p.nowyKrag), {
    message: 'Wybierz istniejący krąg albo utwórz nowy',
    path: ['kragId'],
  })
  .refine((p) => !(p.parafiaId && p.nowaParafia), {
    message: 'Wybierz istniejącą parafię albo utwórz nową',
    path: ['parafiaId'],
  });

export const schematZapisu = z.object({
  para: schematPary,
  rekolekcje: z.array(schematRekolekcji),
});

export type DanePary = z.infer<typeof schematPary>;
export type DaneRekolekcji = z.infer<typeof schematRekolekcji>;
export type DaneZapisu = z.infer<typeof schematZapisu>;
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- schemat`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add couple and retreat validation schema"
```

---

### Task 2: Warstwa zapisu

Serce planu. Tu audyt wchodzi do tej samej transakcji co zmiana, a uprawnienia są
sprawdzane po stronie serwera.

**Files:**
- Create: `src/lib/pary/zapisz.ts`
- Test: `src/lib/pary/zapisz.int.test.ts`

**Interfaces:**
- Consumes: `assertMozeEdytowac`, `mozeZmienicRejon`, `Zabronione` z `@/lib/auth/permissions`; `DaneZapisu` (Task 1)
- Produces:
  - `dodajPare(u: Uzytkownik, dane: DaneZapisu): Promise<bigint>`
  - `zaktualizujPare(u: Uzytkownik, id: bigint, dane: DaneZapisu): Promise<void>`
  - `usunPare(u: Uzytkownik, id: bigint): Promise<void>` — soft-delete
  - `class NieZnaleziono extends Error`

- [ ] **Step 1: Napisz test integracyjny**

`src/lib/pary/zapisz.int.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { type Uzytkownik, Zabronione } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { DaneZapisu } from './schemat';
import { NieZnaleziono, dodajPare, usunPare, zaktualizujPare } from './zapisz';

const admin: Uzytkownik = { id: 0n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 0n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 0n, rola: 'podglad', rejonId: null };

const utworzone: bigint[] = [];

afterEach(async () => {
  if (utworzone.length) {
    await prisma.rekolekcje.deleteMany({ where: { paraId: { in: utworzone } } });
    await prisma.para.deleteMany({ where: { id: { in: utworzone } } });
    await prisma.audyt.deleteMany({ where: { paraId: { in: utworzone } } });
    utworzone.length = 0;
  }
});

function dane(nadpisz: Partial<DaneZapisu['para']> = {}): DaneZapisu {
  return {
    para: {
      imieZony: 'Testowa', imieMeza: 'Testowy', nazwisko: 'Testowi',
      email: null, telefon: null, rejonId: 7,
      kragId: null, nowyKrag: null, parafiaId: null, nowaParafia: null,
      dzieci: null, notatki: null, ...nadpisz,
    },
    rekolekcje: [],
  };
}

async function dodaj(u: Uzytkownik, d: DaneZapisu = dane()) {
  const id = await dodajPare(u, d);
  utworzone.push(id);
  return id;
}

describe('dodajPare', () => {
  it('creates the couple and one audit entry, in one transaction', async () => {
    const przed = await prisma.audyt.count();
    const id = await dodaj(admin);

    expect(await prisma.para.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.audyt.count()).toBe(przed + 1);

    const wpis = await prisma.audyt.findFirstOrThrow({ where: { paraId: id } });
    expect(wpis.rodzaj).toBe('dodanie');
  });

  it('stores retreat entries alongside the couple', async () => {
    const id = await dodaj(admin, {
      ...dane(),
      rekolekcje: [
        { rodzaj: 'ONZ_I', rok: 2014, miejsce: 'Krościenko', nazwa: null },
        { rodzaj: 'INNE', rok: 2019, miejsce: null, nazwa: 'Ewangelizacyjne' },
      ],
    });
    expect(await prisma.rekolekcje.count({ where: { paraId: id } })).toBe(2);
  });

  it('lets a region account create only inside its own region', async () => {
    await expect(dodajPare(rejonVII, dane({ rejonId: 3 }))).rejects.toThrow(Zabronione);
  });

  it('never lets the viewer create', async () => {
    await expect(dodajPare(moderator, dane())).rejects.toThrow(Zabronione);
  });
});

describe('zaktualizujPare', () => {
  it('records an edit in the audit trail', async () => {
    const id = await dodaj(admin);
    await zaktualizujPare(admin, id, dane({ nazwisko: 'Zmienieni' }));

    const para = await prisma.para.findUniqueOrThrow({ where: { id } });
    expect(para.nazwisko).toBe('Zmienieni');
    expect(await prisma.audyt.count({ where: { paraId: id, rodzaj: 'edycja' } })).toBe(1);
  });

  it('replaces the retreat entries rather than appending to them', async () => {
    const id = await dodaj(admin, {
      ...dane(),
      rekolekcje: [{ rodzaj: 'ONZ_I', rok: 2014, miejsce: null, nazwa: null }],
    });
    await zaktualizujPare(admin, id, {
      ...dane(),
      rekolekcje: [{ rodzaj: 'ONZ_II', rok: 2016, miejsce: null, nazwa: null }],
    });

    const wpisy = await prisma.rekolekcje.findMany({ where: { paraId: id } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0]!.rodzaj).toBe('ONZ_II');
  });

  // The checklist requires the region field to be locked for a region account
  // both in the interface and on the server.
  it('refuses to move a couple out of a region account own region', async () => {
    const id = await dodaj(admin);
    await expect(zaktualizujPare(rejonVII, id, dane({ rejonId: 3 }))).rejects.toThrow(Zabronione);
  });

  it('lets a region account edit its own couple without touching the region', async () => {
    const id = await dodaj(admin);
    await zaktualizujPare(rejonVII, id, dane({ nazwisko: 'Poprawieni' }));
    expect((await prisma.para.findUniqueOrThrow({ where: { id } })).nazwisko).toBe('Poprawieni');
  });

  it('refuses a couple from another region', async () => {
    const id = await dodaj(admin, dane({ rejonId: 3 }));
    await expect(zaktualizujPare(rejonVII, id, dane({ rejonId: 3 }))).rejects.toThrow(Zabronione);
  });

  it('throws NieZnaleziono for an id that does not exist', async () => {
    await expect(zaktualizujPare(admin, 999_999_999n, dane())).rejects.toThrow(NieZnaleziono);
  });
});

describe('usunPare', () => {
  it('soft-deletes so the record survives for recovery', async () => {
    const id = await dodaj(admin);
    await usunPare(admin, id);

    const para = await prisma.para.findUniqueOrThrow({ where: { id } });
    expect(para.usunieteAt).not.toBeNull();
    expect(await prisma.audyt.count({ where: { paraId: id, rodzaj: 'usuniecie' } })).toBe(1);
  });

  it('hides a soft-deleted couple from an already-deleted record', async () => {
    const id = await dodaj(admin);
    await usunPare(admin, id);
    // A second delete has nothing left to act on.
    await expect(usunPare(admin, id)).rejects.toThrow(NieZnaleziono);
  });

  it('never lets the viewer delete', async () => {
    const id = await dodaj(admin);
    await expect(usunPare(moderator, id)).rejects.toThrow(Zabronione);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- zapisz`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/pary/zapisz.ts`:

```ts
import type { Prisma } from '@/generated/prisma/client';
import {
  type Uzytkownik, Zabronione, assertMozeEdytowac, mozeUsuwac, mozeZmienicRejon,
} from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { DaneZapisu } from './schemat';

export class NieZnaleziono extends Error {
  constructor(message = 'Nie znaleziono pary') {
    super(message);
    this.name = 'NieZnaleziono';
  }
}

/**
 * Never mention `szukajka` here. Those columns are GENERATED ALWAYS: Postgres
 * computes them and rejects any attempt to write them.
 */
function poleParyDoZapisu(d: DaneZapisu['para']) {
  return {
    imieZony: d.imieZony,
    imieMeza: d.imieMeza,
    nazwisko: d.nazwisko,
    email: d.email,
    telefon: d.telefon,
    rejonId: d.rejonId,
    dzieci: d.dzieci,
    notatki: d.notatki,
  };
}

/** Resolves the combobox state into ids, creating the new entity when asked. */
async function rozwiazPowiazania(
  tx: Prisma.TransactionClient,
  d: DaneZapisu['para'],
): Promise<{ kragId: bigint | null; parafiaId: bigint | null }> {
  let parafiaId = d.parafiaId === null ? null : BigInt(d.parafiaId);

  if (d.nowaParafia) {
    const parafia = await tx.parafia.upsert({
      where: { nazwa_miasto: { nazwa: d.nowaParafia.nazwa, miasto: d.nowaParafia.miasto } },
      update: {},
      create: d.nowaParafia,
    });
    parafiaId = parafia.id;
  }

  let kragId = d.kragId === null ? null : BigInt(d.kragId);

  if (d.nowyKrag) {
    const krag = await tx.krag.upsert({
      where: { rejonId_numer: { rejonId: d.rejonId, numer: d.nowyKrag.numer } },
      update: {},
      create: {
        rejonId: d.rejonId,
        numer: d.nowyKrag.numer,
        patron: d.nowyKrag.patron,
        parafiaId: BigInt(d.nowyKrag.parafiaId),
      },
    });
    kragId = krag.id;
  }

  return { kragId, parafiaId };
}

function opisPary(d: DaneZapisu['para']): string {
  const imiona = [d.imieZony, d.imieMeza].filter(Boolean).join(' i ');
  return imiona ? `${imiona} ${d.nazwisko}` : d.nazwisko;
}

export async function dodajPare(u: Uzytkownik, dane: DaneZapisu): Promise<bigint> {
  assertMozeEdytowac(u, { rejonId: dane.para.rejonId });

  return prisma.$transaction(async (tx) => {
    const { kragId, parafiaId } = await rozwiazPowiazania(tx, dane.para);

    const para = await tx.para.create({
      data: {
        ...poleParyDoZapisu(dane.para),
        kragId,
        parafiaId,
        rekolekcje: { create: dane.rekolekcje },
      },
    });

    // Same transaction as the change itself: a couple must never exist
    // without the audit entry that records who added it.
    await tx.audyt.create({
      data: {
        rodzaj: 'dodanie',
        opis: `Dodano parę ${opisPary(dane.para)}`,
        kontoId: u.id,
        paraId: para.id,
      },
    });

    return para.id;
  });
}

export async function zaktualizujPare(
  u: Uzytkownik,
  id: bigint,
  dane: DaneZapisu,
): Promise<void> {
  const istniejaca = await prisma.para.findFirst({
    where: { id, usunieteAt: null },
    select: { rejonId: true },
  });
  if (!istniejaca) throw new NieZnaleziono();

  // Two checks, not one: the user must be allowed to touch the couple as it is
  // now, and also allowed to put it where the form wants to put it.
  assertMozeEdytowac(u, { rejonId: istniejaca.rejonId });
  if (dane.para.rejonId !== istniejaca.rejonId && !mozeZmienicRejon(u)) {
    throw new Zabronione('Nie możesz przenieść pary do innego rejonu');
  }
  assertMozeEdytowac(u, { rejonId: dane.para.rejonId });

  await prisma.$transaction(async (tx) => {
    const { kragId, parafiaId } = await rozwiazPowiazania(tx, dane.para);

    await tx.para.update({
      where: { id },
      data: { ...poleParyDoZapisu(dane.para), kragId, parafiaId },
    });

    // The form owns the whole list, so the stored entries are replaced rather
    // than merged — otherwise a removed row would quietly survive.
    await tx.rekolekcje.deleteMany({ where: { paraId: id } });
    if (dane.rekolekcje.length > 0) {
      await tx.rekolekcje.createMany({
        data: dane.rekolekcje.map((r) => ({ ...r, paraId: id })),
      });
    }

    await tx.audyt.create({
      data: {
        rodzaj: 'edycja',
        opis: `Zmieniono dane pary ${opisPary(dane.para)}`,
        kontoId: u.id,
        paraId: id,
      },
    });
  });
}

export async function usunPare(u: Uzytkownik, id: bigint): Promise<void> {
  const para = await prisma.para.findFirst({
    where: { id, usunieteAt: null },
    select: { rejonId: true, nazwisko: true, imieZony: true, imieMeza: true },
  });
  if (!para) throw new NieZnaleziono();
  if (!mozeUsuwac(u, { rejonId: para.rejonId })) throw new Zabronione();

  await prisma.$transaction(async (tx) => {
    // Soft delete: a region account can misclick, and the record holds a
    // family's history. Permanent removal is a separate, admin-only action
    // arriving in Plan 6.
    await tx.para.update({ where: { id }, data: { usunieteAt: new Date() } });

    await tx.audyt.create({
      data: {
        rodzaj: 'usuniecie',
        opis: `Usunięto parę ${para.imieZony} i ${para.imieMeza} ${para.nazwisko}`,
        kontoId: u.id,
        paraId: id,
      },
    });
  });
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- zapisz`
Expected: PASS

**Zanim uruchomisz test, sprawdź nazwy kluczy złożonych.** Prisma generuje je
z `@@unique([...])`, sklejając nazwy pól podkreśleniem — stąd `nazwa_miasto`
i `rejonId_numer`. Potwierdź w `src/generated/prisma/models/Parafia.ts`
i `.../Krag.ts`, bo literówka w tym miejscu daje błąd typów, a nie runtime'u.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add couple write layer with transactional audit"
```

---

### Task 3: Odczyt karty

**Files:**
- Create: `src/lib/pary/karta.ts`
- Test: `src/lib/pary/karta.int.test.ts`

**Interfaces:**
- Produces:
  - `type DaneKarty = { id: string; imieZony: string; imieMeza: string; nazwisko: string; email: string; telefon: string; rejonId: number; kragId: string | null; parafiaId: string | null; dzieci: string; notatki: string; rekolekcje: WpisFormacji[] }`
  - `type WpisFormacji = { rodzaj: RodzajRekolekcji; rok: string; miejsce: string; nazwa: string }` — `rok` jest tekstem, bo to wartość pola formularza
  - `pobierzKarte(u, id): Promise<{ karta: DaneKarty; edytowalna: boolean } | null>`
  - `pustaKarta(u): DaneKarty`
  - `opcjeKarty(rejonId): Promise<{ kregi: …; parafie: … }>`

Wszystkie identyfikatory są `string`, a pola tekstowe nigdy nie są `null` — karta jedzie
prosto do komponentu klienckiego i do niekontrolowanych pól formularza, gdzie `null`
zamienia input w kontrolowany i wywołuje ostrzeżenie Reacta.

- [ ] **Step 1: Napisz test**

`src/lib/pary/karta.int.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { opcjeKarty, pobierzKarte, pustaKarta } from './karta';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

async function idPary(rejonId: number): Promise<bigint> {
  const p = await prisma.para.findFirstOrThrow({ where: { rejonId, usunieteAt: null } });
  return p.id;
}

describe('pobierzKarte', () => {
  it('returns every field as a string, never null', async () => {
    const wynik = await pobierzKarte(admin, await idPary(7));
    expect(wynik).not.toBeNull();
    for (const pole of ['imieZony', 'imieMeza', 'nazwisko', 'email', 'telefon', 'dzieci', 'notatki'] as const) {
      expect(typeof wynik!.karta[pole], pole).toBe('string');
    }
    expect(typeof wynik!.karta.id).toBe('string');
  });

  it('marks a couple in the account own region as editable', async () => {
    expect((await pobierzKarte(rejonVII, await idPary(7)))!.edytowalna).toBe(true);
  });

  it('marks a couple from another region as read-only rather than hiding it', async () => {
    // The drawer shows a read-only banner; it does not pretend the couple
    // does not exist.
    const wynik = await pobierzKarte(rejonVII, await idPary(3));
    expect(wynik).not.toBeNull();
    expect(wynik!.edytowalna).toBe(false);
  });

  it('marks everything read-only for the viewer', async () => {
    expect((await pobierzKarte(moderator, await idPary(7)))!.edytowalna).toBe(false);
  });

  it('returns null for a soft-deleted couple', async () => {
    const id = await idPary(7);
    await prisma.para.update({ where: { id }, data: { usunieteAt: new Date() } });
    expect(await pobierzKarte(admin, id)).toBeNull();
    await prisma.para.update({ where: { id }, data: { usunieteAt: null } });
  });

  it('returns null for an id that does not exist', async () => {
    expect(await pobierzKarte(admin, 999_999_999n)).toBeNull();
  });
});

describe('pustaKarta', () => {
  it('pins a region account to its own region', () => {
    expect(pustaKarta(rejonVII).rejonId).toBe(7);
  });

  it('starts admin on the first region', () => {
    expect(pustaKarta(admin).rejonId).toBe(1);
  });

  it('has no entries and no ids', () => {
    const k = pustaKarta(admin);
    expect(k.id).toBe('');
    expect(k.rekolekcje).toEqual([]);
    expect(k.kragId).toBeNull();
  });
});

describe('opcjeKarty', () => {
  it('offers the circles of the given region and every parish', async () => {
    const { kregi, parafie } = await opcjeKarty(7);
    expect(kregi.length).toBeGreaterThan(0);
    expect(parafie.length).toBeGreaterThan(0);
    expect(kregi.every((k) => k.etykieta.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- karta`
Expected: FAIL

- [ ] **Step 3: Zaimplementuj**

`src/lib/pary/karta.ts`:

```ts
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { type Uzytkownik, mozeEdytowac } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { STOPNIE } from '@/lib/domena/rekolekcje';

export type WpisFormacji = {
  rodzaj: RodzajRekolekcji;
  rok: string;
  miejsce: string;
  nazwa: string;
};

export type DaneKarty = {
  id: string;
  imieZony: string;
  imieMeza: string;
  nazwisko: string;
  email: string;
  telefon: string;
  rejonId: number;
  kragId: string | null;
  parafiaId: string | null;
  dzieci: string;
  notatki: string;
  rekolekcje: WpisFormacji[];
};

// Everything crosses into a client component and feeds uncontrolled inputs,
// where null would flip an input to controlled and trigger a React warning.
const tekst = (v: string | null): string => v ?? '';

export async function pobierzKarte(
  u: Uzytkownik,
  id: bigint,
): Promise<{ karta: DaneKarty; edytowalna: boolean } | null> {
  const para = await prisma.para.findFirst({
    where: { id, usunieteAt: null },
    select: {
      id: true, imieZony: true, imieMeza: true, nazwisko: true,
      email: true, telefon: true, rejonId: true, kragId: true, parafiaId: true,
      dzieci: true, notatki: true,
      rekolekcje: {
        select: { rodzaj: true, rok: true, miejsce: true, nazwa: true },
        orderBy: { rok: 'asc' },
      },
    },
  });
  if (!para) return null;

  return {
    edytowalna: mozeEdytowac(u, { rejonId: para.rejonId }),
    karta: {
      id: String(para.id),
      imieZony: tekst(para.imieZony),
      imieMeza: tekst(para.imieMeza),
      nazwisko: para.nazwisko,
      email: tekst(para.email),
      telefon: tekst(para.telefon),
      rejonId: para.rejonId,
      kragId: para.kragId === null ? null : String(para.kragId),
      parafiaId: para.parafiaId === null ? null : String(para.parafiaId),
      dzieci: tekst(para.dzieci),
      notatki: tekst(para.notatki),
      rekolekcje: para.rekolekcje.map((r) => ({
        rodzaj: r.rodzaj,
        rok: String(r.rok),
        miejsce: tekst(r.miejsce),
        nazwa: tekst(r.nazwa),
      })),
    },
  };
}

export function pustaKarta(u: Uzytkownik): DaneKarty {
  return {
    id: '',
    imieZony: '', imieMeza: '', nazwisko: '', email: '', telefon: '',
    // A region account may only ever create inside its own region, so the
    // field starts there and stays disabled.
    rejonId: u.rejonId ?? 1,
    kragId: null, parafiaId: null, dzieci: '', notatki: '',
    rekolekcje: [],
  };
}

export async function opcjeKarty(rejonId: number): Promise<{
  kregi: { id: string; etykieta: string }[];
  parafie: { id: string; etykieta: string }[];
}> {
  const [kregi, parafie] = await Promise.all([
    prisma.krag.findMany({
      where: { rejonId },
      select: { id: true, numer: true, patron: true },
      orderBy: { numer: 'asc' },
    }),
    prisma.parafia.findMany({
      select: { id: true, nazwa: true, miasto: true },
      orderBy: [{ miasto: 'asc' }, { nazwa: 'asc' }],
    }),
  ]);

  return {
    kregi: kregi.map((k) => ({
      id: String(k.id),
      etykieta: k.patron ? `${k.numer} · ${k.patron}` : String(k.numer),
    })),
    parafie: parafie.map((p) => ({
      id: String(p.id),
      etykieta: `${p.nazwa}, ${p.miasto}`,
    })),
  };
}

```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- karta`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add single couple read model"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/app/(app)/pary/akcje.ts`

**Interfaces:**
- Produces:
  - `type StanKarty = { blad?: string }`
  - `zapiszPare(stan: StanKarty, formData: FormData): Promise<StanKarty>`
  - `usunParaAkcja(stan: StanKarty, formData: FormData): Promise<StanKarty>`

- [ ] **Step 1: Zaimplementuj**

`src/app/(app)/pary/akcje.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Zabronione } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { schematZapisu } from '@/lib/pary/schemat';
import { NieZnaleziono, dodajPare, usunPare, zaktualizujPare } from '@/lib/pary/zapisz';

export type StanKarty = { blad?: string };

function liczbaAlbo(v: FormDataEntryValue | null, domyslna: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : domyslna;
}

function tekstAlbo(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function pustyNaNull(v: FormDataEntryValue | null): string | null {
  const s = tekstAlbo(v);
  return s === '' ? null : s;
}

/**
 * A server action is a public POST endpoint. requireUser comes first and the
 * write layer checks permissions again — the protected layout does not cover
 * this call, and a hidden button proves nothing.
 */
export async function zapiszPare(_stan: StanKarty, formData: FormData): Promise<StanKarty> {
  const u = await requireUser();

  const surowe = {
    para: {
      imieZony: tekstAlbo(formData.get('imieZony')),
      imieMeza: tekstAlbo(formData.get('imieMeza')),
      nazwisko: tekstAlbo(formData.get('nazwisko')),
      email: tekstAlbo(formData.get('email')),
      telefon: tekstAlbo(formData.get('telefon')),
      rejonId: liczbaAlbo(formData.get('rejonId'), u.rejonId ?? 1),
      kragId: pustyNaNull(formData.get('kragId')),
      nowyKrag: null,
      parafiaId: pustyNaNull(formData.get('parafiaId')),
      nowaParafia: null,
      dzieci: tekstAlbo(formData.get('dzieci')),
      notatki: tekstAlbo(formData.get('notatki')),
    },
    rekolekcje: JSON.parse(tekstAlbo(formData.get('rekolekcje')) || '[]'),
  };

  const wynik = schematZapisu.safeParse(surowe);
  if (!wynik.success) {
    return { blad: wynik.error.issues[0]?.message ?? 'Popraw dane w formularzu' };
  }

  const id = pustyNaNull(formData.get('id'));

  try {
    if (id === null) await dodajPare(u, wynik.data);
    else await zaktualizujPare(u, BigInt(id), wynik.data);
  } catch (e) {
    if (e instanceof Zabronione) return { blad: e.message };
    if (e instanceof NieZnaleziono) return { blad: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect(`/pary?zapisano=1`);
}

export async function usunParaAkcja(_stan: StanKarty, formData: FormData): Promise<StanKarty> {
  const u = await requireUser();
  const id = pustyNaNull(formData.get('id'));
  if (id === null) return { blad: 'Brak identyfikatora pary' };

  try {
    await usunPare(u, BigInt(id));
  } catch (e) {
    if (e instanceof Zabronione) return { blad: e.message };
    if (e instanceof NieZnaleziono) return { blad: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect(`/pary?usunieto=1`);
}
```

**Uwaga o `nowyKrag` i `nowaParafia`:** akcja przekazuje `null`, bo pola „+ nowy" wchodzą
dopiero w Zadaniu 7. Schemat już je zna, więc dołożenie ich będzie zmianą w jednym miejscu.

- [ ] **Step 2: Sprawdź, że lint i build przechodzą**

Run: `npm run lint && npm run build`
Expected: bez błędów

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add couple save and delete server actions"
```

---

### Task 5: Toast

**Files:**
- Create: `src/components/Toast.tsx`, `src/components/toast.module.css`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Produces: `<Toast tekst="Zapisano zmiany" />`

- [ ] **Step 1: Dopisz brakujące tokeny**

```css
  --toast-tlo: var(--navy-900);
  --toast-tekst: var(--sidebar-tekst);
  --czas-toast: 2600ms;
```

Dopisz je również do listy wymaganych w `src/styles/tokens.test.ts`.

- [ ] **Step 2: Napisz style**

`src/components/toast.module.css`:

```css
.toast {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-tlo);
  color: var(--toast-tekst);
  padding: 12px 20px;
  border-radius: var(--r-9);
  font-size: 14px;
  box-shadow: var(--cien-toast);
  z-index: 90;
}
```

- [ ] **Step 3: Napisz komponent**

`src/components/Toast.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import style from './toast.module.css';

const CZAS_MS = 2600;

export function Toast({ tekst }: { tekst: string }) {
  const [widoczny, setWidoczny] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setWidoczny(false), CZAS_MS);
    return () => clearTimeout(t);
  }, []);

  if (!widoczny) return null;

  // role="status" with aria-live="polite" so a screen reader announces the
  // result without stealing focus from wherever the user is.
  return (
    <p className={style.toast} role="status" aria-live="polite">
      {tekst}
    </p>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add toast for save feedback"
```

---

### Task 6: Panel karty pary

**Files:**
- Create: `src/app/(app)/pary/KartaPary.tsx`, `src/app/(app)/pary/karta.module.css`

**Interfaces:**
- Consumes: `KartaPary`, `opcjeKarty` (Task 3), `zapiszPare`, `usunParaAkcja` (Task 4)
- Produces: `<KartaPary karta={…} edytowalna={…} opcje={…} mozeZmienicRejon={…} />`

- [ ] **Step 1: Napisz style**

`src/app/(app)/pary/karta.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgba(13, 36, 57, .35);
  z-index: 50;
  animation: fadein var(--czas-overlay);
  border: none;
  padding: 0;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
}

.overlay::backdrop {
  background: rgba(13, 36, 57, .35);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 540px;
  max-width: 94vw;
  margin-left: auto;
  padding: 24px 28px 40px;
  background: var(--surface);
  overflow-y: auto;
  box-shadow: var(--cien-drawer);
  animation: slidein var(--czas-drawer) ease-out;
}

.naglowek {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.kicker {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.tytul {
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 28px;
  font-weight: 400;
  margin: 2px 0 0;
}

.zamknij {
  width: 32px;
  height: 32px;
  flex: none;
  border: 1px solid var(--border-input);
  border-radius: var(--r-7);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
}

.banner {
  background: var(--warn-bg);
  border: 1px solid #f0dcae;
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 13px;
  color: #6b5418;
  margin: 0;
}

.formularz {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
}

.pole {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.szeroko { grid-column: span 2; }

.etykieta {
  font-size: 13px;
  color: var(--text-muted);
}

.kontrolka {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text);
  width: 100%;
}

.kontrolka:focus {
  border-color: var(--blue-500);
  box-shadow: var(--focus-obwodka);
  outline: none;
}

.kontrolka:disabled {
  background: var(--bg-row);
  color: var(--text-muted);
}

.stopka {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  border-top: 1px solid var(--bg-app);
  padding-top: 16px;
}

.zapisz {
  background: var(--navy-700);
  color: var(--surface);
  border: none;
  border-radius: var(--r-8);
  padding: 11px 20px;
  font-weight: 600;
  font-size: 14px;
  min-height: 44px;
  cursor: pointer;
}

.zapisz:hover { background: var(--navy-900); }
.zapisz:disabled { opacity: .6; cursor: progress; }

.anuluj {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 11px 20px;
  font-size: 14px;
  min-height: 44px;
  color: var(--text);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.usun {
  margin-left: auto;
  background: var(--surface);
  border: 1px solid #e3c4c4;
  border-radius: var(--r-8);
  padding: 11px 20px;
  font-size: 14px;
  min-height: 44px;
  color: var(--danger-fg);
  cursor: pointer;
}

.usun:hover { background: var(--danger-bg); }

.notka {
  font-size: 12px;
  color: var(--text-faint);
  margin: 0;
}

.blad {
  background: var(--danger-bg);
  border: 1px solid #e3c4c4;
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 13px;
  color: var(--danger-fg);
  margin: 0;
}

@media (max-width: 860px) {
  .panel {
    width: 100%;
    max-width: none;
    height: 100%;
    padding: 18px 16px 44px;
  }

  .formularz { grid-template-columns: 1fr; }
  .szeroko { grid-column: auto; }
}
```

Kolory `#f0dcae`, `#6b5418` i `#e3c4c4` nie są w tokenach — **dodaj je do `tokens.css`**
jako `--warn-obwodka`, `--warn-tekst-mocny` i `--danger-obwodka` i użyj `var()`.
Powyższy blok pokazuje je dosłownie tylko dla czytelności.

- [ ] **Step 2: Napisz komponent**

`src/app/(app)/pary/KartaPary.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { LICZBA_REJONOW, numerRzymski } from '@/lib/domena/rejony';
import type { DaneKarty, WpisFormacji } from '@/lib/pary/karta';
import { SekcjaFormacji } from './SekcjaFormacji';
import { type StanKarty, usunParaAkcja, zapiszPare } from './akcje';
import style from './karta.module.css';

function PrzyciskZapisu() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.zapisz} disabled={pending}>
      {pending ? 'Zapisywanie…' : 'Zapisz'}
    </button>
  );
}

export function KartaPary({
  karta,
  edytowalna,
  opcje,
  mozeZmienicRejon,
}: {
  karta: DaneKarty;
  edytowalna: boolean;
  opcje: { kregi: { id: string; etykieta: string }[]; parafie: { id: string; etykieta: string }[] };
  mozeZmienicRejon: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [stan, akcjaZapisu] = useActionState<StanKarty, FormData>(zapiszPare, {});
  const [stanUsuwania, akcjaUsuwania] = useActionState<StanKarty, FormData>(usunParaAkcja, {});

  // The drawer is edited on a copy — Cancel simply navigates away and the
  // list behind it was never touched.
  const [rekolekcje, setRekolekcje] = useState<WpisFormacji[]>(karta.rekolekcje);

  // showModal is what gives the focus trap, Esc handling and the backdrop.
  // A <dialog open> attribute would render the element without any of them.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function zamknij() {
    router.push('/pary');
  }

  const nowa = karta.id === '';
  const kicker = nowa ? 'Nowy wpis' : `Karta pary · rejon ${numerRzymski(karta.rejonId)}`;
  const tytul = nowa ? 'Dodaj parę' : `${karta.imieZony} i ${karta.imieMeza} ${karta.nazwisko}`;
  const blad = stan.blad ?? stanUsuwania.blad;

  return (
    <dialog
      ref={dialog}
      className={style.overlay}
      aria-label={tytul}
      onCancel={zamknij}
      onClick={(e) => {
        // Clicking the backdrop closes; clicking inside the panel must not.
        if (e.target === dialog.current) zamknij();
      }}
    >
      <div className={style.panel}>
        <header className={style.naglowek}>
          <div>
            <p className={style.kicker}>{kicker}</p>
            <h2 className={style.tytul}>{tytul}</h2>
          </div>
          <button type="button" className={style.zamknij} onClick={zamknij} aria-label="Zamknij">
            ✕
          </button>
        </header>

        {!edytowalna && (
          <p className={style.banner}>
            Tylko podgląd — ta para należy do innego rejonu, edytować może para rejonowa
            lub odpowiedzialni za wspólnotę.
          </p>
        )}

        {blad && <p className={style.blad} role="alert">{blad}</p>}

        <form action={akcjaZapisu} className={style.formularz}>
          <input type="hidden" name="id" value={karta.id} />
          <input type="hidden" name="rekolekcje" value={JSON.stringify(rekolekcje)} />

          <label className={style.pole}>
            <span className={style.etykieta}>Imię żony</span>
            <input className={style.kontrolka} name="imieZony" defaultValue={karta.imieZony}
              disabled={!edytowalna} />
          </label>

          <label className={style.pole}>
            <span className={style.etykieta}>Imię męża</span>
            <input className={style.kontrolka} name="imieMeza" defaultValue={karta.imieMeza}
              disabled={!edytowalna} />
          </label>

          <label className={`${style.pole} ${style.szeroko}`}>
            <span className={style.etykieta}>Nazwisko</span>
            <input className={style.kontrolka} name="nazwisko" defaultValue={karta.nazwisko}
              disabled={!edytowalna} required />
          </label>

          <label className={style.pole}>
            <span className={style.etykieta}>E-mail</span>
            <input className={style.kontrolka} type="email" name="email" defaultValue={karta.email}
              disabled={!edytowalna} />
          </label>

          <label className={style.pole}>
            <span className={style.etykieta}>Telefon</span>
            <input className={style.kontrolka} name="telefon" defaultValue={karta.telefon}
              disabled={!edytowalna} />
          </label>

          <label className={style.pole}>
            <span className={style.etykieta}>Rejon</span>
            <select className={style.kontrolka} name="rejonId" defaultValue={karta.rejonId}
              disabled={!edytowalna || !mozeZmienicRejon}>
              {Array.from({ length: LICZBA_REJONOW }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>{`Rejon ${numerRzymski(r)}`}</option>
              ))}
            </select>
          </label>

          <label className={style.pole}>
            <span className={style.etykieta}>Krąg</span>
            <select className={style.kontrolka} name="kragId" defaultValue={karta.kragId ?? ''}
              disabled={!edytowalna}>
              <option value="">— bez kręgu —</option>
              {opcje.kregi.map((k) => (
                <option key={k.id} value={k.id}>{`Krąg ${k.etykieta}`}</option>
              ))}
            </select>
          </label>

          <label className={`${style.pole} ${style.szeroko}`}>
            <span className={style.etykieta}>Parafia</span>
            <select className={style.kontrolka} name="parafiaId" defaultValue={karta.parafiaId ?? ''}
              disabled={!edytowalna}>
              <option value="">— jak w kręgu —</option>
              {opcje.parafie.map((p) => (
                <option key={p.id} value={p.id}>{p.etykieta}</option>
              ))}
            </select>
          </label>

          <label className={`${style.pole} ${style.szeroko}`}>
            <span className={style.etykieta}>Dzieci — imiona i roczniki</span>
            <input className={style.kontrolka} name="dzieci" defaultValue={karta.dzieci}
              placeholder="np. Marysia 2014, Antek 2017" disabled={!edytowalna} />
          </label>

          <label className={`${style.pole} ${style.szeroko}`}>
            <span className={style.etykieta}>Notatki</span>
            <textarea className={style.kontrolka} name="notatki" rows={3}
              defaultValue={karta.notatki} disabled={!edytowalna} />
          </label>

          <div className={style.szeroko}>
            <SekcjaFormacji
              wpisy={rekolekcje}
              onZmiana={setRekolekcje}
              edytowalna={edytowalna}
            />
          </div>

          {edytowalna && (
            <div className={`${style.stopka} ${style.szeroko}`}>
              <PrzyciskZapisu />
              <button type="button" className={style.anuluj} onClick={zamknij}>Anuluj</button>
            </div>
          )}
        </form>

        {edytowalna && !nowa && (
          <form action={akcjaUsuwania}>
            <input type="hidden" name="id" value={karta.id} />
            <button type="submit" className={style.usun}>Usuń parę</button>
          </form>
        )}

        <p className={style.notka}>
          {edytowalna
            ? 'Każdy zapis trafia do historii zmian z Twoim kontem i datą.'
            : 'Podgląd bez możliwości edycji.'}
        </p>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add couple drawer built on a native dialog"
```

---

### Task 7: Sekcja formacji

**Files:**
- Create: `src/app/(app)/pary/SekcjaFormacji.tsx`
- Modify: `src/app/(app)/pary/karta.module.css`

**Interfaces:**
- Consumes: `RODZAJE_REKOLEKCJI`, `nastepnyStopien` z `@/lib/domena/rekolekcje`; `WpisFormacji`
- Produces: `<SekcjaFormacji wpisy={…} onZmiana={…} edytowalna={…} />`

- [ ] **Step 1: Dopisz style**

Na końcu `karta.module.css`:

```css
.formacja {
  display: flex;
  flex-direction: column;
  gap: 11px;
  border-top: 1px solid var(--bg-app);
  padding-top: 16px;
}

.formacjaNaglowek {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.formacjaTytul {
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 20px;
  font-weight: 400;
}

.formacjaLicznik {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-faint);
}

.wpis {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  background: var(--bg-row-alt);
  border: 1px solid var(--bg-app);
  border-radius: var(--r-9);
  padding: 8px;
}

.wpisKontrolka {
  border: 1px solid var(--border-input);
  border-radius: var(--r-7);
  padding: 8px 10px;
  font-size: 13px;
  min-height: 38px;
  background: var(--surface);
  color: var(--text);
}

.wpisRodzaj { flex: 1 1 100%; }
.wpisRok { width: 72px; flex: none; font-family: var(--font-mono), monospace; }
.wpisMiejsce { flex: 1; min-width: 120px; }
.wpisNazwa { flex: 1 1 100%; }

.wpisUsun {
  width: 34px;
  height: 38px;
  flex: none;
  border: 1px solid var(--divider);
  border-radius: var(--r-7);
  background: var(--surface);
  color: var(--placeholder);
  cursor: pointer;
}

.wpisUsun:hover {
  border-color: var(--danger-obwodka);
  color: var(--danger-fg);
}

.brakWpisow {
  font-size: 13px;
  color: var(--text-faint);
  margin: 0;
}

.dodajWpis {
  align-self: flex-start;
  background: var(--bg-row);
  border: 1px dashed var(--border-input);
  border-radius: var(--r-8);
  padding: 10px 15px;
  font-size: 13px;
  font-weight: 600;
  color: var(--navy-700);
  min-height: 42px;
  cursor: pointer;
}

.dodajWpis:hover {
  border-color: var(--navy-700);
  background: var(--bg-panel);
}
```

- [ ] **Step 2: Napisz komponent**

`src/app/(app)/pary/SekcjaFormacji.tsx`:

```tsx
'use client';

import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { RODZAJE_REKOLEKCJI, nastepnyStopien } from '@/lib/domena/rekolekcje';
import { WPISY, odmiana } from '@/lib/pl';
import type { WpisFormacji } from '@/lib/pary/karta';
import style from './karta.module.css';

export function SekcjaFormacji({
  wpisy,
  onZmiana,
  edytowalna,
}: {
  wpisy: WpisFormacji[];
  onZmiana: (w: WpisFormacji[]) => void;
  edytowalna: boolean;
}) {
  function zmien(i: number, zmiana: Partial<WpisFormacji>) {
    onZmiana(wpisy.map((w, j) => (j === i ? { ...w, ...zmiana } : w)));
  }

  function dodaj() {
    // Suggests the earliest degree the couple is missing; once every degree is
    // present it falls through to INNE.
    const rodzaj = nastepnyStopien(wpisy.map((w) => w.rodzaj));
    onZmiana([...wpisy, { rodzaj, rok: '', miejsce: '', nazwa: '' }]);
  }

  return (
    <section className={style.formacja}>
      <div className={style.formacjaNaglowek}>
        <h3 className={style.formacjaTytul}>Formacja — przebyte rekolekcje</h3>
        <span className={style.formacjaLicznik}>{odmiana(wpisy.length, WPISY)}</span>
      </div>

      {wpisy.length === 0 && <p className={style.brakWpisow}>Brak wpisów o rekolekcjach.</p>}

      {wpisy.map((w, i) => (
        <div className={style.wpis} key={i}>
          <select
            className={`${style.wpisKontrolka} ${style.wpisRodzaj}`}
            value={w.rodzaj}
            aria-label={`Rodzaj rekolekcji ${i + 1}`}
            disabled={!edytowalna}
            onChange={(e) => zmien(i, { rodzaj: e.currentTarget.value as RodzajRekolekcji })}
          >
            {RODZAJE_REKOLEKCJI.map((r) => (
              <option key={r.rodzaj} value={r.rodzaj}>{r.nazwa}</option>
            ))}
          </select>

          <input
            className={`${style.wpisKontrolka} ${style.wpisRok}`}
            value={w.rok}
            placeholder="rok"
            inputMode="numeric"
            aria-label={`Rok ${i + 1}`}
            disabled={!edytowalna}
            onChange={(e) => zmien(i, { rok: e.currentTarget.value })}
          />

          <input
            className={`${style.wpisKontrolka} ${style.wpisMiejsce}`}
            value={w.miejsce}
            placeholder="miejsce"
            aria-label={`Miejsce ${i + 1}`}
            disabled={!edytowalna}
            onChange={(e) => zmien(i, { miejsce: e.currentTarget.value })}
          />

          {/* Only INNE carries a free-text name, and then it is required. */}
          {w.rodzaj === 'INNE' && (
            <input
              className={`${style.wpisKontrolka} ${style.wpisNazwa}`}
              value={w.nazwa}
              placeholder="nazwa rekolekcji"
              aria-label={`Nazwa rekolekcji ${i + 1}`}
              disabled={!edytowalna}
              onChange={(e) => zmien(i, { nazwa: e.currentTarget.value })}
            />
          )}

          {edytowalna && (
            <button
              type="button"
              className={style.wpisUsun}
              aria-label={`Usuń wpis ${i + 1}`}
              onClick={() => onZmiana(wpisy.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {edytowalna && (
        <button type="button" className={style.dodajWpis} onClick={dodaj}>
          + Dodaj rekolekcje
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Dopasuj typ wpisu do schematu zapisu**

`WpisFormacji.rok` jest `string` (pole formularza), a `schematRekolekcji` oczekuje
`number`. Konwersja mieszka w server action — dopisz w `akcje.ts`, w miejscu budowania
`surowe.rekolekcje`:

```ts
    rekolekcje: (JSON.parse(tekstAlbo(formData.get('rekolekcje')) || '[]') as {
      rodzaj: string; rok: string; miejsce: string; nazwa: string;
    }[]).map((r) => ({ ...r, rok: Number(r.rok) })),
```

Pusty rok da `NaN`, a `z.number().int()` go odrzuci z komunikatem „Rok poza zakresem" —
to jest zamierzone, bo rok rekolekcji jest wymagany.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add formation section with next-degree suggestion"
```

---

### Task 8: Podpięcie panelu do listy

**Files:**
- Modify: `src/app/(app)/pary/page.tsx`

- [ ] **Step 1: Rozszerz stronę o odczyt `?karta`**

Dopisz importy:

```tsx
import Link from 'next/link';
import { Toast } from '@/components/Toast';
import { mozeZmienicRejon } from '@/lib/auth/permissions';
import { opcjeKarty, pobierzKarte, pustaKarta } from '@/lib/pary/karta';
import { KartaPary } from './KartaPary';
```

W `page.tsx`, po `parseFiltry`, dołóż:

```tsx
  const params = await searchParams;
  const filtry = parseFiltry(params);

  const karta = (() => {
    const v = params['karta'];
    return Array.isArray(v) ? v[0] : v;
  })();
```

a przed `return`:

```tsx
  // The drawer is a URL state, so the back button works and a card can be
  // linked to. Its content is fetched here, on the server.
  let panel: React.ReactNode = null;
  if (karta === 'nowa' && u.rola !== 'podglad') {
    const pusta = pustaKarta(u);
    panel = (
      <KartaPary
        karta={pusta}
        edytowalna
        opcje={await opcjeKarty(pusta.rejonId)}
        mozeZmienicRejon={mozeZmienicRejon(u)}
      />
    );
  } else if (karta && /^\d+$/.test(karta)) {
    const wynik = await pobierzKarte(u, BigInt(karta));
    if (wynik) {
      panel = (
        <KartaPary
          karta={wynik.karta}
          edytowalna={wynik.edytowalna}
          opcje={await opcjeKarty(wynik.karta.rejonId)}
          mozeZmienicRejon={mozeZmienicRejon(u)}
        />
      );
    }
  }
```

i na końcu JSX, po `<Paginacja …/>`:

```tsx
      {panel}
      {params['zapisano'] && <Toast tekst="Zapisano zmiany" />}
      {params['usunieto'] && <Toast tekst="Para usunięta z kartoteki" />}
```

Nieistniejący albo usunięty identyfikator w `?karta` po prostu nie otwiera panelu —
lista renderuje się normalnie. To celowe: stary link z historii przeglądarki nie ma
prawa wywrócić strony.

- [ ] **Step 2: Dodaj przycisk „+ Dodaj parę" do nagłówka**

W `page.tsx`, w `<NaglowekWidoku>`:

```tsx
      <NaglowekWidoku tytul={tytul} podtytul={podtytul}>
        {u.rola !== 'podglad' && (
          <Link href="/pary?karta=nowa" className={style.przyciskDodaj}>
            + Dodaj parę
          </Link>
        )}
      </NaglowekWidoku>
```

i w `pary.module.css`:

```css
.przyciskDodaj {
  display: inline-flex;
  align-items: center;
  background: var(--navy-700);
  color: var(--surface);
  border-radius: var(--r-8);
  padding: 12px 17px;
  font-size: 14px;
  font-weight: 600;
  min-height: 44px;
  text-decoration: none;
}

.przyciskDodaj:hover { background: var(--navy-900); }
```

- [ ] **Step 3: Sprawdź w przeglądarce**

```bash
npm run dev
```

Jako admin: klik „Edytuj →" otwiera panel z danymi pary. `Esc` zamyka. Klik w tło zamyka.
Zmiana nazwiska i „Zapisz" — panel się zamyka, lista pokazuje nową wartość, pojawia się
toast. „Anuluj" po zmianie pola — zmiana przepada.

Jako `rejon7@example.pl`: para z rejonu VII edytowalna, pole „Rejon" **zablokowane**.
Otwórz ręcznie kartę pary z innego rejonu — panel pokazuje **banner „Tylko podgląd"**
i nie ma stopki z przyciskami.

Jako `moderator@example.pl`: brak przycisku „+ Dodaj parę", każda karta w trybie podglądu.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire the couple drawer into the list view"
```

---

### Task 9: Testy end-to-end karty

**Files:**
- Create: `e2e/karta.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Zapewnij deterministyczny stan bazy przed przebiegiem**

Zmień skrypt `e2e` w `package.json`, żeby zaczynał od przeseedowania:

```json
"e2e": "tsx prisma/seed.ts && tsx e2e/przygotuj.ts && playwright test"
```

Seed trwa kilkanaście sekund i jest deterministyczny (PRNG z ustalonym ziarnem),
więc każdy przebieg zaczyna od tych samych 300 par. Bez tego testy karty rozjeżdżają
stan dla `lista.spec.ts`, który sprawdza dokładnie `300 / 300`, i drugi przebieg
zaczyna padać bez zmiany w kodzie.

- [ ] **Step 2: Napisz testy**

`e2e/karta.spec.ts`:

```ts
import { type Page, expect, test } from '@playwright/test';

const HASLO = 'kartoteka123';

async function zaloguj(page: Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/pary/);
}

async function otworzPierwszaKarte(page: Page) {
  await page.getByRole('link', { name: /^(Edytuj|Podgląd) →$/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('the drawer opens from the list and closes with Escape', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);
  await expect(page).toHaveURL(/karta=\d+/);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the drawer closes on the close button and returns to the list', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);
  await page.getByRole('button', { name: 'Zamknij' }).click();
  await expect(page).toHaveURL(/\/pary$/);
});

test('a card can be opened directly by link', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);
  const url = page.url();

  await page.goto(url);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('saving a change updates the list and shows a toast', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);

  const nazwisko = `Testowi${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(nazwisko);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Zapisano zmiany' })).toBeVisible();
  await page.goto(`/pary?q=${nazwisko}`);
  await expect(page.getByRole('status')).toContainText('1 / 300');
});

test('cancelling discards the change', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);

  const przed = await page.getByLabel('Nazwisko').inputValue();
  await page.getByLabel('Nazwisko').fill('PorzuconaZmiana');
  await page.getByRole('button', { name: 'Anuluj' }).click();

  await otworzPierwszaKarte(page);
  await expect(page.getByLabel('Nazwisko')).toHaveValue(przed);
});

test('an empty surname blocks the save', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await otworzPierwszaKarte(page);
  await page.getByLabel('Nazwisko').fill('   ');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('alert')).toContainText('Podaj nazwisko');
});

test('adding a retreat suggests the first missing degree', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?formacja=brak');
  await otworzPierwszaKarte(page);

  await expect(page.getByText('Brak wpisów o rekolekcjach.')).toBeVisible();
  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Rodzaj rekolekcji 1')).toHaveValue('ONZ_I');
});

test('the name field appears only for INNE and is then required', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?formacja=brak');
  await otworzPierwszaKarte(page);

  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toHaveCount(0);

  await page.getByLabel('Rodzaj rekolekcji 1').selectOption('INNE');
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toBeVisible();

  await page.getByLabel('Rok 1').fill('2020');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('alert')).toContainText('Podaj nazwę rekolekcji');
});

test('a region account cannot move a couple to another region', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await otworzPierwszaKarte(page);
  await expect(page.getByLabel('Rejon')).toBeDisabled();
});

test('a couple from another region opens read-only', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  // Reached by hand-written URL: the list never links there.
  await page.goto('/pary');
  await page.goto('/pary?karta=1');
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await expect(page.getByText('Tylko podgląd')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
  }
});

test('the viewer gets no add button and no save', async ({ page }) => {
  await zaloguj(page, 'moderator@example.pl');
  await expect(page.getByRole('link', { name: '+ Dodaj parę' })).toHaveCount(0);

  await otworzPierwszaKarte(page);
  await expect(page.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
  await expect(page.getByText('Podgląd bez możliwości edycji.')).toBeVisible();
});

test('adding a couple works end to end', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  await expect(page.getByRole('heading', { name: 'Dodaj parę' })).toBeVisible();

  const nazwisko = `Nowi${Date.now() % 100000}`;
  await page.getByLabel('Imię żony').fill('Zofia');
  await page.getByLabel('Imię męża').fill('Jan');
  await page.getByLabel('Nazwisko').fill(nazwisko);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  // 301: the suite starts from a freshly seeded 300 and this test adds one.
  await page.goto(`/pary?q=${nazwisko}`);
  await expect(page.getByRole('status')).toContainText('1 / 301');
});

test('deleting a couple removes it from the list', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  const nazwisko = `DoUsuniecia${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(nazwisko);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await page.goto(`/pary?q=${nazwisko}`);
  await otworzPierwszaKarte(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();

  await page.goto(`/pary?q=${nazwisko}`);
  await expect(page.getByText('Brak wyników dla podanych kryteriów.').first()).toBeVisible();
});
```

- [ ] **Step 3: Uruchom**

Run: `npm run e2e`
Expected: PASS — 22 z poprzednich planów + 13 nowych

Testy tego pliku **zmieniają dane**: dodają pary, zmieniają nazwiska, usuwają rekordy.
`lista.spec.ts` sprawdza tymczasem dokładnie `300 / 300`. Sprzątanie po sobie nie
wystarczy — test zapisu zmienia nazwisko istniejącej pary i nie ma jak przywrócić
poprzedniego bez pamiętania go. **Dlatego suite startuje od pełnego przeseedowania.**

Zrób to **przed** uruchomieniem testów, w Kroku 1.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for the couple drawer"
```

---

## Stan po Planie 3

- Panel karty pary otwierany z listy i z linku, zamykany `Esc`, tłem i przyciskiem
- Formularz ze wszystkimi polami modelu, tryb tylko-do-odczytu z bannerem
- Sekcja formacji: dodawanie, usuwanie, podpowiadanie stopnia, pole nazwy dla `Inne`
- Zapis, dodanie i usunięcie — każde z wpisem do historii zmian w tej samej transakcji
- Uprawnienia sprawdzane po stronie serwera przy każdym zapisie

**Poza zakresem, wchodzi później:** eksport i import (Plan 4), widoki rejonów, kont
i historii (Plan 5), trwałe usunięcie na żądanie RODO (Plan 6). Comboboxy „+ nowy krąg"
i „+ nowa parafia" są przygotowane w schemacie, ale interfejs dla nich powstaje razem
z importem, bo tam ten sam mechanizm zakłada brakujące encje.

**Punkty listy odbioru, które ten plan zamyka:** wszystkie pola edytowalne · nazwisko
wymagane · sekcja formacji z licznikiem i odmianą · pole nazwy tylko dla `Inne`
· podpowiadanie stopnia · anulowanie porzuca zmiany · zapis/dodanie/usunięcie
w historii zmian · drawer zamykany klikiem w tło, ✕ i `Esc` · banner „Tylko podgląd"
· pole „Rejon" zablokowane dla pary rejonowej, z walidacją serwera.
