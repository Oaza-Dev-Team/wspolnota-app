# Kartoteka DK — Plan 3: Karta pary i formacja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Podłączyć pod istniejący adres `/pary?card=<id>` panel boczny z pełną kartą pary — formularz, sekcję formacji, tryb tylko-do-odczytu, zapis i usuwanie, każde z wpisem do historii zmian.

**Architecture:** Panel to natywny `<dialog showModal>` — daje focus trap, `Esc`, `aria-modal` i powrót fokusu bez własnego kodu. Treść renderuje się na serwerze; klienckie jest tylko to, co musi być: otwarcie dialogu, szkic formularza i sekcja formacji. Zapis mieszka w `lib/couples/save.ts`, nie w server action, bo import z Excela w Planie 4 musi przejść przez tę samą walidację i ten sam zapis.

**Tech Stack:** Next.js 16.3 · React 19.2 · Prisma 7.9 · Zod 4 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` (§3 nazewnictwo, §4.3, §4.4, §7, §9)
**Wygląd — nadrzędny:** `docs/handoff/README.md` §4 (Panel pary)
**Zrzuty:** `docs/handoff/screenshots/03-karta-pary-pelna.png`, `04-formacja-rekolekcje.png`

## Global Constraints

- **Wersje:** Next.js 16.3.1 · React 19.2 · TypeScript `strict` + `noUncheckedIndexedAccess` · `target: ES2022` · Prisma 7.9 · Zod 4
- **Nazewnictwo (spec §3):** po polsku wyłącznie to, co czyta człowiek — teksty interfejsu, formy odmiany, ścieżki tras, kody rekolekcji. **Identyfikatory, nazwy plików, klasy CSS, pola bazy, komentarze, testy i commity po angielsku.** Parametry zapytania też po angielsku.
- **Bez MUI i bez Tailwinda.** CSS Modules + tokeny z `src/styles/tokens.css`; literał koloru, odstępu, promienia lub cienia w `.module.css` to błąd.
- **Bezpieczeństwo:** żadna server action nie dotyka Prismy przed `requireUser()`. Uprawnienia sprawdzane na serwerze przy każdym zapisie, nie ukrywaniem przycisków.
- **Audyt w tej samej transakcji co zmiana.**
- **Commity** po każdym zadaniu, po angielsku, w trybie rozkazującym.

## Cztery rzeczy z poprzednich planów

1. **`searchParams` to `Promise`** — trzeba `await`.
2. **Kolumny `search_text` są `GENERATED ALWAYS`.** Postgres je wylicza; wymienienie ich w `data` przy `create` lub `update` kończy się błędem bazy.
3. **`bigint` nie przechodzi przez granicę serwer–klient** — identyfikatory jadą jako `string`.
4. **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Sprawdź `prisma migrate status`, zanim uznasz, że padła.

---

## Struktura plików

```
src/lib/couples/
  schema.ts               schemat Zod pary i wpisu formacji — wspólny dla formularza,
                          server action i (w Planie 4) importu
  save.ts                 create / update / delete + audyt w jednej transakcji
  card.ts                 odczyt pojedynczej pary wraz z opcjami kręgów i parafii

src/app/(app)/pary/
  actions.ts              server actions — cienkie adaptery nad save.ts
  CoupleCard.tsx          dialog + formularz (klient)
  FormationSection.tsx    wiersze wpisów formacji
  card.module.css

src/components/
  Toast.tsx
  toast.module.css

e2e/
  card.spec.ts
```

---

### Task 1: Schemat walidacji

**Files:**
- Create: `src/lib/couples/schema.ts`
- Test: `src/lib/couples/schema.test.ts`

**Interfaces:**
- Produces: `coupleSchema`, `retreatSchema`, `saveSchema`, `type CoupleInput`, `type RetreatInput`, `type SaveInput`

- [ ] **Step 1: Napisz test**

`src/lib/couples/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coupleSchema, retreatSchema, saveSchema } from './schema';

const validCouple = {
  wifeName: 'Anna', husbandName: 'Piotr', surname: 'Kowalscy',
  email: 'kowalscy@example.pl', phone: '+48 601 202 303',
  regionId: 7, circleId: '12', newCircle: null, parishId: '3', newParish: null,
  children: 'Marysia 2014', notes: '',
};

describe('coupleSchema', () => {
  it('accepts a fully filled couple', () => {
    expect(coupleSchema.safeParse(validCouple).success).toBe(true);
  });

  // The only hard requirement from the acceptance checklist.
  it('requires a surname', () => {
    const result = coupleSchema.safeParse({ ...validCouple, surname: '   ' });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Podaj nazwisko');
  });

  it('treats blank optional fields as absent rather than as empty strings', () => {
    const parsed = coupleSchema.parse({ ...validCouple, email: '', phone: '', children: '' });
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.children).toBeNull();
  });

  it('rejects a malformed e-mail but allows none at all', () => {
    expect(coupleSchema.safeParse({ ...validCouple, email: 'not-an-email' }).success).toBe(false);
    expect(coupleSchema.safeParse({ ...validCouple, email: '' }).success).toBe(true);
  });

  it('rejects a region outside the range', () => {
    expect(coupleSchema.safeParse({ ...validCouple, regionId: 12 }).success).toBe(false);
    expect(coupleSchema.safeParse({ ...validCouple, regionId: 0 }).success).toBe(false);
  });

  it('refuses a circle given both by id and as a new one', () => {
    expect(coupleSchema.safeParse({
      ...validCouple, circleId: '12',
      newCircle: { number: 4, patron: 'św. Rity', parishId: '3' },
    }).success).toBe(false);
  });
});

describe('retreatSchema', () => {
  it('accepts a degree entry without a name', () => {
    expect(retreatSchema.safeParse({
      kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: '',
    }).success).toBe(true);
  });

  it('requires a name for INNE', () => {
    const result = retreatSchema.safeParse({
      kind: 'INNE', year: 2014, place: 'Chmielno', name: '',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Podaj nazwę rekolekcji');
  });

  it('keeps the year inside the range the database enforces', () => {
    expect(retreatSchema.safeParse({ kind: 'ONZ_I', year: 1969, place: '', name: '' }).success)
      .toBe(false);
    expect(retreatSchema.safeParse({ kind: 'ONZ_I', year: 2101, place: '', name: '' }).success)
      .toBe(false);
  });
});

describe('saveSchema', () => {
  it('validates the couple and its entries together', () => {
    expect(saveSchema.safeParse({
      couple: validCouple,
      retreats: [{ kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: '' }],
    }).success).toBe(true);
  });

  it('fails when any entry is invalid', () => {
    expect(saveSchema.safeParse({
      couple: validCouple,
      retreats: [{ kind: 'INNE', year: 2014, place: '', name: '' }],
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- schema`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/couples/schema.ts`:

```ts
import { z } from 'zod';
import { REGION_COUNT } from '@/lib/domain/regions';
import { RETREAT_KINDS } from '@/lib/domain/retreats';

/** Empty form fields arrive as "" and must land in the database as NULL. */
const blankToNull = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? null : s));

const KINDS = RETREAT_KINDS.map((r) => r.kind) as [string, ...string[]];

export const retreatSchema = z
  .object({
    kind: z.enum(KINDS),
    // The database CHECK enforces the same range; keeping them equal means a
    // form error rather than a constraint violation.
    year: z.number().int().min(1970, 'Rok poza zakresem').max(2100, 'Rok poza zakresem'),
    place: blankToNull,
    name: blankToNull,
  })
  .refine((r) => r.kind !== 'INNE' || r.name !== null, {
    message: 'Podaj nazwę rekolekcji',
    path: ['name'],
  });

const newCircleSchema = z.object({
  number: z.number().int().min(1).max(99),
  patron: blankToNull,
  parishId: z.string().regex(/^\d+$/),
});

const newParishSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę parafii'),
  city: z.string().trim().min(1, 'Podaj miasto'),
});

export const coupleSchema = z
  .object({
    wifeName: z.string().trim().max(60),
    husbandName: z.string().trim().max(60),
    surname: z.string().trim().min(1, 'Podaj nazwisko').max(80),
    email: z.union([z.literal(''), z.email('Niepoprawny adres e-mail')]).transform((s) => s || null),
    phone: blankToNull,
    regionId: z.number().int().min(1).max(REGION_COUNT),
    circleId: z.string().regex(/^\d+$/).nullable(),
    newCircle: newCircleSchema.nullable(),
    parishId: z.string().regex(/^\d+$/).nullable(),
    newParish: newParishSchema.nullable(),
    children: blankToNull,
    notes: blankToNull,
  })
  // Picking an existing entity and creating a new one at once is ambiguous —
  // the combobox can only be in one of those states.
  .refine((c) => !(c.circleId && c.newCircle), {
    message: 'Wybierz istniejący krąg albo utwórz nowy',
    path: ['circleId'],
  })
  .refine((c) => !(c.parishId && c.newParish), {
    message: 'Wybierz istniejącą parafię albo utwórz nową',
    path: ['parishId'],
  });

export const saveSchema = z.object({
  couple: coupleSchema,
  retreats: z.array(retreatSchema),
});

export type CoupleInput = z.infer<typeof coupleSchema>;
export type RetreatInput = z.infer<typeof retreatSchema>;
export type SaveInput = z.infer<typeof saveSchema>;
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- schema`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add couple and retreat validation schema"
```

---

### Task 2: Warstwa zapisu

Serce planu: audyt w tej samej transakcji co zmiana i uprawnienia sprawdzane po stronie serwera.

**Files:**
- Create: `src/lib/couples/save.ts`
- Test: `src/lib/couples/save.int.test.ts`

**Interfaces:**
- Produces: `createCouple(u, data): Promise<bigint>`, `updateCouple(u, id, data): Promise<void>`, `deleteCouple(u, id): Promise<void>`, `class NotFound extends Error`

- [ ] **Step 1: Napisz test integracyjny**

`src/lib/couples/save.int.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { SaveInput } from './schema';
import { NotFound, createCouple, deleteCouple, updateCouple } from './save';

const admin: User = { id: 0n, role: 'admin', regionId: null };
const regionVII: User = { id: 0n, role: 'region', regionId: 7 };
const viewer: User = { id: 0n, role: 'viewer', regionId: null };

const created: bigint[] = [];

afterEach(async () => {
  if (created.length) {
    await prisma.retreat.deleteMany({ where: { coupleId: { in: created } } });
    await prisma.couple.deleteMany({ where: { id: { in: created } } });
    await prisma.audit.deleteMany({ where: { coupleId: { in: created } } });
    created.length = 0;
  }
});

function input(overrides: Partial<SaveInput['couple']> = {}): SaveInput {
  return {
    couple: {
      wifeName: 'Testowa', husbandName: 'Testowy', surname: 'Testowi',
      email: null, phone: null, regionId: 7,
      circleId: null, newCircle: null, parishId: null, newParish: null,
      children: null, notes: null, ...overrides,
    },
    retreats: [],
  };
}

async function add(u: User, data: SaveInput = input()) {
  const id = await createCouple(u, data);
  created.push(id);
  return id;
}

describe('createCouple', () => {
  it('creates the couple and one audit entry, in one transaction', async () => {
    const before = await prisma.audit.count();
    const id = await add(admin);

    expect(await prisma.couple.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.audit.count()).toBe(before + 1);
    expect((await prisma.audit.findFirstOrThrow({ where: { coupleId: id } })).kind).toBe('create');
  });

  it('stores retreat entries alongside the couple', async () => {
    const id = await add(admin, {
      ...input(),
      retreats: [
        { kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: null },
        { kind: 'INNE', year: 2019, place: null, name: 'Ewangelizacyjne' },
      ],
    });
    expect(await prisma.retreat.count({ where: { coupleId: id } })).toBe(2);
  });

  it('lets a region account create only inside its own region', async () => {
    await expect(createCouple(regionVII, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('never lets the viewer create', async () => {
    await expect(createCouple(viewer, input())).rejects.toThrow(Forbidden);
  });
});

describe('updateCouple', () => {
  it('records an edit in the audit trail', async () => {
    const id = await add(admin);
    await updateCouple(admin, id, input({ surname: 'Zmienieni' }));

    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).surname).toBe('Zmienieni');
    expect(await prisma.audit.count({ where: { coupleId: id, kind: 'edit' } })).toBe(1);
  });

  it('replaces the retreat entries rather than appending to them', async () => {
    const id = await add(admin, {
      ...input(),
      retreats: [{ kind: 'ONZ_I', year: 2014, place: null, name: null }],
    });
    await updateCouple(admin, id, {
      ...input(),
      retreats: [{ kind: 'ONZ_II', year: 2016, place: null, name: null }],
    });

    const entries = await prisma.retreat.findMany({ where: { coupleId: id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('ONZ_II');
  });

  // The checklist requires the region field to be locked for a region account
  // both in the interface and on the server.
  it('refuses to move a couple out of a region account own region', async () => {
    const id = await add(admin);
    await expect(updateCouple(regionVII, id, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('lets a region account edit its own couple without touching the region', async () => {
    const id = await add(admin);
    await updateCouple(regionVII, id, input({ surname: 'Poprawieni' }));
    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).surname).toBe('Poprawieni');
  });

  it('refuses a couple from another region', async () => {
    const id = await add(admin, input({ regionId: 3 }));
    await expect(updateCouple(regionVII, id, input({ regionId: 3 }))).rejects.toThrow(Forbidden);
  });

  it('throws NotFound for an id that does not exist', async () => {
    await expect(updateCouple(admin, 999_999_999n, input())).rejects.toThrow(NotFound);
  });
});

describe('deleteCouple', () => {
  it('soft-deletes so the record survives for recovery', async () => {
    const id = await add(admin);
    await deleteCouple(admin, id);

    expect((await prisma.couple.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await prisma.audit.count({ where: { coupleId: id, kind: 'delete' } })).toBe(1);
  });

  it('has nothing left to act on when called twice', async () => {
    const id = await add(admin);
    await deleteCouple(admin, id);
    await expect(deleteCouple(admin, id)).rejects.toThrow(NotFound);
  });

  it('never lets the viewer delete', async () => {
    const id = await add(admin);
    await expect(deleteCouple(viewer, id)).rejects.toThrow(Forbidden);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- save`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/couples/save.ts`:

```ts
import type { Prisma } from '@/generated/prisma/client';
import {
  Forbidden, type User, assertCanEdit, canChangeRegion, canDelete,
} from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { SaveInput } from './schema';

export class NotFound extends Error {
  constructor(message = 'Nie znaleziono pary') {
    super(message);
    this.name = 'NotFound';
  }
}

/**
 * Never mention `searchText` here. Those columns are GENERATED ALWAYS:
 * Postgres computes them and rejects any attempt to write them.
 */
function coupleFields(c: SaveInput['couple']) {
  return {
    wifeName: c.wifeName,
    husbandName: c.husbandName,
    surname: c.surname,
    email: c.email,
    phone: c.phone,
    regionId: c.regionId,
    children: c.children,
    notes: c.notes,
  };
}

/** Resolves the combobox state into ids, creating the new entity when asked. */
async function resolveRelations(
  tx: Prisma.TransactionClient,
  c: SaveInput['couple'],
): Promise<{ circleId: bigint | null; parishId: bigint | null }> {
  let parishId = c.parishId === null ? null : BigInt(c.parishId);

  if (c.newParish) {
    const parish = await tx.parish.upsert({
      where: { name_city: { name: c.newParish.name, city: c.newParish.city } },
      update: {},
      create: c.newParish,
    });
    parishId = parish.id;
  }

  let circleId = c.circleId === null ? null : BigInt(c.circleId);

  if (c.newCircle) {
    const circle = await tx.circle.upsert({
      where: { regionId_number: { regionId: c.regionId, number: c.newCircle.number } },
      update: {},
      create: {
        regionId: c.regionId,
        number: c.newCircle.number,
        patron: c.newCircle.patron,
        parishId: BigInt(c.newCircle.parishId),
      },
    });
    circleId = circle.id;
  }

  return { circleId, parishId };
}

function coupleLabel(c: SaveInput['couple']): string {
  const names = [c.wifeName, c.husbandName].filter(Boolean).join(' i ');
  return names ? `${names} ${c.surname}` : c.surname;
}

export async function createCouple(u: User, data: SaveInput): Promise<bigint> {
  assertCanEdit(u, { regionId: data.couple.regionId });

  return prisma.$transaction(async (tx) => {
    const { circleId, parishId } = await resolveRelations(tx, data.couple);

    const couple = await tx.couple.create({
      data: {
        ...coupleFields(data.couple),
        circleId,
        parishId,
        retreats: { create: data.retreats },
      },
    });

    // Same transaction as the change itself: a couple must never exist
    // without the audit entry that records who added it.
    await tx.audit.create({
      data: {
        kind: 'create',
        description: `Dodano parę ${coupleLabel(data.couple)}`,
        accountId: u.id,
        coupleId: couple.id,
      },
    });

    return couple.id;
  });
}

export async function updateCouple(u: User, id: bigint, data: SaveInput): Promise<void> {
  const existing = await prisma.couple.findFirst({
    where: { id, deletedAt: null },
    select: { regionId: true },
  });
  if (!existing) throw new NotFound();

  // Two checks, not one: the user must be allowed to touch the couple as it is
  // now, and also allowed to put it where the form wants to put it.
  assertCanEdit(u, { regionId: existing.regionId });
  if (data.couple.regionId !== existing.regionId && !canChangeRegion(u)) {
    throw new Forbidden('Nie możesz przenieść pary do innego rejonu');
  }
  assertCanEdit(u, { regionId: data.couple.regionId });

  await prisma.$transaction(async (tx) => {
    const { circleId, parishId } = await resolveRelations(tx, data.couple);

    await tx.couple.update({
      where: { id },
      data: { ...coupleFields(data.couple), circleId, parishId },
    });

    // The form owns the whole list, so the stored entries are replaced rather
    // than merged — otherwise a removed row would quietly survive.
    await tx.retreat.deleteMany({ where: { coupleId: id } });
    if (data.retreats.length > 0) {
      await tx.retreat.createMany({
        data: data.retreats.map((r) => ({ ...r, coupleId: id })),
      });
    }

    await tx.audit.create({
      data: {
        kind: 'edit',
        description: `Zmieniono dane pary ${coupleLabel(data.couple)}`,
        accountId: u.id,
        coupleId: id,
      },
    });
  });
}

export async function deleteCouple(u: User, id: bigint): Promise<void> {
  const couple = await prisma.couple.findFirst({
    where: { id, deletedAt: null },
    select: { regionId: true, surname: true, wifeName: true, husbandName: true },
  });
  if (!couple) throw new NotFound();
  if (!canDelete(u, { regionId: couple.regionId })) throw new Forbidden();

  await prisma.$transaction(async (tx) => {
    // Soft delete: a region account can misclick, and the record holds a
    // family's history. Permanent removal is a separate, admin-only action
    // arriving in Plan 6.
    await tx.couple.update({ where: { id }, data: { deletedAt: new Date() } });

    await tx.audit.create({
      data: {
        kind: 'delete',
        description: `Usunięto parę ${couple.wifeName} i ${couple.husbandName} ${couple.surname}`,
        accountId: u.id,
        coupleId: id,
      },
    });
  });
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

**Zanim uruchomisz, sprawdź nazwy kluczy złożonych.** Prisma generuje je z `@@unique([...])`, sklejając nazwy pól podkreśleniem — stąd `name_city` i `regionId_number`. Potwierdź w `src/generated/prisma/models/Parish.ts` i `.../Circle.ts`; literówka daje błąd typów, nie runtime'u.

Run: `npm run test:int -- save`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add couple write layer with transactional audit"
```

---

### Task 3: Odczyt karty

**Files:**
- Create: `src/lib/couples/card.ts`
- Test: `src/lib/couples/card.int.test.ts`

**Interfaces:**
- Produces:
  - `type FormationEntry = { kind: RetreatKind; year: string; place: string; name: string }` — `year` jest tekstem, bo to wartość pola formularza
  - `type CardData = { id: string; wifeName: string; husbandName: string; surname: string; email: string; phone: string; regionId: number; circleId: string | null; parishId: string | null; children: string; notes: string; retreats: FormationEntry[] }`
  - `loadCard(u, id): Promise<{ card: CardData; editable: boolean } | null>`
  - `blankCard(u): CardData`
  - `cardOptions(regionId): Promise<{ circles: …; parishes: … }>`

Wszystkie identyfikatory są `string`, a pola tekstowe nigdy nie są `null` — karta jedzie prosto do komponentu klienckiego i do niekontrolowanych pól formularza.

- [ ] **Step 1: Napisz test**

`src/lib/couples/card.int.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { blankCard, cardOptions, loadCard } from './card';

const admin: User = { id: 1n, role: 'admin', regionId: null };
const regionVII: User = { id: 2n, role: 'region', regionId: 7 };
const viewer: User = { id: 3n, role: 'viewer', regionId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

async function anyCoupleIn(regionId: number): Promise<bigint> {
  const c = await prisma.couple.findFirstOrThrow({ where: { regionId, deletedAt: null } });
  return c.id;
}

describe('loadCard', () => {
  it('returns every text field as a string, never null', async () => {
    const result = await loadCard(admin, await anyCoupleIn(7));
    expect(result).not.toBeNull();
    const fields = ['wifeName', 'husbandName', 'surname', 'email', 'phone', 'children', 'notes'] as const;
    for (const field of fields) {
      expect(typeof result!.card[field], field).toBe('string');
    }
    expect(typeof result!.card.id).toBe('string');
  });

  it('marks a couple in the account own region as editable', async () => {
    expect((await loadCard(regionVII, await anyCoupleIn(7)))!.editable).toBe(true);
  });

  it('marks a couple from another region as read-only rather than hiding it', async () => {
    // The drawer shows a read-only banner; it does not pretend the couple
    // does not exist.
    const result = await loadCard(regionVII, await anyCoupleIn(3));
    expect(result).not.toBeNull();
    expect(result!.editable).toBe(false);
  });

  it('marks everything read-only for the viewer', async () => {
    expect((await loadCard(viewer, await anyCoupleIn(7)))!.editable).toBe(false);
  });

  it('returns null for a soft-deleted couple', async () => {
    const id = await anyCoupleIn(7);
    await prisma.couple.update({ where: { id }, data: { deletedAt: new Date() } });
    expect(await loadCard(admin, id)).toBeNull();
    await prisma.couple.update({ where: { id }, data: { deletedAt: null } });
  });

  it('returns null for an id that does not exist', async () => {
    expect(await loadCard(admin, 999_999_999n)).toBeNull();
  });
});

describe('blankCard', () => {
  it('pins a region account to its own region', () => {
    expect(blankCard(regionVII).regionId).toBe(7);
  });

  it('starts admin on the first region', () => {
    expect(blankCard(admin).regionId).toBe(1);
  });

  it('has no entries and no ids', () => {
    const card = blankCard(admin);
    expect(card.id).toBe('');
    expect(card.retreats).toEqual([]);
    expect(card.circleId).toBeNull();
  });
});

describe('cardOptions', () => {
  it('offers the circles of the given region and every parish', async () => {
    const { circles, parishes } = await cardOptions(7);
    expect(circles.length).toBeGreaterThan(0);
    expect(parishes.length).toBeGreaterThan(0);
    expect(circles.every((c) => c.label.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- card`
Expected: FAIL

- [ ] **Step 3: Zaimplementuj**

`src/lib/couples/card.ts`:

```ts
import type { RetreatKind } from '@/generated/prisma/enums';
import { type User, canEdit } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';

export type FormationEntry = {
  kind: RetreatKind;
  year: string;
  place: string;
  name: string;
};

export type CardData = {
  id: string;
  wifeName: string;
  husbandName: string;
  surname: string;
  email: string;
  phone: string;
  regionId: number;
  circleId: string | null;
  parishId: string | null;
  children: string;
  notes: string;
  retreats: FormationEntry[];
};

// Everything crosses into a client component and feeds uncontrolled inputs,
// where null would flip an input to controlled and trigger a React warning.
const asText = (v: string | null): string => v ?? '';

export async function loadCard(
  u: User,
  id: bigint,
): Promise<{ card: CardData; editable: boolean } | null> {
  const couple = await prisma.couple.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, wifeName: true, husbandName: true, surname: true,
      email: true, phone: true, regionId: true, circleId: true, parishId: true,
      children: true, notes: true,
      retreats: {
        select: { kind: true, year: true, place: true, name: true },
        orderBy: { year: 'asc' },
      },
    },
  });
  if (!couple) return null;

  return {
    editable: canEdit(u, { regionId: couple.regionId }),
    card: {
      id: String(couple.id),
      wifeName: asText(couple.wifeName),
      husbandName: asText(couple.husbandName),
      surname: couple.surname,
      email: asText(couple.email),
      phone: asText(couple.phone),
      regionId: couple.regionId,
      circleId: couple.circleId === null ? null : String(couple.circleId),
      parishId: couple.parishId === null ? null : String(couple.parishId),
      children: asText(couple.children),
      notes: asText(couple.notes),
      retreats: couple.retreats.map((r) => ({
        kind: r.kind,
        year: String(r.year),
        place: asText(r.place),
        name: asText(r.name),
      })),
    },
  };
}

export function blankCard(u: User): CardData {
  return {
    id: '',
    wifeName: '', husbandName: '', surname: '', email: '', phone: '',
    // A region account may only ever create inside its own region, so the
    // field starts there and stays disabled.
    regionId: u.regionId ?? 1,
    circleId: null, parishId: null, children: '', notes: '',
    retreats: [],
  };
}

export async function cardOptions(regionId: number): Promise<{
  circles: { id: string; label: string }[];
  parishes: { id: string; label: string }[];
}> {
  const [circles, parishes] = await Promise.all([
    prisma.circle.findMany({
      where: { regionId },
      select: { id: true, number: true, patron: true },
      orderBy: { number: 'asc' },
    }),
    prisma.parish.findMany({
      select: { id: true, name: true, city: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return {
    circles: circles.map((c) => ({
      id: String(c.id),
      label: c.patron ? `${c.number} · ${c.patron}` : String(c.number),
    })),
    parishes: parishes.map((p) => ({
      id: String(p.id),
      label: `${p.name}, ${p.city}`,
    })),
  };
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- card`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add single couple read model"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/app/(app)/pary/actions.ts`

**Interfaces:**
- Produces: `type CardState = { error?: string }`, `saveCoupleAction(state, formData)`, `deleteCoupleAction(state, formData)`

- [ ] **Step 1: Zaimplementuj**

`src/app/(app)/pary/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { NotFound, createCouple, deleteCouple, updateCouple } from '@/lib/couples/save';
import { saveSchema } from '@/lib/couples/schema';

export type CardState = { error?: string };

function textOr(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = textOr(v);
  return s === '' ? null : s;
}

function numberOr(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A server action is a public POST endpoint. requireUser comes first and the
 * write layer checks permissions again — the protected layout does not cover
 * this call, and a hidden button proves nothing.
 */
export async function saveCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();

  // The form ships the entries as JSON with the year as a string, because that
  // is what a text input produces; the schema wants a number.
  const rawEntries = JSON.parse(textOr(formData.get('retreats')) || '[]') as {
    kind: string; year: string; place: string; name: string;
  }[];

  const parsed = saveSchema.safeParse({
    couple: {
      wifeName: textOr(formData.get('wifeName')),
      husbandName: textOr(formData.get('husbandName')),
      surname: textOr(formData.get('surname')),
      email: textOr(formData.get('email')),
      phone: textOr(formData.get('phone')),
      regionId: numberOr(formData.get('regionId'), u.regionId ?? 1),
      circleId: emptyToNull(formData.get('circleId')),
      newCircle: null,
      parishId: emptyToNull(formData.get('parishId')),
      newParish: null,
      children: textOr(formData.get('children')),
      notes: textOr(formData.get('notes')),
    },
    retreats: rawEntries.map((r) => ({ ...r, year: Number(r.year) })),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Popraw dane w formularzu' };
  }

  const id = emptyToNull(formData.get('id'));

  try {
    if (id === null) await createCouple(u, parsed.data);
    else await updateCouple(u, BigInt(id), parsed.data);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect('/pary?saved=1');
}

export async function deleteCoupleAction(
  _state: CardState,
  formData: FormData,
): Promise<CardState> {
  const u = await requireUser();
  const id = emptyToNull(formData.get('id'));
  if (id === null) return { error: 'Brak identyfikatora pary' };

  try {
    await deleteCouple(u, BigInt(id));
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    if (e instanceof NotFound) return { error: 'Ta para już nie istnieje' };
    throw e;
  }

  revalidatePath('/pary');
  redirect('/pary?deleted=1');
}
```

**Uwaga o `newCircle` i `newParish`:** akcja przekazuje `null`, bo pola „+ nowy" wchodzą razem z importem w Planie 4. Schemat już je zna, więc dołożenie ich będzie zmianą w jednym miejscu.

- [ ] **Step 2: Sprawdź lint i build**

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

- [ ] **Step 1: Napisz style**

`src/components/toast.module.css`:

```css
.toast {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-bg);
  color: var(--toast-text);
  padding: 12px 20px;
  border-radius: var(--r-9);
  font-size: 14px;
  box-shadow: var(--shadow-toast);
  z-index: 90;
}
```

Tokeny `--toast-bg`, `--toast-text` i `--shadow-toast` są już w `tokens.css`.

- [ ] **Step 2: Napisz komponent**

`src/components/Toast.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import style from './toast.module.css';

const VISIBLE_MS = 2600;

export function Toast({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  // role="status" with aria-live="polite" so a screen reader announces the
  // result without stealing focus from wherever the user is.
  return (
    <p className={style.toast} role="status" aria-live="polite">
      {text}
    </p>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add toast for save feedback"
```

---

### Task 6: Panel karty pary

**Files:**
- Create: `src/app/(app)/pary/CoupleCard.tsx`, `src/app/(app)/pary/card.module.css`

- [ ] **Step 1: Napisz style**

`src/app/(app)/pary/card.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: transparent;
  border: none;
  padding: 0;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
}

.overlay::backdrop {
  background: rgba(13, 36, 57, .35);
  animation: fadein var(--dur-overlay);
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
  box-shadow: var(--shadow-drawer);
  animation: slidein var(--dur-drawer) ease-out;
}

.header {
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
  margin: 0;
}

.title {
  font-family: var(--font-heading), Georgia, serif;
  font-size: 28px;
  font-weight: 400;
  margin: 2px 0 0;
}

.close {
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
  border: 1px solid var(--warn-border);
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 13px;
  color: var(--warn-strong);
  margin: 0;
}

.error {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 13px;
  color: var(--danger-fg);
  margin: 0;
}

.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wide { grid-column: span 2; }

.label {
  font-size: 13px;
  color: var(--text-muted);
}

.control {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text);
  width: 100%;
}

.control:focus {
  border-color: var(--blue-500);
  box-shadow: var(--focus-ring);
  outline: none;
}

.control:disabled {
  background: var(--bg-row);
  color: var(--text-muted);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  border-top: 1px solid var(--bg-app);
  padding-top: 16px;
}

.save {
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

.save:hover { background: var(--navy-900); }
.save:disabled { opacity: .6; cursor: progress; }

.cancel {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 11px 20px;
  font-size: 14px;
  min-height: 44px;
  color: var(--text);
  cursor: pointer;
}

.remove {
  margin-left: auto;
  background: var(--surface);
  border: 1px solid var(--danger-border);
  border-radius: var(--r-8);
  padding: 11px 20px;
  font-size: 14px;
  min-height: 44px;
  color: var(--danger-fg);
  cursor: pointer;
}

.remove:hover { background: var(--danger-bg); }

.note {
  font-size: 12px;
  color: var(--text-faint);
  margin: 0;
}

/* --- formation section --- */
.formation {
  display: flex;
  flex-direction: column;
  gap: 11px;
  border-top: 1px solid var(--bg-app);
  padding-top: 16px;
}

.formationHeader {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.formationTitle {
  font-family: var(--font-heading), Georgia, serif;
  font-size: 20px;
  font-weight: 400;
}

.formationCount {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-faint);
}

.entry {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  background: var(--bg-row-alt);
  border: 1px solid var(--bg-app);
  border-radius: var(--r-9);
  padding: 8px;
}

.entryControl {
  border: 1px solid var(--border-input);
  border-radius: var(--r-7);
  padding: 8px 10px;
  font-size: 13px;
  min-height: 38px;
  background: var(--surface);
  color: var(--text);
}

.entryKind { flex: 1 1 100%; }
.entryYear { width: 72px; flex: none; font-family: var(--font-mono), monospace; }
.entryPlace { flex: 1; min-width: 120px; }
.entryName { flex: 1 1 100%; }

.entryRemove {
  width: 34px;
  height: 38px;
  flex: none;
  border: 1px solid var(--divider);
  border-radius: var(--r-7);
  background: var(--surface);
  color: var(--placeholder);
  cursor: pointer;
}

.entryRemove:hover {
  border-color: var(--danger-border);
  color: var(--danger-fg);
}

.noEntries {
  font-size: 13px;
  color: var(--text-faint);
  margin: 0;
}

.addEntry {
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

.addEntry:hover {
  border-color: var(--navy-700);
  background: var(--bg-panel);
}

@media (max-width: 860px) {
  .panel {
    width: 100%;
    max-width: none;
    height: 100%;
    padding: 18px 16px 44px;
  }

  .form { grid-template-columns: 1fr; }
  .wide { grid-column: auto; }
}
```

- [ ] **Step 2: Napisz komponent**

`src/app/(app)/pary/CoupleCard.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CardData, FormationEntry } from '@/lib/couples/card';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { FormationSection } from './FormationSection';
import { type CardState, deleteCoupleAction, saveCoupleAction } from './actions';
import style from './card.module.css';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.save} disabled={pending}>
      {pending ? 'Zapisywanie…' : 'Zapisz'}
    </button>
  );
}

export function CoupleCard({
  card,
  editable,
  options,
  regionChangeable,
}: {
  card: CardData;
  editable: boolean;
  options: { circles: { id: string; label: string }[]; parishes: { id: string; label: string }[] };
  regionChangeable: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, saveAction] = useActionState<CardState, FormData>(saveCoupleAction, {});
  const [deleteState, deleteAction] = useActionState<CardState, FormData>(deleteCoupleAction, {});

  // The drawer is edited on a copy — Cancel simply navigates away and the
  // list behind it was never touched.
  const [retreats, setRetreats] = useState<FormationEntry[]>(card.retreats);

  // showModal is what gives the focus trap, Esc handling and the backdrop.
  // A <dialog open> attribute would render the element without any of them.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function close() {
    router.push('/pary');
  }

  const isNew = card.id === '';
  const kicker = isNew ? 'Nowy wpis' : `Karta pary · rejon ${romanNumeral(card.regionId)}`;
  const title = isNew ? 'Dodaj parę' : `${card.wifeName} i ${card.husbandName} ${card.surname}`;
  const error = state.error ?? deleteState.error;

  return (
    <dialog
      ref={dialog}
      className={style.overlay}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        // Clicking the backdrop closes; clicking inside the panel must not.
        if (e.target === dialog.current) close();
      }}
    >
      <div className={style.panel}>
        <header className={style.header}>
          <div>
            <p className={style.kicker}>{kicker}</p>
            <h2 className={style.title}>{title}</h2>
          </div>
          <button type="button" className={style.close} onClick={close} aria-label="Zamknij">
            ✕
          </button>
        </header>

        {!editable && (
          <p className={style.banner}>
            Tylko podgląd — ta para należy do innego rejonu, edytować może para rejonowa
            lub odpowiedzialni za wspólnotę.
          </p>
        )}

        {error && <p className={style.error} role="alert">{error}</p>}

        <form action={saveAction} className={style.form}>
          <input type="hidden" name="id" value={card.id} />
          <input type="hidden" name="retreats" value={JSON.stringify(retreats)} />

          <label className={style.field}>
            <span className={style.label}>Imię żony</span>
            <input className={style.control} name="wifeName" defaultValue={card.wifeName}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Imię męża</span>
            <input className={style.control} name="husbandName" defaultValue={card.husbandName}
              disabled={!editable} />
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Nazwisko</span>
            <input className={style.control} name="surname" defaultValue={card.surname}
              disabled={!editable} required />
          </label>

          <label className={style.field}>
            <span className={style.label}>E-mail</span>
            <input className={style.control} type="email" name="email" defaultValue={card.email}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Telefon</span>
            <input className={style.control} name="phone" defaultValue={card.phone}
              disabled={!editable} />
          </label>

          <label className={style.field}>
            <span className={style.label}>Rejon</span>
            <select className={style.control} name="regionId" defaultValue={card.regionId}
              disabled={!editable || !regionChangeable}>
              {Array.from({ length: REGION_COUNT }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>{`Rejon ${romanNumeral(r)}`}</option>
              ))}
            </select>
          </label>

          <label className={style.field}>
            <span className={style.label}>Krąg</span>
            <select className={style.control} name="circleId" defaultValue={card.circleId ?? ''}
              disabled={!editable}>
              <option value="">— bez kręgu —</option>
              {options.circles.map((c) => (
                <option key={c.id} value={c.id}>{`Krąg ${c.label}`}</option>
              ))}
            </select>
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Parafia</span>
            <select className={style.control} name="parishId" defaultValue={card.parishId ?? ''}
              disabled={!editable}>
              <option value="">— jak w kręgu —</option>
              {options.parishes.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Dzieci — imiona i roczniki</span>
            <input className={style.control} name="children" defaultValue={card.children}
              placeholder="np. Marysia 2014, Antek 2017" disabled={!editable} />
          </label>

          <label className={`${style.field} ${style.wide}`}>
            <span className={style.label}>Notatki</span>
            <textarea className={style.control} name="notes" rows={3}
              defaultValue={card.notes} disabled={!editable} />
          </label>

          <div className={style.wide}>
            <FormationSection entries={retreats} onChange={setRetreats} editable={editable} />
          </div>

          {editable && (
            <div className={`${style.footer} ${style.wide}`}>
              <SaveButton />
              <button type="button" className={style.cancel} onClick={close}>Anuluj</button>
            </div>
          )}
        </form>

        {editable && !isNew && (
          <form action={deleteAction}>
            <input type="hidden" name="id" value={card.id} />
            <button type="submit" className={style.remove}>Usuń parę</button>
          </form>
        )}

        <p className={style.note}>
          {editable
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
- Create: `src/app/(app)/pary/FormationSection.tsx`

Style są już w `card.module.css` z Zadania 6.

- [ ] **Step 1: Napisz komponent**

`src/app/(app)/pary/FormationSection.tsx`:

```tsx
'use client';

import type { RetreatKind } from '@/generated/prisma/enums';
import type { FormationEntry } from '@/lib/couples/card';
import { RETREAT_KINDS, nextDegree } from '@/lib/domain/retreats';
import { ENTRIES, plural } from '@/lib/pl';
import style from './card.module.css';

export function FormationSection({
  entries,
  onChange,
  editable,
}: {
  entries: FormationEntry[];
  onChange: (entries: FormationEntry[]) => void;
  editable: boolean;
}) {
  function change(i: number, patch: Partial<FormationEntry>) {
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  function add() {
    // Suggests the earliest degree the couple is missing; once every degree is
    // present it falls through to INNE.
    const kind = nextDegree(entries.map((e) => e.kind));
    onChange([...entries, { kind, year: '', place: '', name: '' }]);
  }

  return (
    <section className={style.formation}>
      <div className={style.formationHeader}>
        <h3 className={style.formationTitle}>Formacja — przebyte rekolekcje</h3>
        <span className={style.formationCount}>{plural(entries.length, ENTRIES)}</span>
      </div>

      {entries.length === 0 && <p className={style.noEntries}>Brak wpisów o rekolekcjach.</p>}

      {entries.map((e, i) => (
        <div className={style.entry} key={i}>
          <select
            className={`${style.entryControl} ${style.entryKind}`}
            value={e.kind}
            aria-label={`Rodzaj rekolekcji ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { kind: ev.currentTarget.value as RetreatKind })}
          >
            {RETREAT_KINDS.map((r) => (
              <option key={r.kind} value={r.kind}>{r.name}</option>
            ))}
          </select>

          <input
            className={`${style.entryControl} ${style.entryYear}`}
            value={e.year}
            placeholder="rok"
            inputMode="numeric"
            aria-label={`Rok ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { year: ev.currentTarget.value })}
          />

          <input
            className={`${style.entryControl} ${style.entryPlace}`}
            value={e.place}
            placeholder="miejsce"
            aria-label={`Miejsce ${i + 1}`}
            disabled={!editable}
            onChange={(ev) => change(i, { place: ev.currentTarget.value })}
          />

          {/* Only INNE carries a free-text name, and then it is required. */}
          {e.kind === 'INNE' && (
            <input
              className={`${style.entryControl} ${style.entryName}`}
              value={e.name}
              placeholder="nazwa rekolekcji"
              aria-label={`Nazwa rekolekcji ${i + 1}`}
              disabled={!editable}
              onChange={(ev) => change(i, { name: ev.currentTarget.value })}
            />
          )}

          {editable && (
            <button
              type="button"
              className={style.entryRemove}
              aria-label={`Usuń wpis ${i + 1}`}
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {editable && (
        <button type="button" className={style.addEntry} onClick={add}>
          + Dodaj rekolekcje
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add formation section with next-degree suggestion"
```

---

### Task 8: Podpięcie panelu do listy

**Files:**
- Modify: `src/app/(app)/pary/page.tsx`, `src/app/(app)/pary/couples.module.css`

- [ ] **Step 1: Dopisz importy i odczyt `?card`**

W `page.tsx` dopisz:

```tsx
import Link from 'next/link';
import { Toast } from '@/components/Toast';
import { canChangeRegion } from '@/lib/auth/permissions';
import { blankCard, cardOptions, loadCard } from '@/lib/couples/card';
import { CoupleCard } from './CoupleCard';
```

Zamień odczyt parametrów na:

```tsx
  const params = await searchParams;
  const filters = parseFilters(params);

  const cardParam = (() => {
    const v = params['card'];
    return Array.isArray(v) ? v[0] : v;
  })();
```

- [ ] **Step 2: Zbuduj panel po stronie serwera**

Przed `return`:

```tsx
  // The drawer is a URL state, so the back button works and a card can be
  // linked to. Its content is fetched here, on the server.
  let drawer: React.ReactNode = null;
  if (cardParam === 'new' && u.role !== 'viewer') {
    const blank = blankCard(u);
    drawer = (
      <CoupleCard
        card={blank}
        editable
        options={await cardOptions(blank.regionId)}
        regionChangeable={canChangeRegion(u)}
      />
    );
  } else if (cardParam && /^\d+$/.test(cardParam)) {
    const result = await loadCard(u, BigInt(cardParam));
    if (result) {
      drawer = (
        <CoupleCard
          card={result.card}
          editable={result.editable}
          options={await cardOptions(result.card.regionId)}
          regionChangeable={canChangeRegion(u)}
        />
      );
    }
  }
```

Na końcu JSX, po `<Pagination …/>`:

```tsx
      {drawer}
      {params['saved'] && <Toast text="Zapisano zmiany" />}
      {params['deleted'] && <Toast text="Para usunięta z kartoteki" />}
```

Nieistniejący albo usunięty identyfikator w `?card` po prostu nie otwiera panelu — lista renderuje się normalnie. To celowe: stary link z historii przeglądarki nie ma prawa wywrócić strony.

- [ ] **Step 3: Dodaj przycisk „+ Dodaj parę"**

W `<ViewHeader>`:

```tsx
      <ViewHeader title={title} subtitle={subtitle}>
        {u.role !== 'viewer' && (
          <Link href="/pary?card=new" className={style.addButton}>
            + Dodaj parę
          </Link>
        )}
      </ViewHeader>
```

i na końcu `couples.module.css`:

```css
.addButton {
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

.addButton:hover { background: var(--navy-900); }
```

- [ ] **Step 4: Sprawdź w przeglądarce**

```bash
npm run dev
```

Jako admin: klik „Edytuj →" otwiera panel z danymi pary. `Esc` zamyka, klik w tło zamyka. Zmiana nazwiska i „Zapisz" — panel się zamyka, lista pokazuje nową wartość, pojawia się toast. „Anuluj" po zmianie pola — zmiana przepada.

Jako `rejon7@example.pl`: para z rejonu VII edytowalna, pole „Rejon" zablokowane. Karta pary z innego rejonu (adres wpisany ręcznie) pokazuje banner „Tylko podgląd" i nie ma stopki z przyciskami.

Jako `moderator@example.pl`: brak przycisku „+ Dodaj parę", każda karta w trybie podglądu.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire the couple drawer into the list view"
```

---

### Task 9: Testy end-to-end karty

**Files:**
- Create: `e2e/card.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Zapewnij deterministyczny stan bazy**

Testy karty **zmieniają dane**: dodają pary, zmieniają nazwiska, usuwają rekordy. `list.spec.ts` sprawdza tymczasem dokładnie `300 / 300`. Sprzątanie po sobie nie wystarczy — test zapisu zmienia nazwisko istniejącej pary i nie pamięta poprzedniego.

Zmień skrypt `e2e` w `package.json`:

```json
"e2e": "tsx prisma/seed.ts && tsx e2e/prepare.ts && playwright test"
```

Seed jest deterministyczny (PRNG ze stałym ziarnem), więc każdy przebieg zaczyna od tych samych 300 par.

- [ ] **Step 2: Napisz testy**

`e2e/card.spec.ts`:

```ts
import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'kartoteka123';

async function signIn(page: Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/pary/);
}

async function openFirstCard(page: Page) {
  await page.getByRole('link', { name: /^(Edytuj|Podgląd) →$/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('the drawer opens from the list and closes with Escape', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);
  await expect(page).toHaveURL(/card=\d+/);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the drawer closes on the close button and returns to the list', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Zamknij' }).click();
  await expect(page).toHaveURL(/\/pary$/);
});

test('a card can be opened directly by link', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);
  const url = page.url();

  await page.goto(url);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('saving a change updates the list and shows a toast', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);

  const surname = `Testowi${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Zapisano zmiany' })).toBeVisible();
  await page.goto(`/pary?q=${surname}`);
  await expect(page.getByRole('status')).toContainText('1 / 300');
});

test('cancelling discards the change', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);

  const before = await page.getByLabel('Nazwisko').inputValue();
  await page.getByLabel('Nazwisko').fill('PorzuconaZmiana');
  await page.getByRole('button', { name: 'Anuluj' }).click();

  await openFirstCard(page);
  await expect(page.getByLabel('Nazwisko')).toHaveValue(before);
});

test('an empty surname blocks the save', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await openFirstCard(page);
  await page.getByLabel('Nazwisko').fill('   ');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('alert')).toContainText('Podaj nazwisko');
});

test('adding a retreat suggests the first missing degree', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?formation=none');
  await openFirstCard(page);

  await expect(page.getByText('Brak wpisów o rekolekcjach.')).toBeVisible();
  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Rodzaj rekolekcji 1')).toHaveValue('ONZ_I');
});

test('the name field appears only for INNE and is then required', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?formation=none');
  await openFirstCard(page);

  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toHaveCount(0);

  await page.getByLabel('Rodzaj rekolekcji 1').selectOption('INNE');
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toBeVisible();

  await page.getByLabel('Rok 1').fill('2020');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('alert')).toContainText('Podaj nazwę rekolekcji');
});

test('a region account cannot move a couple to another region', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  await openFirstCard(page);
  await expect(page.getByLabel('Rejon')).toBeDisabled();
});

test('the viewer gets no add button and no save', async ({ page }) => {
  await signIn(page, 'moderator@example.pl');
  await expect(page.getByRole('link', { name: '+ Dodaj parę' })).toHaveCount(0);

  await openFirstCard(page);
  await expect(page.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
  await expect(page.getByText('Podgląd bez możliwości edycji.')).toBeVisible();
});

test('adding a couple works end to end', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  await expect(page.getByRole('heading', { name: 'Dodaj parę' })).toBeVisible();

  const surname = `Nowi${Date.now() % 100000}`;
  await page.getByLabel('Imię żony').fill('Zofia');
  await page.getByLabel('Imię męża').fill('Jan');
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  // 301: the suite starts from a freshly seeded 300 and this test adds one.
  await page.goto(`/pary?q=${surname}`);
  await expect(page.getByRole('status')).toContainText('1 / 301');
});

test('deleting a couple removes it from the list', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  const surname = `DoUsuniecia${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await page.goto(`/pary?q=${surname}`);
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();

  await page.goto(`/pary?q=${surname}`);
  await expect(page.getByText('Brak wyników dla podanych kryteriów.').first()).toBeVisible();
});
```

- [ ] **Step 3: Uruchom**

Run: `npm run e2e`
Expected: PASS — 22 z poprzednich planów + 12 nowych

- [ ] **Step 4: Commit**

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

**Poza zakresem:** eksport i import (Plan 4), widoki rejonów, kont i historii (Plan 5), trwałe usunięcie na żądanie RODO (Plan 6). Comboboxy „+ nowy krąg" i „+ nowa parafia" są przygotowane w schemacie, ale interfejs dla nich powstaje razem z importem, bo tam ten sam mechanizm zakłada brakujące encje.

**Punkty listy odbioru:** wszystkie pola edytowalne · nazwisko wymagane · sekcja formacji z licznikiem i odmianą · pole nazwy tylko dla `Inne` · podpowiadanie stopnia · anulowanie porzuca zmiany · zapis/dodanie/usunięcie w historii zmian · drawer zamykany klikiem w tło, ✕ i `Esc` · banner „Tylko podgląd" · pole „Rejon" zablokowane dla pary rejonowej, z walidacją serwera.
