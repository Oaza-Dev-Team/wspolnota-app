# Kartoteka DK — Plan 4: Eksport XLSX i import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dane wychodzą i wchodzą. Eksport XLSX aktualnie przefiltrowanej listy oraz import z pliku o tym samym układzie kolumn — z podglądem przed zapisem i twardą walidacją.

**Architecture:** Eksport i import dzielą **jeden kontrakt kolumn** (`lib/couples/columns.ts`), więc pętla eksport → poprawki w Excelu → import działa w obie strony. Import nie ma własnej ścieżki do bazy: przechodzi przez `saveSchema` i `createCouple`/`updateCouple` z Planu 3. Dzięki temu nie da się przez niego wprowadzić danych, których nie przyjąłby formularz.

**Tech Stack:** Next.js 16.3 · Prisma 7.9 · Zod 4 · exceljs 4.4 · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` (§10 eksport, §11 import)
**Poprzedni plan:** `docs/superpowers/plans/2026-08-18-plan-3-karta-pary.md`

## Global Constraints

- **Nazewnictwo (spec §3):** po polsku wyłącznie to, co czyta człowiek. Identyfikatory, pliki, klasy CSS, pola bazy, komentarze, testy i commity po angielsku. **Nagłówki kolumn w pliku XLSX są po polsku** — czyta je użytkownik w Excelu.
- **Bez CSV.** Zakres zawężony 19.08.2026 (spec §10). Trasa eksportu nie przyjmuje parametru `format`.
- **Bezpieczeństwo:** `requireUser()` przed Prismą; eksport rozwija `listScope(user)`; import wyłącznie dla admina (`canImport`).
- **Audyt w tej samej transakcji co zmiana.** Eksport też zostawia wpis — to rejestr wydania danych osobowych.
- **Bez MUI i bez Tailwinda**, tokeny z `tokens.css`.
- **Commity** po każdym zadaniu, po angielsku.

## Trzy rzeczy z poprzednich planów

1. **`search_text` jest `GENERATED ALWAYS`** — nigdy nie wymieniaj w `data`.
2. **`bigint` nie przechodzi przez granicę serwer–klient.**
3. **W e2e: kliknięcie nie czeka na server action** — po zapisie czekaj na przekierowanie, zanim nawigujesz.

---

## Struktura plików

```
src/lib/couples/
  columns.ts              kontrakt kolumn — jedno źródło dla eksportu i importu
  export.ts               budowa skoroszytu XLSX
  import.ts               parsowanie pliku, walidacja, podgląd, zapis

src/app/
  eksport/route.ts        GET — zwraca plik
  (app)/import/
    page.tsx              formularz wgrania + podgląd
    actions.ts            server actions: analiza i zatwierdzenie
    ImportForm.tsx
    import.module.css

e2e/
  export-import.spec.ts
```

---

### Task 1: Kontrakt kolumn

Jedno miejsce definiujące układ. Eksport pisze wg niego, import czyta wg niego — rozjazd jest wtedy niemożliwy, a nie tylko nieprawdopodobny.

**Files:**
- Create: `src/lib/couples/columns.ts`
- Test: `src/lib/couples/columns.test.ts`

**Interfaces:**
- Produces:
  - `type SheetRow = { id: string; surname: string; wifeName: string; husbandName: string; email: string; phone: string; region: string; parish: string; circle: string; degrees: Record<RetreatKind, string>; other: string; children: string; notes: string }`
  - `COLUMNS: readonly { header: string; width: number }[]` — nagłówki po polsku
  - `rowToCells(row: SheetRow): string[]`
  - `cellsToRow(cells: string[]): SheetRow`
  - `formatDegreeCell(year: number, place: string | null): string`
  - `parseDegreeCell(text: string): { year: string; place: string } | null`
  - `formatOtherCell(entries: { year: number; place: string | null; name: string | null }[]): string`
  - `parseOtherCell(text: string): { name: string; year: string; place: string }[]`
  - `parseRegionCell(text: string): number | null`
  - `parseParishCell(text: string): { name: string; city: string } | null`
  - `parseCircleCell(text: string): { number: number; patron: string | null } | null`

- [ ] **Step 1: Napisz test**

`src/lib/couples/columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, cellsToRow, formatDegreeCell, formatOtherCell, parseCircleCell,
  parseDegreeCell, parseOtherCell, parseParishCell, parseRegionCell, rowToCells,
} from './columns';

const row = {
  id: '42',
  surname: 'Kowalscy', wifeName: 'Anna', husbandName: 'Piotr',
  email: 'k@example.pl', phone: '+48 601 202 303',
  region: 'VII', parish: 'św. Brygidy, Gdańsk', circle: '3 · św. Rity',
  degrees: Object.fromEntries(DEGREES.map((d) => [d, ''])) as Record<string, string>,
  other: '', children: 'Marysia 2014', notes: '',
};

describe('COLUMNS', () => {
  // ID + 8 base + 7 degrees + other + children + notes.
  it('has one column per field in the agreed order', () => {
    expect(COLUMNS).toHaveLength(1 + 8 + DEGREES.length + 3);
    expect(COLUMNS[0]!.header).toBe('ID');
    expect(COLUMNS[1]!.header).toBe('Nazwisko');
    expect(COLUMNS.at(-1)!.header).toBe('Notatki');
  });

  it('labels the degree columns with their UI codes', () => {
    const headers = COLUMNS.map((c) => c.header);
    expect(headers).toContain('ONŻ I (rok / miejsce)');
    expect(headers).toContain('ORD (rok / miejsce)');
  });
});

describe('rowToCells / cellsToRow', () => {
  it('round-trips a row through the cell array', () => {
    expect(cellsToRow(rowToCells(row))).toEqual(row);
  });

  it('emits exactly one cell per column', () => {
    expect(rowToCells(row)).toHaveLength(COLUMNS.length);
  });
});

describe('formatDegreeCell / parseDegreeCell', () => {
  it('writes year and place separated by a slash', () => {
    expect(formatDegreeCell(2014, 'Krościenko')).toBe('2014 / Krościenko');
  });

  it('writes the year alone when there is no place', () => {
    expect(formatDegreeCell(2014, null)).toBe('2014');
  });

  it('reads both shapes back', () => {
    expect(parseDegreeCell('2014 / Krościenko')).toEqual({ year: '2014', place: 'Krościenko' });
    expect(parseDegreeCell('2014')).toEqual({ year: '2014', place: '' });
  });

  it('treats a blank cell as no entry', () => {
    expect(parseDegreeCell('')).toBeNull();
    expect(parseDegreeCell('   ')).toBeNull();
  });

  it('keeps a place that itself contains a slash', () => {
    // Splits on the first separator only.
    expect(parseDegreeCell('2014 / Kraków / Nowa Huta'))
      .toEqual({ year: '2014', place: 'Kraków / Nowa Huta' });
  });
});

describe('formatOtherCell / parseOtherCell', () => {
  it('joins several entries with a pipe', () => {
    expect(formatOtherCell([
      { year: 2019, place: 'Chmielno', name: 'Ewangelizacyjne' },
      { year: 2021, place: null, name: 'Sesja' },
    ])).toBe('Ewangelizacyjne; 2019; Chmielno | Sesja; 2021; ');
  });

  it('reads them back', () => {
    expect(parseOtherCell('Ewangelizacyjne; 2019; Chmielno | Sesja; 2021; ')).toEqual([
      { name: 'Ewangelizacyjne', year: '2019', place: 'Chmielno' },
      { name: 'Sesja', year: '2021', place: '' },
    ]);
  });

  it('returns nothing for a blank cell', () => {
    expect(parseOtherCell('')).toEqual([]);
  });
});

describe('parseRegionCell', () => {
  it('accepts Roman numerals and plain numbers', () => {
    expect(parseRegionCell('VII')).toBe(7);
    expect(parseRegionCell('7')).toBe(7);
    expect(parseRegionCell(' vii ')).toBe(7);
  });

  it('rejects anything outside the range', () => {
    expect(parseRegionCell('XII')).toBeNull();
    expect(parseRegionCell('0')).toBeNull();
    expect(parseRegionCell('')).toBeNull();
    expect(parseRegionCell('ala')).toBeNull();
  });
});

describe('parseParishCell', () => {
  it('splits on the last comma, so a name may contain one', () => {
    expect(parseParishCell('św. Brygidy, Gdańsk'))
      .toEqual({ name: 'św. Brygidy', city: 'Gdańsk' });
    expect(parseParishCell('NMP Królowej Polski, Gdynia'))
      .toEqual({ name: 'NMP Królowej Polski', city: 'Gdynia' });
  });

  it('returns null when there is no comma or the cell is blank', () => {
    expect(parseParishCell('Gdańsk')).toBeNull();
    expect(parseParishCell('')).toBeNull();
  });
});

describe('parseCircleCell', () => {
  it('reads number and patron', () => {
    expect(parseCircleCell('3 · św. Rity')).toEqual({ number: 3, patron: 'św. Rity' });
    expect(parseCircleCell('3 - św. Rity')).toEqual({ number: 3, patron: 'św. Rity' });
  });

  it('reads a bare number', () => {
    expect(parseCircleCell('3')).toEqual({ number: 3, patron: null });
  });

  it('returns null for a blank or unparseable cell', () => {
    expect(parseCircleCell('')).toBeNull();
    expect(parseCircleCell('św. Rity')).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- columns`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/couples/columns.ts`:

```ts
import type { RetreatKind } from '@/generated/prisma/enums';
import { ROMAN, REGION_COUNT } from '@/lib/domain/regions';
import { DEGREES, retreatInfo } from '@/lib/domain/retreats';

export type SheetRow = {
  id: string;
  surname: string;
  wifeName: string;
  husbandName: string;
  email: string;
  phone: string;
  region: string;
  parish: string;
  circle: string;
  degrees: Record<RetreatKind, string>;
  other: string;
  children: string;
  notes: string;
};

/**
 * The single definition of the sheet layout. Export writes by it and import
 * reads by it, so the two cannot drift — the round trip is structural.
 *
 * Headers are Polish because a person reads them in Excel.
 */
export const COLUMNS: readonly { header: string; width: number }[] = [
  { header: 'ID', width: 8 },
  { header: 'Nazwisko', width: 20 },
  { header: 'Imię żony', width: 14 },
  { header: 'Imię męża', width: 14 },
  { header: 'E-mail', width: 28 },
  { header: 'Telefon', width: 17 },
  { header: 'Rejon', width: 8 },
  { header: 'Parafia', width: 30 },
  { header: 'Krąg', width: 20 },
  ...DEGREES.map((d) => ({ header: `${retreatInfo(d).code} (rok / miejsce)`, width: 26 })),
  { header: 'Inne rekolekcje', width: 34 },
  { header: 'Dzieci', width: 28 },
  { header: 'Notatki', width: 34 },
];

export function rowToCells(row: SheetRow): string[] {
  return [
    row.id,
    row.surname, row.wifeName, row.husbandName,
    row.email, row.phone, row.region, row.parish, row.circle,
    ...DEGREES.map((d) => row.degrees[d] ?? ''),
    row.other, row.children, row.notes,
  ];
}

export function cellsToRow(cells: string[]): SheetRow {
  const at = (i: number) => cells[i] ?? '';
  const degreesStart = 9;
  return {
    id: at(0),
    surname: at(1), wifeName: at(2), husbandName: at(3),
    email: at(4), phone: at(5), region: at(6), parish: at(7), circle: at(8),
    degrees: Object.fromEntries(
      DEGREES.map((d, i) => [d, at(degreesStart + i)]),
    ) as Record<RetreatKind, string>,
    other: at(degreesStart + DEGREES.length),
    children: at(degreesStart + DEGREES.length + 1),
    notes: at(degreesStart + DEGREES.length + 2),
  };
}

export function formatDegreeCell(year: number, place: string | null): string {
  return place ? `${year} / ${place}` : String(year);
}

/** Splits on the first separator only, so a place may itself contain one. */
export function parseDegreeCell(text: string): { year: string; place: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const i = trimmed.indexOf('/');
  if (i === -1) return { year: trimmed, place: '' };
  return {
    year: trimmed.slice(0, i).trim(),
    place: trimmed.slice(i + 1).trim(),
  };
}

const OTHER_SEPARATOR = ' | ';

export function formatOtherCell(
  entries: { year: number; place: string | null; name: string | null }[],
): string {
  return entries
    .map((e) => `${e.name ?? ''}; ${e.year}; ${e.place ?? ''}`)
    .join(OTHER_SEPARATOR);
}

export function parseOtherCell(text: string): { name: string; year: string; place: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split('|').map((chunk) => {
    const [name = '', year = '', place = ''] = chunk.split(';');
    return { name: name.trim(), year: year.trim(), place: place.trim() };
  });
}

export function parseRegionCell(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= REGION_COUNT) {
    return asNumber;
  }

  const upper = trimmed.toUpperCase();
  const index = ROMAN.findIndex((r) => r === upper);
  return index === -1 ? null : index + 1;
}

/** Splits on the last comma: parish names contain commas more often than cities. */
export function parseParishCell(text: string): { name: string; city: string } | null {
  const trimmed = text.trim();
  const i = trimmed.lastIndexOf(',');
  if (i === -1) return null;
  const name = trimmed.slice(0, i).trim();
  const city = trimmed.slice(i + 1).trim();
  return name && city ? { name, city } : null;
}

export function parseCircleCell(text: string): { number: number; patron: string | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(\d+)\s*(?:[·\-–—]\s*(.*))?$/.exec(trimmed);
  if (!match) return null;
  const patron = (match[2] ?? '').trim();
  return { number: Number(match[1]), patron: patron || null };
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- columns`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the shared sheet column contract"
```

---

### Task 2: Budowa skoroszytu

**Files:**
- Create: `src/lib/couples/export.ts`
- Test: `src/lib/couples/export.int.test.ts`

**Interfaces:**
- Consumes: `queryCouples` — ale eksport potrzebuje **wszystkich** wierszy, nie jednej strony
- Produces:
  - `exportRows(u: User, f: Filters): Promise<SheetRow[]>`
  - `buildWorkbook(rows: SheetRow[]): Promise<Buffer>`
  - `exportFileName(now: Date): string`

- [ ] **Step 1: Zainstaluj exceljs**

```bash
npm i exceljs
```

- [ ] **Step 2: Napisz test integracyjny**

`src/lib/couples/export.int.test.ts`:

```ts
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { COLUMNS } from './columns';
import { buildWorkbook, exportFileName, exportRows } from './export';
import { parseFilters } from './filters';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('exportRows', () => {
  // The checklist requires the export to cover the filtered list, not one page.
  it('returns every matching couple, not just the first page', async () => {
    const rows = await exportRows(admin, parseFilters({}));
    expect(rows).toHaveLength(300);
  });

  it('respects the filters', async () => {
    const rows = await exportRows(admin, parseFilters({ region: '3' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(300);
    expect(rows.every((r) => r.region === 'III')).toBe(true);
  });

  // Scope is not a filter the user can widen.
  it('narrows a region account to its own region even without a filter', async () => {
    const rows = await exportRows(regionVII, parseFilters({}));
    expect(rows.every((r) => r.region === 'VII')).toBe(true);
  });

  it('ignores a region filter pointing outside the account scope', async () => {
    const rows = await exportRows(regionVII, parseFilters({ region: '3' }));
    expect(rows.every((r) => r.region === 'VII')).toBe(true);
  });

  it('fills the degree columns from the retreat entries', async () => {
    const rows = await exportRows(admin, parseFilters({ formation: 'ONZ_I' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.degrees.ONZ_I !== '')).toBe(true);
  });

  it('leaves the degree columns blank for a couple with no entries', async () => {
    const rows = await exportRows(admin, parseFilters({ formation: 'none' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.degrees.ONZ_I).toBe('');
    expect(rows[0]!.other).toBe('');
  });
});

describe('buildWorkbook', () => {
  it('writes a real xlsx that reads back with the expected shape', async () => {
    const rows = await exportRows(admin, parseFilters({ region: '3' }));
    const buffer = await buildWorkbook(rows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0]!;

    // Header row plus one row per couple.
    expect(sheet.rowCount).toBe(rows.length + 1);

    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers).toEqual(COLUMNS.map((c) => c.header));
  });

  it('starts with the zip signature of an xlsx, not text', async () => {
    const buffer = await buildWorkbook(await exportRows(admin, parseFilters({ region: '3' })));
    // "PK" — an xlsx is a zip container. A CSV renamed to .xlsx would not be.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('keeps Polish characters intact through a round trip', async () => {
    const rows = await exportRows(admin, parseFilters({ q: 'Bagińscy' }));
    expect(rows.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorkbook(rows));
    const sheet = workbook.worksheets[0]!;
    const surnames = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      surnames.push(String(sheet.getRow(i).getCell(2).value ?? ''));
    }
    expect(surnames.every((s) => s === 'Bagińscy')).toBe(true);
  });
});

describe('exportFileName', () => {
  it('carries the date so downloads do not collide', () => {
    expect(exportFileName(new Date('2026-08-19T21:12:00'))).toBe('kartoteka-2026-08-19.xlsx');
  });
});
```

- [ ] **Step 3: Uruchom test — musi się wywalić**

Run: `npm run test:int -- export`
Expected: FAIL — brak modułu

- [ ] **Step 4: Zaimplementuj**

`src/lib/couples/export.ts`:

```ts
import ExcelJS from 'exceljs';
import type { RetreatKind } from '@/generated/prisma/enums';
import { type User, listScope } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, type SheetRow, formatDegreeCell, formatOtherCell, rowToCells,
} from './columns';
import { type Filters, whereForExport } from './queries';

function circleLabel(number: number, patron: string | null): string {
  return patron ? `${number} · ${patron}` : String(number);
}

/**
 * Every matching couple, not one page: the checklist requires the export to
 * cover the filtered list. Scope comes from the same listScope as the list, so
 * a region account cannot widen it through the query string.
 */
export async function exportRows(u: User, f: Filters): Promise<SheetRow[]> {
  const records = await prisma.couple.findMany({
    where: whereForExport(u, f),
    orderBy: [{ surname: 'asc' }, { wifeName: 'asc' }],
    select: {
      id: true, surname: true, wifeName: true, husbandName: true,
      email: true, phone: true, regionId: true,
      parish: { select: { name: true, city: true } },
      circle: {
        select: {
          number: true, patron: true,
          parish: { select: { name: true, city: true } },
        },
      },
      retreats: { select: { kind: true, year: true, place: true, name: true } },
    },
  });

  return records.map((r) => {
    const parish = r.parish ?? r.circle?.parish ?? null;

    const degrees = Object.fromEntries(DEGREES.map((d) => [d, ''])) as Record<RetreatKind, string>;
    for (const entry of r.retreats) {
      if (entry.kind === 'INNE') continue;
      degrees[entry.kind] = formatDegreeCell(entry.year, entry.place);
    }

    return {
      id: String(r.id),
      surname: r.surname,
      wifeName: r.wifeName,
      husbandName: r.husbandName,
      email: r.email ?? '',
      phone: r.phone ?? '',
      region: romanNumeral(r.regionId),
      parish: parish ? `${parish.name}, ${parish.city}` : '',
      circle: r.circle ? circleLabel(r.circle.number, r.circle.patron) : '',
      degrees,
      other: formatOtherCell(r.retreats.filter((e) => e.kind === 'INNE')),
      children: r.children ?? '',
      notes: r.notes ?? '',
    };
  });
}

export async function buildWorkbook(rows: SheetRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kartoteka DK';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  sheet.getRow(1).font = { bold: true };
  // The header stays visible while scrolling three hundred rows.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow(rowToCells(row));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kartoteka-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
}
```

- [ ] **Step 5: Wynieś warunek `where` z `queries.ts`**

`exportRows` potrzebuje tego samego `where` co lista. Dziś jest on prywatny w `queries.ts`. Wyeksportuj go pod nazwą `whereForExport` i użyj w obu miejscach — inaczej powstaną dwie definicje zakresu, a to jest dokładnie ta klasa błędu, której cały projekt unika.

W `src/lib/couples/queries.ts` zmień:

```ts
function where(u: User, f: Filters): Prisma.CoupleWhereInput {
```

na:

```ts
/** Shared with the export so both narrow the same way. */
export function whereForExport(u: User, f: Filters): Prisma.CoupleWhereInput {
```

i podmień wywołanie wewnątrz `queryCouples`. Wyeksportuj też typ: `export type { Filters }` już jest dostępny z `filters.ts`, więc w `export.ts` importuj `Filters` stamtąd, a `whereForExport` z `queries.ts`.

- [ ] **Step 6: Uruchom test — musi przejść**

Run: `npm run test:int -- export`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build the xlsx export workbook"
```

---

### Task 3: Trasa eksportu

**Files:**
- Create: `src/app/eksport/route.ts`
- Modify: `src/app/(app)/pary/page.tsx`, `src/app/(app)/pary/couples.module.css`

**Interfaces:**
- Produces: `GET /eksport?<parametry listy>` → plik XLSX + wpis do audytu

- [ ] **Step 1: Napisz trasę**

`src/app/eksport/route.ts`:

```ts
import { requireUser } from '@/lib/auth/requireUser';
import { buildWorkbook, exportFileName, exportRows } from '@/lib/couples/export';
import { parseFilters } from '@/lib/couples/filters';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  // A route handler is as public as a server action; the session comes first.
  const u = await requireUser();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseFilters(params);
  const rows = await exportRows(u, filters);

  const buffer = await buildWorkbook(rows);
  const fileName = exportFileName(new Date());

  // Handing out personal data is an event worth recording — this is the
  // export register the GDPR section calls for.
  await prisma.audit.create({
    data: {
      kind: 'export',
      description: `Wyeksportowano ${rows.length} rekordów do XLSX`,
      accountId: u.id,
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 2: Dodaj przycisk do nagłówka listy**

Eksport musi nieść **aktualne filtry**, więc link buduje się z tych samych `searchParams`.

W `page.tsx`, w `<ViewHeader>` przed przyciskiem dodawania:

```tsx
        <a
          href={`/eksport${toSearchParams(filters).toString() ? `?${toSearchParams(filters)}` : ''}`}
          className={style.exportButton}
        >
          Eksport XLSX
        </a>
```

Dopisz import `toSearchParams` z `@/lib/couples/filters` i styl:

```css
.exportButton {
  display: inline-flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 12px 15px;
  font-size: 14px;
  font-weight: 500;
  min-height: 44px;
  color: var(--text);
  text-decoration: none;
}

.exportButton:hover { border-color: var(--navy-700); }
```

- [ ] **Step 3: Sprawdź ręcznie**

```bash
npm run dev
```

Zaloguj się jako admin, przefiltruj listę (np. `?region=3`), kliknij „Eksport XLSX". Plik ma się pobrać, otworzyć w Excelu bez ostrzeżeń, mieć nagłówki po polsku i tylko pary z rejonu III.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the xlsx export route with an audit entry"
```

---

### Task 4: Parsowanie i walidacja importu

**Files:**
- Create: `src/lib/couples/import.ts`
- Test: `src/lib/couples/import.int.test.ts`

**Interfaces:**
- Produces:
  - `type ImportIssue = { row: number; message: string }`
  - `type ImportPlan = { toCreate: PreparedRow[]; toUpdate: PreparedRow[]; issues: ImportIssue[] }`
  - `type PreparedRow = { rowNumber: number; coupleId: bigint | null; data: SaveInput }`
  - `analyzeWorkbook(u: User, buffer: Buffer): Promise<ImportPlan>`
  - `applyImport(u: User, plan: ImportPlan): Promise<{ created: number; updated: number }>`
  - `templateWorkbook(): Promise<Buffer>`

- [ ] **Step 1: Napisz test integracyjny**

`src/lib/couples/import.int.test.ts`:

```ts
import ExcelJS from 'exceljs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { COLUMNS } from './columns';
import { analyzeWorkbook, applyImport, templateWorkbook } from './import';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
});

afterEach(async () => {
  const strays = await prisma.couple.findMany({
    where: { surname: { startsWith: 'Importowani' } },
    select: { id: true },
  });
  const ids = strays.map((s) => s.id);
  if (ids.length) {
    await prisma.retreat.deleteMany({ where: { coupleId: { in: ids } } });
    await prisma.audit.deleteMany({ where: { coupleId: { in: ids } } });
    await prisma.couple.deleteMany({ where: { id: { in: ids } } });
  }
});

/** Builds a workbook in memory with the given data rows. */
async function sheetWith(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.addRow(COLUMNS.map((c) => c.header));
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A valid row: ID blank, surname, names, region VII, everything else empty. */
function validRow(surname: string, overrides: Record<number, string> = {}): string[] {
  const cells = new Array(COLUMNS.length).fill('');
  cells[1] = surname;
  cells[2] = 'Zofia';
  cells[3] = 'Jan';
  cells[6] = 'VII';
  for (const [i, v] of Object.entries(overrides)) cells[Number(i)] = v;
  return cells;
}

describe('analyzeWorkbook', () => {
  it('plans a create for a row with no ID', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani1')]));
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('plans an update for a row whose ID exists', async () => {
    const existing = await prisma.couple.findFirstOrThrow({ where: { deletedAt: null } });
    const row = validRow('Importowani2', { 0: String(existing.id) });
    const plan = await analyzeWorkbook(admin, await sheetWith([row]));
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]!.coupleId).toBe(existing.id);
  });

  it('reports the row number with every problem', async () => {
    const bad = validRow('');
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani3'), bad]));
    expect(plan.issues).toHaveLength(1);
    // Row 1 is the header, so the second data row is sheet row 3.
    expect(plan.issues[0]!.row).toBe(3);
    expect(plan.issues[0]!.message).toContain('nazwisko');
  });

  it('rejects an unknown region', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([
      validRow('Importowani4', { 6: 'XII' }),
    ]));
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toContain('rejon');
  });

  it('rejects an ID that does not exist', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([
      validRow('Importowani5', { 0: '999999999' }),
    ]));
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toContain('nie istnieje');
  });

  it('reads the degree columns into retreat entries', async () => {
    const withDegree = validRow('Importowani6', { 9: '2014 / Krościenko' });
    const plan = await analyzeWorkbook(admin, await sheetWith([withDegree]));
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate[0]!.data.retreats).toEqual([
      { kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: null },
    ]);
  });

  it('reads the other-retreats column', async () => {
    const other = validRow('Importowani7', { 16: 'Ewangelizacyjne; 2019; Chmielno' });
    const plan = await analyzeWorkbook(admin, await sheetWith([other]));
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate[0]!.data.retreats).toEqual([
      { kind: 'INNE', year: 2019, place: 'Chmielno', name: 'Ewangelizacyjne' },
    ]);
  });

  it('skips entirely blank rows rather than reporting them', async () => {
    const blank = new Array(COLUMNS.length).fill('');
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani8'), blank]));
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
  });

  // Scope is enforced here as well as at write time, so the preview tells the
  // truth rather than promising a save that will be refused.
  it('refuses a row outside a region account own region', async () => {
    const plan = await analyzeWorkbook(regionVII, await sheetWith([
      validRow('Importowani9', { 6: 'III' }),
    ]));
    expect(plan.issues).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(0);
  });
});

describe('applyImport', () => {
  it('creates the planned couples and records the audit', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([
      validRow('Importowani10'), validRow('Importowani11'),
    ]));
    const before = await prisma.audit.count({ where: { kind: 'create' } });

    const result = await applyImport(admin, plan);

    expect(result).toEqual({ created: 2, updated: 0 });
    expect(await prisma.couple.count({ where: { surname: { startsWith: 'Importowani' } } }))
      .toBe(2);
    expect(await prisma.audit.count({ where: { kind: 'create' } })).toBe(before + 2);
  });

  it('refuses to apply a plan that still has issues', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('')]));
    await expect(applyImport(admin, plan)).rejects.toThrow();
  });
});

describe('templateWorkbook', () => {
  it('contains the headers and no data rows', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await templateWorkbook());
    const sheet = workbook.worksheets[0]!;

    expect(sheet.rowCount).toBe(1);
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers).toEqual(COLUMNS.map((c) => c.header));
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- import`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/couples/import.ts`:

```ts
import ExcelJS from 'exceljs';
import { Forbidden, type User, canEdit, canImport } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, cellsToRow, parseCircleCell, parseDegreeCell, parseOtherCell,
  parseParishCell, parseRegionCell,
} from './columns';
import { type SaveInput, saveSchema } from './schema';
import { createCouple, updateCouple } from './save';

export type ImportIssue = { row: number; message: string };

export type PreparedRow = {
  rowNumber: number;
  coupleId: bigint | null;
  data: SaveInput;
};

export type ImportPlan = {
  toCreate: PreparedRow[];
  toUpdate: PreparedRow[];
  issues: ImportIssue[];
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  return String(value);
}

/**
 * Reads the workbook and decides what would happen, without touching the
 * database. The preview the user confirms is exactly this plan.
 */
export async function analyzeWorkbook(u: User, buffer: Buffer): Promise<ImportPlan> {
  if (!canImport(u)) throw new Forbidden('Import jest dostępny tylko dla administratora');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { toCreate: [], toUpdate: [], issues: [{ row: 0, message: 'Pusty plik' }] };
  }

  const plan: ImportPlan = { toCreate: [], toUpdate: [], issues: [] };

  // Row 1 is the header, so data starts at 2 and issue rows carry sheet numbers.
  for (let n = 2; n <= sheet.rowCount; n++) {
    const cells = COLUMNS.map((_, i) => cellText(sheet.getRow(n).getCell(i + 1).value).trim());
    if (cells.every((c) => c === '')) continue;

    const row = cellsToRow(cells);
    const issue = (message: string) => plan.issues.push({ row: n, message });

    const regionId = parseRegionCell(row.region);
    if (regionId === null) {
      issue(`Nieznany rejon: „${row.region}”`);
      continue;
    }

    if (!canEdit(u, { regionId })) {
      issue(`Nie masz uprawnień do rejonu ${row.region}`);
      continue;
    }

    let coupleId: bigint | null = null;
    if (row.id !== '') {
      if (!/^\d+$/.test(row.id)) {
        issue(`Niepoprawne ID: „${row.id}”`);
        continue;
      }
      const existing = await prisma.couple.findFirst({
        where: { id: BigInt(row.id), deletedAt: null },
        select: { id: true, regionId: true },
      });
      if (!existing) {
        issue(`Para o ID ${row.id} nie istnieje`);
        continue;
      }
      if (!canEdit(u, { regionId: existing.regionId })) {
        issue(`Nie masz uprawnień do pary o ID ${row.id}`);
        continue;
      }
      coupleId = existing.id;
    }

    const retreats: SaveInput['retreats'] = [];
    let entryProblem = false;

    for (const degree of DEGREES) {
      const parsed = parseDegreeCell(row.degrees[degree] ?? '');
      if (!parsed) continue;
      const year = Number(parsed.year);
      if (!Number.isInteger(year)) {
        issue(`Niepoprawny rok w kolumnie ${degree}: „${parsed.year}”`);
        entryProblem = true;
        continue;
      }
      retreats.push({ kind: degree, year, place: parsed.place || null, name: null });
    }

    for (const other of parseOtherCell(row.other)) {
      const year = Number(other.year);
      if (!Number.isInteger(year)) {
        issue(`Niepoprawny rok w „Inne rekolekcje”: „${other.year}”`);
        entryProblem = true;
        continue;
      }
      if (!other.name) {
        issue('Wpis w „Inne rekolekcje” bez nazwy');
        entryProblem = true;
        continue;
      }
      retreats.push({ kind: 'INNE', year, place: other.place || null, name: other.name });
    }

    if (entryProblem) continue;

    const parish = parseParishCell(row.parish);
    const circle = parseCircleCell(row.circle);

    const parsed = saveSchema.safeParse({
      couple: {
        wifeName: row.wifeName,
        husbandName: row.husbandName,
        surname: row.surname,
        email: row.email,
        phone: row.phone,
        regionId,
        circleId: null,
        newCircle: circle && parish
          ? { number: circle.number, patron: circle.patron ?? '', parishId: '0' }
          : null,
        parishId: null,
        newParish: parish,
        children: row.children,
        notes: row.notes,
      },
      retreats,
    });

    if (!parsed.success) {
      issue(parsed.error.issues[0]?.message ?? 'Niepoprawne dane w wierszu');
      continue;
    }

    const prepared: PreparedRow = { rowNumber: n, coupleId, data: parsed.data };
    if (coupleId === null) plan.toCreate.push(prepared);
    else plan.toUpdate.push(prepared);
  }

  return plan;
}

export async function applyImport(
  u: User,
  plan: ImportPlan,
): Promise<{ created: number; updated: number }> {
  if (!canImport(u)) throw new Forbidden('Import jest dostępny tylko dla administratora');
  if (plan.issues.length > 0) {
    throw new Error('Plan importu zawiera błędy — popraw plik i wgraj ponownie');
  }

  // Row by row through the same write layer the form uses, so the audit trail
  // and the permission checks are identical to a manual edit.
  for (const row of plan.toCreate) {
    await createCouple(u, row.data);
  }
  for (const row of plan.toUpdate) {
    await updateCouple(u, row.coupleId!, row.data);
  }

  return { created: plan.toCreate.length, updated: plan.toUpdate.length };
}

export async function templateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kartoteka DK';

  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
```

**Uwaga o `newCircle.parishId`:** schemat wymaga identyfikatora parafii dla nowego kręgu, a przy imporcie parafia też dopiero powstaje. Rozwiąż to w warstwie zapisu: `resolveRelations` tworzy najpierw parafię, więc `newCircle.parishId` może wskazywać na „tę, którą właśnie utworzyłem". **Popraw `save.ts`** tak, żeby `newCircle.parishId === '0'` znaczyło „użyj parafii z `newParish`". Dopisz test tego zachowania w `save.int.test.ts`.

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- import`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add workbook import analysis and application"
```

---

### Task 5: Widok importu

**Files:**
- Create: `src/app/(app)/import/page.tsx`, `actions.ts`, `ImportForm.tsx`, `import.module.css`
- Modify: `src/lib/navigation.ts` — pozycja „Import" dla admina

- [ ] **Step 1: Dodaj pozycję nawigacji**

W `navigation.ts`, w gałęzi dla ról innych niż `region`, po `accounts`:

```ts
  if (canImport(u)) {
    items.push({ href: '/import', label: 'Import', key: 'import' });
  }
```

Rozszerz `ViewKey` o `'import'` i dopisz przypadek do testu `navItems` — admin ma teraz **pięć** pozycji, nie cztery. **Zaktualizuj też `e2e/list.spec.ts`**, gdzie liczba pozycji jest asercją.

- [ ] **Step 2: Napisz server actions**

`src/app/(app)/import/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { type ImportIssue, analyzeWorkbook, applyImport } from '@/lib/couples/import';

export type ImportState = {
  error?: string;
  issues?: ImportIssue[];
  toCreate?: number;
  toUpdate?: number;
  applied?: { created: number; updated: number };
  // The parsed plan cannot cross back through a form, so the confirmed step
  // re-reads the file the user uploaded a second time.
  fileName?: string;
};

async function bufferFrom(formData: FormData): Promise<Buffer | null> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return null;
  return Buffer.from(await file.arrayBuffer());
}

export async function analyzeAction(_state: ImportState, formData: FormData): Promise<ImportState> {
  const u = await requireUser();
  const buffer = await bufferFrom(formData);
  if (!buffer) return { error: 'Wybierz plik XLSX' };

  try {
    const plan = await analyzeWorkbook(u, buffer);
    return {
      issues: plan.issues,
      toCreate: plan.toCreate.length,
      toUpdate: plan.toUpdate.length,
    };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { error: 'Nie udało się odczytać pliku. Czy to na pewno XLSX?' };
  }
}

export async function applyAction(_state: ImportState, formData: FormData): Promise<ImportState> {
  const u = await requireUser();
  const buffer = await bufferFrom(formData);
  if (!buffer) return { error: 'Wybierz plik XLSX' };

  try {
    const plan = await analyzeWorkbook(u, buffer);
    if (plan.issues.length > 0) {
      return {
        error: 'Plik nadal zawiera błędy',
        issues: plan.issues,
        toCreate: plan.toCreate.length,
        toUpdate: plan.toUpdate.length,
      };
    }
    const applied = await applyImport(u, plan);
    revalidatePath('/pary');
    return { applied };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { error: 'Import się nie powiódł' };
  }
}
```

**Dlaczego plik czytany dwa razy:** plan importu zawiera `bigint` i `SaveInput`, więc nie przejdzie przez `FormData` z powrotem do serwera. Trzymanie go w pamięci serwera między żądaniami wymagałoby stanu sesyjnego. Ponowne wczytanie tego samego pliku jest tańsze i **bezpieczniejsze**: użytkownik zatwierdza to, co jest w pliku teraz, a nie to, co widział pięć minut temu.

- [ ] **Step 3: Napisz szablon do pobrania**

`src/app/eksport/szablon/route.ts`:

```ts
import { requireUser } from '@/lib/auth/requireUser';
import { canImport } from '@/lib/auth/permissions';
import { templateWorkbook } from '@/lib/couples/import';

export async function GET() {
  const u = await requireUser();
  if (!canImport(u)) return new Response('Brak uprawnień', { status: 403 });

  const buffer = await templateWorkbook();
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="kartoteka-szablon.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 4: Napisz widok**

`src/app/(app)/import/page.tsx` — server component, sprawdza uprawnienie i renderuje formularz:

```tsx
import { redirect } from 'next/navigation';
import { canImport } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { ViewHeader } from '../ViewHeader';
import { ImportForm } from './ImportForm';

export default async function ImportPage() {
  const u = await requireUser();
  if (!canImport(u)) redirect('/pary');

  return (
    <>
      <ViewHeader
        title="Import z arkusza"
        subtitle="Wgraj plik XLSX w układzie eksportu — zobaczysz podgląd przed zapisem"
      />
      <ImportForm />
    </>
  );
}
```

`ImportForm.tsx` — komponent kliencki z dwoma etapami: analiza, potem zatwierdzenie. Pełny kod w Kroku 5.

- [ ] **Step 5: Napisz formularz**

`src/app/(app)/import/ImportForm.tsx`:

```tsx
'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RECORDS, plural } from '@/lib/pl';
import { type ImportState, analyzeAction, applyAction } from './actions';
import style from './import.module.css';

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.primary} disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function ImportForm() {
  const [analysis, analyze] = useActionState<ImportState, FormData>(analyzeAction, {});
  const [result, apply] = useActionState<ImportState, FormData>(applyAction, {});
  const [fileChosen, setFileChosen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const state = result.applied || result.error ? result : analysis;
  const ready =
    analysis.issues !== undefined &&
    analysis.issues.length === 0 &&
    (analysis.toCreate ?? 0) + (analysis.toUpdate ?? 0) > 0;

  return (
    <div className={style.wrapper}>
      <p className={style.hint}>
        Nie masz pliku w tym układzie?{' '}
        <a href="/eksport/szablon" className={style.link}>Pobierz pusty szablon</a>{' '}
        albo wyeksportuj obecną kartotekę i popraw ją w Excelu.
      </p>

      <form action={analyze} className={style.form}>
        <label className={style.field}>
          <span className={style.label}>Plik XLSX</span>
          <input
            ref={fileInput}
            className={style.file}
            type="file"
            name="file"
            accept=".xlsx"
            required
            onChange={(e) => setFileChosen(e.currentTarget.files!.length > 0)}
          />
        </label>
        <Submit label="Sprawdź plik" busy="Sprawdzam…" />
      </form>

      {state.error && <p className={style.error} role="alert">{state.error}</p>}

      {state.applied && (
        <p className={style.success} role="status">
          Zaimportowano: {plural(state.applied.created, RECORDS)} nowych,{' '}
          {plural(state.applied.updated, RECORDS)} zaktualizowanych.
        </p>
      )}

      {analysis.issues !== undefined && !state.applied && (
        <section className={style.preview}>
          <h2 className={style.previewTitle}>Podgląd</h2>
          <p className={style.summary}>
            Do dodania: <strong>{analysis.toCreate}</strong> ·{' '}
            Do aktualizacji: <strong>{analysis.toUpdate}</strong> ·{' '}
            Z błędami: <strong>{analysis.issues.length}</strong>
          </p>

          {analysis.issues.length > 0 && (
            <ul className={style.issues}>
              {analysis.issues.map((issue, i) => (
                <li key={i} className={style.issue}>
                  <span className={style.issueRow}>wiersz {issue.row}</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          {ready && (
            <form
              action={apply}
              onSubmit={(e) => {
                // The file input is in the other form; move the chosen file over.
                const chosen = fileInput.current?.files?.[0];
                if (!chosen) {
                  e.preventDefault();
                  return;
                }
                const transfer = new DataTransfer();
                transfer.items.add(chosen);
                (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files =
                  transfer.files;
              }}
            >
              <input className={style.hiddenFile} type="file" name="file" accept=".xlsx" />
              <Submit label="Zatwierdź import" busy="Importuję…" />
            </form>
          )}

          {!ready && analysis.issues.length > 0 && (
            <p className={style.hint}>
              Popraw wskazane wiersze w pliku i wgraj go ponownie. Nic nie zostało zapisane.
            </p>
          )}
        </section>
      )}

      {!fileChosen && !state.applied && (
        <p className={style.hint}>Wybierz plik, żeby zobaczyć podgląd.</p>
      )}
    </div>
  );
}
```

Jeśli przenoszenie pliku między formularzami okaże się kruche, **zamień oba etapy na jeden formularz z polem `intent`** (`sprawdz` / `zatwierdz`) i jedną akcją, która rozgałęzia się na tej wartości. To prostsze i nie wymaga `DataTransfer`. Rozstrzygnij po pierwszym uruchomieniu w przeglądarce i zapisz wybór w komentarzu.

- [ ] **Step 6: Napisz style**

`src/app/(app)/import/import.module.css`:

```css
.wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
}

.form {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-12);
  padding: 18px;
  box-shadow: var(--shadow-table);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 240px;
}

.label {
  font-size: 13px;
  color: var(--text-muted);
}

.file {
  font-size: 14px;
  min-height: 44px;
}

.hiddenFile {
  display: none;
}

.primary {
  background: var(--navy-700);
  color: var(--surface);
  border: none;
  border-radius: var(--r-8);
  padding: 12px 17px;
  font-size: 14px;
  font-weight: 600;
  min-height: 44px;
  cursor: pointer;
}

.primary:hover { background: var(--navy-900); }
.primary:disabled { opacity: .6; cursor: progress; }

.preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-12);
  padding: 18px;
  box-shadow: var(--shadow-table);
}

.previewTitle {
  font-family: var(--font-heading), Georgia, serif;
  font-size: 20px;
  font-weight: 400;
}

.summary {
  font-size: 14px;
  color: var(--text-body);
  margin: 0;
}

.issues {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
}

.issue {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: var(--danger-fg);
  background: var(--danger-bg);
  border-radius: var(--r-7);
  padding: 8px 10px;
}

.issueRow {
  font-family: var(--font-mono), monospace;
  flex: none;
  min-width: 74px;
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

.success {
  background: var(--success-bg);
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 14px;
  color: var(--success-fg);
  margin: 0;
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.link { color: var(--navy-700); }
```

- [ ] **Step 7: Sprawdź w przeglądarce**

Zaloguj się jako admin, wejdź na `/import`, pobierz szablon, wypełnij dwa wiersze, wgraj. Podgląd ma pokazać „Do dodania: 2". Zatwierdź — pary pojawiają się na liście. Wgraj plik z pustym nazwiskiem — podgląd pokazuje błąd z numerem wiersza i **nie da się zatwierdzić**.

Jako para rejonowa: `/import` przekierowuje na `/pary`, a w nawigacji nie ma pozycji „Import".

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add the import view with a preview before saving"
```

---

### Task 6: Testy end-to-end

**Files:**
- Create: `e2e/export-import.spec.ts`

- [ ] **Step 1: Napisz testy**

`e2e/export-import.spec.ts`:

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

test('the export downloads an xlsx carrying the current filters', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?region=3');

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksport XLSX' }).click(),
  ]).then(([d]) => d);

  expect(download.suggestedFilename()).toMatch(/^kartoteka-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('the export link keeps the filters in its address', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?region=3&formation=ONZ_I');
  const href = await page.getByRole('link', { name: 'Eksport XLSX' }).getAttribute('href');
  expect(href).toContain('region=3');
  expect(href).toContain('formation=ONZ_I');
});

test('a region account may export, and gets only its own region', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksport XLSX' }).click(),
  ]).then(([d]) => d);
  expect(download.suggestedFilename()).toContain('.xlsx');
});

test('import is admin-only', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  await expect(page.getByRole('link', { name: 'Import' })).toHaveCount(0);
  await page.goto('/import');
  await expect(page).toHaveURL(/\/pary/);
});

test('the template downloads for admin', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/import');

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Pobierz pusty szablon' }).click(),
  ]).then(([d]) => d);

  expect(download.suggestedFilename()).toBe('kartoteka-szablon.xlsx');
});
```

- [ ] **Step 2: Uruchom**

Run: `npm run e2e`
Expected: PASS — 34 z poprzednich planów + 5 nowych

Testy eksportu i importu **nie zmieniają danych**, więc nie psują asercji `300 / 300` w `list.spec.ts`. Testy zapisu przez import zostają w warstwie integracyjnej, gdzie sprzątanie jest tanie i pewne.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for export and import"
```

---

## Stan po Planie 4

- Eksport XLSX aktualnie przefiltrowanej listy, z wpisem do rejestru wydań
- Szablon do pobrania, o tym samym układzie co eksport
- Import z podglądem przed zapisem: ile nowych, ile do aktualizacji, co jest błędne i w którym wierszu
- Import przechodzi przez tę samą walidację i ten sam zapis co formularz

**Poza zakresem:** widoki rejonów, kont i historii (Plan 5); RODO i odbiór (Plan 6).

**Punkty listy odbioru:** eksportuje aktualnie przefiltrowaną listę · XLSX to prawdziwy plik · komplet kolumn · eksport dopisuje wpis do historii zmian. **Punkty o CSV są nieaktualne** — zakres zawężony 19.08.2026.
