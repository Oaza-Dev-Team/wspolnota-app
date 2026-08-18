# Kartoteka DK — Plan 1: Fundament i uwierzytelnianie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uruchomiona aplikacja Next.js z bazą wypełnioną danymi testowymi, ekranem logowania zgodnym z projektem i modułem uprawnień pokrytym wyczerpującymi testami — po którym trzy role logują się i widzą to, co im wolno.

**Architecture:** Next.js App Router z PostgreSQL przez Prismę. Sesje trzymane w bazie (nie JWT), bo wyłączenie konta musi działać natychmiast. Reguły uprawnień żyją w jednym module bez zależności od bazy — dzięki temu są w pełni testowalne jednostkowo i zasilają zarówno UI, jak i serwer. Warstwy czysto funkcyjne (`lib/pl`, `lib/domena`, `lib/auth/permissions`) powstają przed warstwami dotykającymi bazy.

**Tech Stack:** Next.js 16.3.1 · React 19.2 · TypeScript strict · PostgreSQL 16 · Prisma 7.9 · Zod 4 · @node-rs/argon2 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md`
**Wymagania źródłowe:** `docs/handoff/README.md` (wygląd), `docs/handoff/IMPLEMENTATION.md` (lista odbioru)

## Uwaga o trwałości zadań 9 i 11

Logowanie kontem Google jest rozważane jako zamiennik hasła, decyzja zapada w Planie 5
(spec §6.1). Zadania **9 (argon2id)** i **11 (limit prób logowania)** to jedyne miejsca,
które wtedy zniknęłyby — łącznie około stu linii. Wszystko pozostałe, w szczególności
sesje (zad. 10), `requireUser()` (zad. 12) i uprawnienia (zad. 8), jest wspólne dla obu
metod: obie schodzą się w `utworzSesje(kontoId)`.

Praktyczny wniosek dla wykonawcy: **nie dobudowuj tu przepływu zaproszeń ani resetu
hasła.** Konto w statusie `oczekuje` ma się po prostu nie logować — zadanie 15 to
testuje. To właśnie ten przepływ byłby kosztowną stratą przy zmianie decyzji.

## Global Constraints

Obowiązują w **każdym** zadaniu tego planu.

- **Wersje:** Next.js 16.3.1 · React 19.2 · TypeScript `strict: true` · PostgreSQL 16 · Prisma 7.9 · Zod 4 · Vitest 4
- **Bez MUI i bez Tailwinda.** Style wyłącznie CSS Modules + custom properties z `src/styles/tokens.css`. **Literalna wartość koloru, odstępu, promienia lub cienia w pliku `.module.css` jest błędem do odrzucenia w review** — ma być `var(--…)`.
- **Fonty:** `next/font/google` — Source Sans 3 (400/500/600/700), Source Serif 4 (400/600), IBM Plex Mono (400/500). Podzbiór `latin-ext`, `display: swap`. Żadnego `<link>` do `fonts.googleapis.com` — self-hosting jest wymaganiem RODO, nie optymalizacją.
- **Nazewnictwo:** identyfikatory domenowe po polsku (`para`, `rejon`, `krag`, `rekolekcje`, `audyt`, `nazwisko`); identyfikatory techniczne po angielsku (`requireUser`, `parseFilters`); **komentarze, nazwy testów i commity po angielsku**; cały interfejs po polsku; `lang="pl"` na `<html>`.
- **Reguła bezpieczeństwa bez wyjątków:** żadna server action ani route handler nie dotyka Prismy przed wywołaniem `requireUser()`.
- **Hasła:** argon2id (`@node-rs/argon2`). Tokeny sesji i zaproszeń przechowywane w bazie **wyłącznie jako SHA-256**.
- **Commity:** po każdym zadaniu, w języku angielskim, w trybie rozkazującym.

---

## Struktura plików

```
prisma.config.ts                 konfiguracja Prismy 7 (schema, migracje, URL)
docker-compose.yml               Postgres 16
.env.example                     wzorzec zmiennych środowiskowych
vitest.config.ts
playwright.config.ts

prisma/
  schema.prisma                  pełny schemat
  migrations/
  seed.ts                        wypełnianie bazy
  seed/dane.ts                   listy nazwisk, imion, parafii, miejsc

src/
  generated/prisma/              klient Prismy (generowany, w .gitignore)
  app/
    layout.tsx                   root layout: fonty, lang="pl"
    globals.css
    (auth)/logowanie/page.tsx    ekran logowania
    (auth)/logowanie/akcje.ts    server action logowania
    (auth)/logowanie/Formularz.tsx
    (auth)/logowanie/logowanie.module.css
    (app)/layout.tsx             layout chroniony — requireUser()
    (app)/pary/page.tsx          zaślepka pod Plan 2
    wyloguj/route.ts
  lib/
    db.ts                        singleton PrismaClient
    pl/
      odmiana.ts                 odmiana liczebników
      sortowanie.ts              porównanie polskie
      formaty.ts                 daty, telefon
      index.ts
    domena/
      rekolekcje.ts              8 rodzajów, kolejność ścieżki formacji
      rejony.ts                  liczby rzymskie, paleta 12 kolorów
    auth/
      permissions.ts             reguły uprawnień — czyste, bez bazy
      hasla.ts                   argon2id
      sesja.ts                   sesje w bazie
      limity.ts                  ograniczenie prób logowania
      requireUser.ts             odczyt sesji z cookie
  styles/
    tokens.css                   wszystkie tokeny projektu

e2e/
  logowanie.spec.ts
```

**Zasada podziału:** moduły czyste (`pl`, `domena`, `permissions`) nie importują Prismy. Dzięki temu testują się bez bazy i w milisekundach, a `permissions.ts` — czyli miejsce, w którym błąd oznacza wyciek danych osobowych — jest pokryty wyczerpującą macierzą, a nie kilkoma przykładami.

---

### Task 1: Szkielet projektu i narzędzia

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nic
- Produces: działające `npm run dev`, `npm run build`, `npm test`; alias importu `@/*` → `src/*`

- [ ] **Step 1: Wygeneruj szkielet Next.js**

Katalog zawiera już `docs/` i `.git` — `create-next-app` to akceptuje.

```bash
npx create-next-app@16.3.1 . --typescript --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --yes
```

Jeśli polecenie odmówi z powodu niepustego katalogu: wygeneruj w katalogu obok, przenieś zawartość, usuń katalog tymczasowy.

- [ ] **Step 2: Zainstaluj zależności deweloperskie**

```bash
npm i -D vitest@4
```

Vitest 4 rozwiazuje alias `@/*` z tsconfig natywnie, a testy Planu 1 sa wylacznie
w `.ts` — ani `vite-tsconfig-paths`, ani `@vitejs/plugin-react` nie sa potrzebne.

- [ ] **Step 3: Włącz tryb strict i sprawdź alias**

W `tsconfig.json` upewnij się, że `compilerOptions` zawiera:

```json
{
  "target": "ES2022",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "paths": { "@/*": ["./src/*"] }
}
```

**`target` trzeba podniesc z `ES2017`, ktory ustawia `create-next-app`.** Klucze
glowne w schemacie to `BigInt`, a literaly `1n` wymagaja `ES2020` lub wyzej —
inaczej build przewraca sie na `TS2737`. Vitest tego nie wylapie, bo transpiluje
wlasnym torem; blad wychodzi dopiero w `tsc` podczas `next build`.

Jesli po zmianie `target` build **nadal** zglasza `TS2737`, to nieaktualny cache
przyrostowy: `rm -f .next/cache/.tsbuildinfo` i buduj ponownie. `npx tsc --noEmit`
przechodzacy przy jednoczesnie walacym sie `next build` jest sygnatura tego wlasnie
problemu.

`noUncheckedIndexedAccess` dokładamy świadomie: kod operuje na tablicach indeksowanych numerem rejonu (`PALETA_REJONOW[rejon - 1]`) i bez tej flagi TypeScript nie przypomni o zakresie.

- [ ] **Step 4: Skonfiguruj Vitest**

`vitest.config.mts` — **rozszerzenie `.mts`, nie `.ts`**: Vite laduje `.ts` jako
CommonJS i ostrzega przy kazdym uruchomieniu, ze plik uzywa skladni ESM.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves the "@/*" alias from tsconfig natively.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests need a running database; they are opt-in via the
    // `int` suffix so `npm test` stays fast and offline.
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
  },
});
```

Dopisz do `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:int": "vitest run --config vitest.int.config.mts"
}
```

- [ ] **Step 5: Napisz test dymny**

`src/lib/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs typescript tests', () => {
    const value: string = 'kartoteka';
    expect(value).toHaveLength(9);
  });
});
```

- [ ] **Step 6: Uruchom testy — muszą przejść**

Run: `npm test`
Expected: PASS, 1 test

- [ ] **Step 7: Sprawdź build**

Run: `npm run build`
Expected: kompilacja bez błędów

- [ ] **Step 8: Uzupełnij `.gitignore`**

`create-next-app` generuje juz `.env*`, ktore **polyka rowniez `.env.example`** —
a ten musi byc w repozytorium. Dopisz na koncu:

```
# the template must stay tracked; .env* above would swallow it
!.env.example

# Prisma client is generated on postinstall
/src/generated

# Playwright
/test-results
/playwright-report
```

- [ ] **Step 9: Wyklucz handoff z lintowania**

Bez tego `npm run lint` lintuje `docs/handoff/support.js` — 69 KB runtime'u prototypu —
i zglasza 2 bledy oraz 8 ostrzezen w kodzie, ktorego nie piszemy i nie budujemy.

W `eslint.config.mjs`, wewnatrz `globalIgnores([...])`, dopisz:

```js
    // The design handoff ships a throwaway HTML prototype and its runtime.
    // It is reference material, not source, and must never be linted or built.
    "docs/**",
    // Prisma emits TypeScript sources; they are generated, not authored.
    "src/generated/**",
```

Dopisz tez konwencje podkreslnika jako osobny wpis konfiguracji — bez niej
`mozeEksportowac(_u)` z Zadania 8 wywola ostrzezenie:

```js
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
```

Run: `npm run lint`
Expected: brak wyjscia (zero problemow)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript and Vitest"
```

---

### Task 2: Tokeny projektu i fonty

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Test: `src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: custom properties `--navy-900`, `--navy-700`, `--gold-500`, `--rejon-1`…`--rejon-12`, `--font-ui`, `--font-naglowek`, `--font-mono` i pozostałe tokeny z sekcji „Design Tokens" README

- [ ] **Step 1: Napisz test sprawdzający komplet tokenów**

Test czyta plik CSS jako tekst i weryfikuje obecność tokenów. Chroni przed cichym usunięciem tokena podczas refaktoru.

`src/styles/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('design tokens', () => {
  it('defines every colour token from the handoff', () => {
    const wymagane = [
      '--navy-900', '--navy-700', '--blue-500', '--gold-500',
      '--bg-app', '--bg-panel', '--bg-row', '--bg-row-alt', '--surface',
      '--border', '--border-input', '--divider',
      '--text', '--text-body', '--text-muted', '--text-faint', '--placeholder',
      '--success-bg', '--success-fg', '--warn-bg', '--warn-fg',
      '--danger-bg', '--danger-fg', '--purple-bg', '--purple-fg',
    ];
    for (const token of wymagane) {
      expect(css, `missing ${token}`).toContain(`${token}:`);
    }
  });

  it('defines all twelve region colours', () => {
    for (let i = 1; i <= 12; i++) {
      expect(css, `missing --rejon-${i}`).toContain(`--rejon-${i}:`);
    }
  });

});

// The three --font-* custom properties are produced by next/font and injected
// through a class on <html>; defining them in tokens.css would override the
// generated families. The wiring is therefore asserted on the layout instead.
describe('font wiring', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('declares all three families with their token names', () => {
    for (const [rodzina, token] of [
      ['Source_Sans_3', '--font-ui'],
      ['Source_Serif_4', '--font-naglowek'],
      ['IBM_Plex_Mono', '--font-mono'],
    ]) {
      expect(layout, `missing ${rodzina}`).toContain(rodzina);
      expect(layout, `missing ${token}`).toContain(token);
    }
  });

  it('requests the latin-ext subset so Polish glyphs are covered', () => {
    const wystapienia = layout.match(/latin-ext/g) ?? [];
    expect(wystapienia).toHaveLength(3);
  });

  it('self-hosts rather than linking Google stylesheets', () => {
    // Looks for a real remote reference, not a mention: the file explains in a
    // comment why it does not contact fonts.gstatic.com.
    expect(layout).not.toMatch(/href=["'{`]?\s*(?:https?:)?\/\/fonts\.(googleapis|gstatic)\.com/);
    expect(layout).not.toContain('<link');
  });
});
```

**Uwaga:** tokenow `--font-ui`, `--font-naglowek` i `--font-mono` **nie umieszczamy**
w `tokens.css`. Generuje je `next/font` i wstrzykuje przez `className` na `<html>` —
zdefiniowanie ich w arkuszu nadpisaloby wygenerowane rodziny.

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- tokens`
Expected: FAIL — `ENOENT: no such file or directory … tokens.css`

- [ ] **Step 3: Napisz tokeny**

`src/styles/tokens.css` — wartości przepisane z sekcji „Design Tokens" `docs/handoff/README.md`:

```css
:root {
  /* Kolory */
  --navy-900: #0d2439;
  --navy-700: #10365c;
  --blue-500: #1c5f96;
  --gold-500: #e2b04a;

  --bg-app: #eef1f5;
  --bg-panel: #f7f9fb;
  --bg-row: #f4f7fa;
  --bg-row-alt: #f9fbfc;
  --surface: #ffffff;

  --border: #dfe5ec;
  --border-input: #d5dde6;
  --divider: #f0f3f7;

  --text: #101c2b;
  --text-body: #3c4b5c;
  --text-muted: #6c7d8f;
  --text-faint: #8b99a8;
  --placeholder: #9aa6b4;

  --success-bg: #e9f4ec;
  --success-fg: #2c6b41;
  --warn-bg: #fdf6e6;
  --warn-fg: #8a6a1c;
  --danger-bg: #fdf1f1;
  --danger-fg: #9c3a3a;
  --purple-bg: #f0ecf7;
  --purple-fg: #57407a;

  /* Paleta 12 rejonów — jednolita jasność, różne odcienie.
     Używana na tłach z alfą 1a/18; proporcji alfy nie zmieniać
     bez ponownego pomiaru kontrastu (AA dla 12 px). */
  --rejon-1: #1c5f96;
  --rejon-2: #2f7d6a;
  --rejon-3: #7a6ca8;
  --rejon-4: #b07d2b;
  --rejon-5: #a3524f;
  --rejon-6: #3f7d3a;
  --rejon-7: #4f6fbd;
  --rejon-8: #96603f;
  --rejon-9: #2b7f8f;
  --rejon-10: #8a5b8f;
  --rejon-11: #6b7d2f;
  --rejon-12: #b05c7d;

  /* Promienie */
  --r-4: 4px;   --r-5: 5px;   --r-7: 7px;   --r-8: 8px;
  --r-9: 9px;   --r-10: 10px; --r-11: 11px; --r-12: 12px; --r-20: 20px;

  /* Cienie */
  --cien-tabela: 0 1px 2px rgba(16, 54, 92, .04);
  --cien-kafelek: 0 4px 14px rgba(16, 54, 92, .08);
  --cien-karta: 0 4px 14px rgba(16, 54, 92, .1);
  --cien-drawer: -18px 0 50px rgba(13, 36, 57, .2);
  --cien-toast: 0 8px 24px rgba(13, 36, 57, .28);

  /* Animacje */
  --czas-drawer: 220ms;
  --czas-overlay: 150ms;
  --czas-hover: 150ms;

  /* Punkty załamania — do dokumentacji; media queries wymagają literałów */
  --bp-mobile: 860px;
  --bp-waski: 1120px;
}

@keyframes slidein {
  from { transform: translateX(30px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

@keyframes fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

- [ ] **Step 4: Podłącz fonty w root layoucie**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { IBM_Plex_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import '@/styles/tokens.css';
import './globals.css';

// Self-hosted at build time: the browser never contacts fonts.gstatic.com,
// so member IP addresses are not disclosed to Google. This is a GDPR
// requirement for the data this app holds, not a performance tweak.
const sourceSans = Source_Sans_3({
  subsets: ['latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ui',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin-ext'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-naglowek',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Kartoteka DK',
  description: 'Kartoteka Domowego Kościoła — archidiecezja gdańska',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${sourceSans.variable} ${sourceSerif.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Napisz style globalne**

`src/app/globals.css`:

```css
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg-app);
  color: var(--text);
  font-family: var(--font-ui), system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--font-naglowek), Georgia, serif;
  font-weight: 400;
  margin: 0;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}
```

`:focus-visible` z obrysem jest świadomym uzupełnieniem prototypu — sam `border-color` przy nawigacji klawiaturą jest niewystarczająco widoczny (sekcja „Dostępność" handoffu).

- [ ] **Step 6: Uruchom test — musi przejść**

Run: `npm test -- tokens`
Expected: PASS, 3 testy

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add design tokens and self-hosted fonts"
```

---

### Task 3: Postgres w Dockerze i klient Prismy

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `prisma.config.ts`, `prisma/schema.prisma`, `src/lib/db.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1
- Produces: `prisma` — singleton `PrismaClient` eksportowany z `@/lib/db`; działające `npx prisma migrate dev`

- [ ] **Step 1: Napisz `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: kartoteka-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: kartoteka
      POSTGRES_PASSWORD: kartoteka_dev
      POSTGRES_DB: kartoteka
      # ICU collation for Polish sorting; see prisma/migrations
      LANG: pl_PL.utf8
    ports:
      # Host 5432 is taken by another project's Postgres on this machine,
      # so the container port is published on 5433 instead.
      - '5433:5432'
    volumes:
      - kartoteka-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U kartoteka -d kartoteka']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  kartoteka-db-data:
```

- [ ] **Step 2: Napisz `.env.example` i utwórz `.env`**

`.env.example`:

```
DATABASE_URL="postgresql://kartoteka:kartoteka_dev@localhost:5433/kartoteka?schema=public"
SESSION_SECRET="wygeneruj: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
APP_URL="http://localhost:3000"
```

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Wklej wynik jako `SESSION_SECRET` w `.env`.

- [ ] **Step 3: Podnieś bazę i sprawdź, że odpowiada**

```bash
docker compose up -d
docker compose exec db pg_isready -U kartoteka -d kartoteka
```

Expected: `accepting connections`

- [ ] **Step 4: Zainstaluj Prismę i utwórz konfigurację**

```bash
npm i -D prisma@7 dotenv tsx
npm i @prisma/client@7 @prisma/adapter-pg@7
```

**Prisma 7 wymaga sterownika (driver adapter).** To najwieksza zmiana wzgledem
wersji 6: `new PrismaClient()` bez argumentu nie kompiluje sie (`TS2554`).
URL w `prisma.config.ts` obsluguje wylacznie CLI — migracje i `generate`.
Klient w runtime dostaje polaczenie osobno, przez `PrismaPg`.

`prisma.config.ts` — **w Prismie 7 URL bazy mieszka tutaj, nie w bloku `datasource`**:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
```

`prisma/schema.prisma` — na razie sam nagłówek. **Generator to `prisma-client`, nie `prisma-client-js`, a `output` jest obowiązkowy:**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 5: Dopisz skrypty do `package.json`**

```json
"scripts": {
  "postinstall": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:seed": "tsx prisma/seed.ts",
  "db:reset": "prisma migrate reset --force"
}
```

```bash
npm i -D tsx
```

`postinstall` jest konieczny, bo klient Prismy 7 nie jest commitowany (jest w `.gitignore` z Task 1), a build Next.js go potrzebuje.

- [ ] **Step 6: Napisz singleton klienta**

`src/lib/db.ts`:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// Prisma 7 makes driver adapters mandatory. The datasource URL in
// prisma.config.ts serves the CLI (migrations, generate); the runtime client
// needs its own connection, passed here.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Brak zmiennej DATABASE_URL — skopiuj .env.example do .env');
}

// Next.js hot-reloads modules in development, which would otherwise open a
// new connection pool on every edit until Postgres refuses them.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 7: Wygeneruj klienta i sprawdź, że kompiluje**

```bash
npx prisma generate
npm run build
```

Expected: `Generated Prisma Client (7.9.x) to ./src/generated/prisma`, build bez bledow

**`npm audit` zglosi tu 3 podatnosci "high" — nie naprawiaj ich.** Chodzi o
`deepmerge-ts` (wyczerpanie stosu przy scalaniu rekurencyjnych grafow obiektow),
ktory wchodzi wylacznie sciezka `prisma` -> `@prisma/config` -> `deepmerge-ts`.
`prisma` to devDependency (CLI), a `@prisma/client` — jedyna czesc trafiajaca do
produkcji — tej zaleznosci nie ma. Zweryfikuj sam: `npm ls deepmerge-ts --all`.

`npm audit fix --force` cofnalby projekt do `prisma@6.12.0`, co lamie cala
konfiguracje Prismy 7 z Kroku 4. Wektorem jest plik konfiguracyjny, ktory piszemy
sami — nie dane od uzytkownika.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Postgres compose setup and Prisma client"
```

---

### Task 4: Schemat — słowniki, pary, rekolekcje

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_slowniki_i_pary/migration.sql` (generowana), `src/lib/db.int.test.ts`, `vitest.int.config.ts`

**Interfaces:**
- Consumes: `prisma` z Task 3
- Produces: modele `Rejon`, `Parafia`, `Krag`, `Para`, `Rekolekcje`; enum `RodzajRekolekcji`

- [ ] **Step 1: Dopisz modele do `prisma/schema.prisma`**

```prisma
enum RodzajRekolekcji {
  ONZ_I
  ONZ_II
  ONZ_III
  ORAR_I
  ORAR_II
  PILOTOWANIE
  ORD
  INNE
}

model Rejon {
  id         Int    @id @db.SmallInt
  numerRzym  String @map("numer_rzym")

  kregi  Krag[]
  pary   Para[]
  konta  Konto[]

  @@map("rejon")
}

model Parafia {
  id     BigInt @id @default(autoincrement())
  nazwa  String
  miasto String

  kregi Krag[]
  pary  Para[]

  @@unique([nazwa, miasto])
  @@map("parafia")
}

model Krag {
  id        BigInt  @id @default(autoincrement())
  rejonId   Int     @map("rejon_id") @db.SmallInt
  numer     Int     @db.SmallInt
  patron    String?
  parafiaId BigInt  @map("parafia_id")

  rejon   Rejon   @relation(fields: [rejonId], references: [id])
  parafia Parafia @relation(fields: [parafiaId], references: [id])
  pary    Para[]

  @@unique([rejonId, numer])
  @@map("krag")
}

model Para {
  id         BigInt    @id @default(autoincrement())
  imieZony   String    @map("imie_zony")
  imieMeza   String    @map("imie_meza")
  nazwisko   String
  email      String?
  telefon    String?
  rejonId    Int       @map("rejon_id") @db.SmallInt
  kragId     BigInt?   @map("krag_id")
  // Only set when the couple belongs to a parish other than its circle's.
  // Effective parish is COALESCE(para.parafia_id, krag.parafia_id) — see spec 4.2.
  parafiaId  BigInt?   @map("parafia_id")
  dzieci     String?
  notatki    String?
  utworzono  DateTime  @default(now()) @db.Timestamptz(6)
  zmieniono  DateTime  @default(now()) @updatedAt @db.Timestamptz(6)
  usunieteAt DateTime? @map("usuniete_at") @db.Timestamptz(6)

  rejon      Rejon        @relation(fields: [rejonId], references: [id])
  krag       Krag?        @relation(fields: [kragId], references: [id])
  parafia    Parafia?     @relation(fields: [parafiaId], references: [id])
  rekolekcje Rekolekcje[]

  @@index([rejonId])
  @@index([nazwisko])
  @@map("para")
}

model Rekolekcje {
  id      BigInt           @id @default(autoincrement())
  paraId  BigInt           @map("para_id")
  rodzaj  RodzajRekolekcji
  rok     Int              @db.SmallInt
  miejsce String?
  nazwa   String?

  para Para @relation(fields: [paraId], references: [id], onDelete: Cascade)

  @@index([paraId])
  @@index([rodzaj])
  @@map("rekolekcje")
}
```

- [ ] **Step 2: Wygeneruj migrację**

```bash
npx prisma migrate dev --name slowniki_i_pary
```

- [ ] **Step 3: Dopisz do migracji to, czego Prisma nie wyraża**

Otwórz wygenerowany `prisma/migrations/*_slowniki_i_pary/migration.sql` i **dopisz na końcu**:

```sql
-- Diacritic-insensitive search: "Baginscy" must find "Bagińscy".
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Polish collation so ORDER BY nazwisko matches localeCompare(…, 'pl').
-- Without it Postgres sorts Ł after Z while the UI sorts it after L.
ALTER TABLE "para" ALTER COLUMN "nazwisko" TYPE text COLLATE "pl-PL-x-icu";

-- Range guards Prisma cannot express.
ALTER TABLE "rejon" ADD CONSTRAINT rejon_id_zakres CHECK (id BETWEEN 1 AND 12);
ALTER TABLE "rekolekcje" ADD CONSTRAINT rekolekcje_rok_zakres CHECK (rok BETWEEN 1970 AND 2100);
ALTER TABLE "rekolekcje" ADD CONSTRAINT rekolekcje_inne_ma_nazwe
  CHECK (rodzaj <> 'INNE' OR nazwa IS NOT NULL);

-- Most queries filter out soft-deleted rows; index only what they read.
DROP INDEX IF EXISTS "para_rejon_id_idx";
CREATE INDEX "para_rejon_id_idx" ON "para" ("rejon_id") WHERE "usuniete_at" IS NULL;
```

Zastosuj — **i przegeneruj klienta jawnie**:

```bash
npx prisma migrate reset --force
npx prisma generate
```

**Dwie pulapki tej komendy.**

Po pierwsze, `migrate dev` i `migrate reset` **nie odswiezaja wygenerowanego klienta**
w Prismie 7 — `src/generated/prisma/models/` zostaje pusty, a testy wywalaja sie na
`Cannot read properties of undefined (reading 'upsert')`. `prisma generate` po kazdej
zmianie schematu, bez wyjatkow.

Po drugie, Prisma 7 **blokuje `migrate reset` uruchamiany przez agenta AI** i zada
wyraznej zgody uzytkownika. Komenda kasuje baze nieodwracalnie i nie wolno jej
uruchamiac na produkcji. Po uzyskaniu zgody przekaz ja w zmiennej
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

- [ ] **Step 4: Skonfiguruj testy integracyjne**

`vitest.int.config.mts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts', 'prisma/**/*.int.test.ts'],
    // Integration tests share one database; parallel files would race.
    fileParallelism: false,
    setupFiles: ['dotenv/config'],
  },
});
```

- [ ] **Step 5: Napisz test integracyjny schematu**

`src/lib/db.int.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('schema', () => {
  it('enforces the region id range', async () => {
    await expect(
      prisma.rejon.create({ data: { id: 13, numerRzym: 'XIII' } }),
    ).rejects.toThrow();
  });

  it('requires a name for INNE retreat entries', async () => {
    const rejon = await prisma.rejon.upsert({
      where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' },
    });
    const para = await prisma.para.create({
      data: { imieZony: 'Anna', imieMeza: 'Piotr', nazwisko: 'Testowi', rejonId: rejon.id },
    });
    await expect(
      prisma.rekolekcje.create({
        data: { paraId: para.id, rodzaj: 'INNE', rok: 2020 },
      }),
    ).rejects.toThrow();
    await prisma.para.delete({ where: { id: para.id } });
  });

  it('sorts surnames using Polish collation', async () => {
    const rejon = await prisma.rejon.upsert({
      where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' },
    });
    const nazwiska = ['Zawadzcy', 'Łabędzcy', 'Mazurowie'];
    for (const nazwisko of nazwiska) {
      await prisma.para.create({
        data: { imieZony: 'A', imieMeza: 'B', nazwisko, rejonId: rejon.id },
      });
    }
    const posortowane = await prisma.para.findMany({
      where: { nazwisko: { in: nazwiska } },
      orderBy: { nazwisko: 'asc' },
      select: { nazwisko: true },
    });
    // Ł belongs between L and M, not after Z.
    expect(posortowane.map((p) => p.nazwisko)).toEqual([
      'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
    await prisma.para.deleteMany({ where: { nazwisko: { in: nazwiska } } });
  });
});
```

- [ ] **Step 6: Uruchom testy integracyjne**

Run: `npm run test:int`
Expected: PASS, 3 testy

Jeśli test kolacji zawiedzie — obraz Postgresa nie ma wsparcia ICU. Sprawdź: `docker compose exec db psql -U kartoteka -d kartoteka -c "SELECT collname FROM pg_collation WHERE collname = 'pl-PL-x-icu';"`. Pusty wynik oznacza, że trzeba użyć obrazu `postgres:16` zamiast `16-alpine`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add dictionary, couple and retreat schema"
```

---

### Task 5: Schemat — konta, sesje, audyt, limity

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_konta_i_audyt/migration.sql` (generowana)

**Interfaces:**
- Consumes: Task 4
- Produces: modele `Konto`, `Sesja`, `Audyt`, `ProbaLogowania`; enumy `Rola`, `StatusKonta`, `RodzajAudytu`

- [ ] **Step 1: Dopisz modele**

```prisma
enum Rola {
  admin
  rejon
  podglad
}

enum StatusKonta {
  aktywne
  wylaczone
  oczekuje
}

enum RodzajAudytu {
  edycja
  dodanie
  usuniecie
  eksport
  konto
}

model Konto {
  id                   BigInt      @id @default(autoincrement())
  email                String      @unique
  hashHasla            String?     @map("hash_hasla")
  nazwa                String
  rola                 Rola
  rejonId              Int?        @map("rejon_id") @db.SmallInt
  status               StatusKonta @default(oczekuje)
  ostatnieLogowanie    DateTime?   @map("ostatnie_logowanie") @db.Timestamptz(6)
  zaproszenieTokenHash String?     @map("zaproszenie_token_hash")
  zaproszenieWygasa    DateTime?   @map("zaproszenie_wygasa") @db.Timestamptz(6)

  rejon  Rejon?  @relation(fields: [rejonId], references: [id])
  sesje  Sesja[]
  audyt  Audyt[]

  @@map("konto")
}

model Sesja {
  id                BigInt   @id @default(autoincrement())
  kontoId           BigInt   @map("konto_id")
  // SHA-256 of the token. The raw token exists only in the user's cookie,
  // so a database dump does not hand over live sessions.
  tokenHash         String   @unique @map("token_hash")
  utworzono         DateTime @default(now()) @db.Timestamptz(6)
  wygasa            DateTime @db.Timestamptz(6)
  ostatniaAktywnosc DateTime @default(now()) @map("ostatnia_aktywnosc") @db.Timestamptz(6)

  konto Konto @relation(fields: [kontoId], references: [id], onDelete: Cascade)

  @@index([kontoId])
  @@map("sesja")
}

model Audyt {
  id      BigInt       @id @default(autoincrement())
  kiedy   DateTime     @default(now()) @db.Timestamptz(6)
  rodzaj  RodzajAudytu
  opis    String
  kontoId BigInt?      @map("konto_id")
  // Deliberately not a foreign key: the record may already be gone.
  paraId  BigInt?      @map("para_id")

  konto Konto? @relation(fields: [kontoId], references: [id])

  @@index([kiedy])
  @@map("audyt")
}

model ProbaLogowania {
  id    BigInt   @id @default(autoincrement())
  klucz String
  kiedy DateTime @default(now()) @db.Timestamptz(6)

  @@index([klucz, kiedy])
  @@map("proba_logowania")
}
```

Pamietaj o relacji zwrotnej w modelu `Rejon` — bez niej schemat sie nie zwaliduje:

```prisma
model Rejon {
  // …
  konta Konto[]
}
```

- [ ] **Step 2: Wygeneruj migracje BEZ zastosowania**

```bash
npx prisma migrate dev --create-only --name konta_i_audyt
```

`--create-only` tworzy plik migracji i zatrzymuje sie. Dzieki temu dopiszemy wlasny SQL
**zanim** cokolwiek trafi do bazy — i unikniemy `migrate reset`, ktory kasuje dane
i wymaga osobnej zgody uzytkownika. **To jest wlasciwy wzorzec dla kazdej migracji
z recznie dopisanym SQL-em**, rowniez tej z Zadania 4.

- [ ] **Step 3: Dopisz ograniczenie spojnosci roli i zastosuj**

Na koncu wygenerowanego `migration.sql`:

```sql
-- A region account must name its region; admin and viewer must not.
ALTER TABLE "konto" ADD CONSTRAINT konto_rejon_zgodny_z_rola
  CHECK ((rola = 'rejon') = (rejon_id IS NOT NULL));
```

```bash
npx prisma migrate dev
npx prisma generate
```

- [ ] **Step 4: Napisz test ograniczenia**

Dopisz do `src/lib/db.int.test.ts`:

```ts
describe('account constraints', () => {
  it('rejects an admin account bound to a region', async () => {
    await prisma.rejon.upsert({ where: { id: 1 }, update: {}, create: { id: 1, numerRzym: 'I' } });
    await expect(
      prisma.konto.create({
        data: { email: 'zly@example.pl', nazwa: 'Zły Admin', rola: 'admin', rejonId: 1 },
      }),
    ).rejects.toThrow();
  });

  it('rejects a region account without a region', async () => {
    await expect(
      prisma.konto.create({
        data: { email: 'zly2@example.pl', nazwa: 'Zła Para', rola: 'rejon' },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Uruchom testy**

Run: `npm run test:int`
Expected: PASS, 5 testów

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add account, session and audit schema"
```

---

### Task 6: Moduł języka polskiego

**Files:**
- Create: `src/lib/pl/odmiana.ts`, `src/lib/pl/sortowanie.ts`, `src/lib/pl/formaty.ts`, `src/lib/pl/index.ts`
- Test: `src/lib/pl/odmiana.test.ts`, `src/lib/pl/sortowanie.test.ts`, `src/lib/pl/formaty.test.ts`

**Interfaces:**
- Consumes: nic (moduł czysty, bez zależności)
- Produces:
  - `odmiana(n: number, formy: FormyOdmiany): string`
  - `FormyOdmiany = readonly [string, string, string]`
  - stałe `PARY`, `KREGI`, `PARAFIE`, `WPISY`, `REKORDY`
  - `porownajPl(a: string, b: string): number`
  - `formatDaty(d: Date): string`, `formatTelefonu(t: string): string`

- [ ] **Step 1: Napisz test odmiany liczebników**

`src/lib/pl/odmiana.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KREGI, PARAFIE, PARY, odmiana } from './odmiana';

describe('odmiana', () => {
  it('uses the singular form for exactly one', () => {
    expect(odmiana(1, PARY)).toBe('1 para');
  });

  it('uses the plural form for 2-4', () => {
    expect(odmiana(2, PARY)).toBe('2 pary');
    expect(odmiana(3, PARY)).toBe('3 pary');
    expect(odmiana(4, PARY)).toBe('4 pary');
  });

  it('uses the genitive form for 0 and 5-21', () => {
    expect(odmiana(0, PARY)).toBe('0 par');
    expect(odmiana(5, PARY)).toBe('5 par');
    expect(odmiana(11, PARY)).toBe('11 par');
    expect(odmiana(21, PARY)).toBe('21 par');
  });

  it('keeps the genitive form for the 12-14 exception', () => {
    expect(odmiana(12, PARY)).toBe('12 par');
    expect(odmiana(13, PARY)).toBe('13 par');
    expect(odmiana(14, PARY)).toBe('14 par');
    expect(odmiana(112, PARY)).toBe('112 par');
  });

  it('returns to the plural form above the exception', () => {
    expect(odmiana(22, PARY)).toBe('22 pary');
    expect(odmiana(102, PARY)).toBe('102 pary');
  });

  it('inflects circles and parishes', () => {
    expect(odmiana(1, KREGI)).toBe('1 krąg');
    expect(odmiana(2, KREGI)).toBe('2 kręgi');
    expect(odmiana(5, KREGI)).toBe('5 kręgów');
    expect(odmiana(1, PARAFIE)).toBe('1 parafia');
    expect(odmiana(4, PARAFIE)).toBe('4 parafie');
    expect(odmiana(6, PARAFIE)).toBe('6 parafii');
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- odmiana`
Expected: FAIL — `Failed to resolve import './odmiana'`

- [ ] **Step 3: Zaimplementuj odmianę**

`src/lib/pl/odmiana.ts`:

```ts
export type FormyOdmiany = readonly [string, string, string];

/**
 * Polish numeral inflection. Picks one of three forms:
 *
 *   1                 → singular         "1 para"
 *   2-4               → plural           "3 pary"
 *   0, 5+, and 12-14  → genitive plural  "5 par", "13 par"
 *
 * The 12-14 carve-out is why the last two digits must be checked and not
 * only the last one: 22 takes the plural form but 12 does not.
 */
export function odmiana(n: number, formy: FormyOdmiany): string {
  const [pojedyncza, mnoga, dopelniacz] = formy;
  const abs = Math.abs(n);

  if (abs === 1) return `${n} ${pojedyncza}`;

  const jednosci = abs % 10;
  const dziesiatki = abs % 100;
  const wyjatek = dziesiatki >= 12 && dziesiatki <= 14;

  if (jednosci >= 2 && jednosci <= 4 && !wyjatek) return `${n} ${mnoga}`;
  return `${n} ${dopelniacz}`;
}

export const PARY: FormyOdmiany = ['para', 'pary', 'par'];
export const KREGI: FormyOdmiany = ['krąg', 'kręgi', 'kręgów'];
export const PARAFIE: FormyOdmiany = ['parafia', 'parafie', 'parafii'];
export const WPISY: FormyOdmiany = ['wpis', 'wpisy', 'wpisów'];
export const REKORDY: FormyOdmiany = ['rekord', 'rekordy', 'rekordów'];
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- odmiana`
Expected: PASS, 6 testów

- [ ] **Step 5: Napisz test sortowania**

`src/lib/pl/sortowanie.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { porownajPl } from './sortowanie';

describe('porownajPl', () => {
  it('places Ł between L and M, not after Z', () => {
    const nazwiska = ['Zawadzcy', 'Łabędzcy', 'Mazurowie', 'Lisowscy'];
    expect([...nazwiska].sort(porownajPl)).toEqual([
      'Lisowscy', 'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
  });

  it('orders embedded numbers numerically, not as text', () => {
    const kregi = ['Krąg 10', 'Krąg 2', 'Krąg 1'];
    expect([...kregi].sort(porownajPl)).toEqual(['Krąg 1', 'Krąg 2', 'Krąg 10']);
  });

  it('ignores case', () => {
    expect(porownajPl('kowalscy', 'Kowalscy')).toBe(0);
  });
});
```

- [ ] **Step 6: Uruchom test — musi się wywalić**

Run: `npm test -- sortowanie`
Expected: FAIL — brak modułu

- [ ] **Step 7: Zaimplementuj sortowanie**

`src/lib/pl/sortowanie.ts`:

```ts
// Mirrors the "pl-PL-x-icu" collation applied to para.nazwisko, so
// server-side ORDER BY and any client-side sort agree.
const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });

export function porownajPl(a: string, b: string): number {
  return collator.compare(a, b);
}
```

- [ ] **Step 8: Uruchom test — musi przejść**

Run: `npm test -- sortowanie`
Expected: PASS, 3 testy

- [ ] **Step 9: Napisz test formatów**

`src/lib/pl/formaty.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDaty, formatTelefonu } from './formaty';

describe('formatDaty', () => {
  it('formats as dd.MM.yyyy HH:mm', () => {
    expect(formatDaty(new Date('2026-08-13T21:12:00'))).toBe('13.08.2026 21:12');
  });

  it('pads single-digit days and months', () => {
    expect(formatDaty(new Date('2026-01-05T09:07:00'))).toBe('05.01.2026 09:07');
  });
});

describe('formatTelefonu', () => {
  it('groups nine digits after the country code', () => {
    expect(formatTelefonu('+48746854282')).toBe('+48 746 854 282');
  });

  it('adds the country code when missing', () => {
    expect(formatTelefonu('746854282')).toBe('+48 746 854 282');
  });

  it('leaves unrecognised input untouched', () => {
    expect(formatTelefonu('wew. 12')).toBe('wew. 12');
  });
});
```

- [ ] **Step 10: Uruchom test — musi się wywalić**

Run: `npm test -- formaty`
Expected: FAIL — brak modułu

- [ ] **Step 11: Zaimplementuj formaty**

`src/lib/pl/formaty.ts`:

```ts
export function formatDaty(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Normalises Polish phone numbers to "+48 XXX XXX XXX". Anything that is not
 * nine digits (optionally prefixed with 48) is returned unchanged — the field
 * is free text and users occasionally record extensions or notes.
 */
export function formatTelefonu(t: string): string {
  const cyfry = t.replace(/[\s-]/g, '').replace(/^\+/, '');
  const krajowy = cyfry.startsWith('48') ? cyfry.slice(2) : cyfry;
  if (!/^\d{9}$/.test(krajowy)) return t;
  return `+48 ${krajowy.slice(0, 3)} ${krajowy.slice(3, 6)} ${krajowy.slice(6)}`;
}
```

- [ ] **Step 12: Napisz barrel i uruchom cały zestaw**

`src/lib/pl/index.ts`:

```ts
export * from './odmiana';
export * from './sortowanie';
export * from './formaty';
```

Run: `npm test`
Expected: PASS — wszystkie testy

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add Polish inflection, collation and formatting helpers"
```

---

### Task 7: Stałe domenowe — rekolekcje i rejony

**Files:**
- Create: `src/lib/domena/rekolekcje.ts`, `src/lib/domena/rejony.ts`
- Test: `src/lib/domena/rekolekcje.test.ts`, `src/lib/domena/rejony.test.ts`

**Interfaces:**
- Consumes: typ `RodzajRekolekcji` z `@/generated/prisma/enums`
- Produces:
  - `RODZAJE_REKOLEKCJI: readonly RodzajOpis[]` gdzie `RodzajOpis = { rodzaj: RodzajRekolekcji; kod: string; nazwa: string }`
  - `STOPNIE: readonly RodzajRekolekcji[]` — 7 stopni bez `INNE`, w kolejności ścieżki formacji
  - `opisRodzaju(r: RodzajRekolekcji): RodzajOpis`
  - `najwyzszyStopien(rodzaje: RodzajRekolekcji[]): RodzajRekolekcji | null`
  - `nastepnyStopien(posiadane: RodzajRekolekcji[]): RodzajRekolekcji`
  - `numerRzymski(rejon: number): string`, `ROMAN: readonly string[]`
  - `kolorRejonu(rejon: number): string`

- [ ] **Step 1: Napisz test rodzajów rekolekcji**

`src/lib/domena/rekolekcje.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RODZAJE_REKOLEKCJI, STOPNIE, najwyzszyStopien, nastepnyStopien, opisRodzaju,
} from './rekolekcje';

describe('RODZAJE_REKOLEKCJI', () => {
  it('lists all eight kinds in formation-path order', () => {
    expect(RODZAJE_REKOLEKCJI.map((r) => r.rodzaj)).toEqual([
      'ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II', 'PILOTOWANIE', 'ORD', 'INNE',
    ]);
  });

  it('excludes INNE from the degree list', () => {
    expect(STOPNIE).toHaveLength(7);
    expect(STOPNIE).not.toContain('INNE');
  });

  it('maps an enum value to its UI code and full name', () => {
    expect(opisRodzaju('ORAR_II')).toEqual({
      rodzaj: 'ORAR_II',
      kod: 'ORAR II',
      nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia',
    });
  });
});

describe('najwyzszyStopien', () => {
  it('returns the furthest degree along the formation path', () => {
    expect(najwyzszyStopien(['ONZ_I', 'ORAR_I', 'ONZ_II'])).toBe('ORAR_I');
  });

  it('ignores INNE, which is not a degree', () => {
    expect(najwyzszyStopien(['ONZ_I', 'INNE'])).toBe('ONZ_I');
  });

  it('returns null when there is no degree at all', () => {
    expect(najwyzszyStopien([])).toBeNull();
    expect(najwyzszyStopien(['INNE'])).toBeNull();
  });
});

describe('nastepnyStopien', () => {
  it('suggests the first degree the couple is missing', () => {
    expect(nastepnyStopien([])).toBe('ONZ_I');
    expect(nastepnyStopien(['ONZ_I'])).toBe('ONZ_II');
    // Gaps are legitimate: suggest the earliest missing one, not the next one up.
    expect(nastepnyStopien(['ONZ_I', 'ONZ_III'])).toBe('ONZ_II');
  });

  it('falls back to INNE once every degree is present', () => {
    expect(nastepnyStopien([...STOPNIE])).toBe('INNE');
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- rekolekcje`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj rodzaje rekolekcji**

`src/lib/domena/rekolekcje.ts`:

```ts
import type { RodzajRekolekcji } from '@/generated/prisma/enums';

export type RodzajOpis = {
  rodzaj: RodzajRekolekcji;
  kod: string;
  nazwa: string;
};

/**
 * Order is meaningful — it is the formation path, and both the "highest
 * degree" badge and the "next degree" suggestion depend on it.
 */
export const RODZAJE_REKOLEKCJI: readonly RodzajOpis[] = [
  { rodzaj: 'ONZ_I', kod: 'ONŻ I', nazwa: 'Oaza Nowego Życia I stopnia' },
  { rodzaj: 'ONZ_II', kod: 'ONŻ II', nazwa: 'Oaza Nowego Życia II stopnia' },
  { rodzaj: 'ONZ_III', kod: 'ONŻ III', nazwa: 'Oaza Nowego Życia III stopnia' },
  { rodzaj: 'ORAR_I', kod: 'ORAR I', nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin I stopnia' },
  { rodzaj: 'ORAR_II', kod: 'ORAR II', nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia' },
  { rodzaj: 'PILOTOWANIE', kod: 'Pilotowanie', nazwa: 'Sesja o pilotowaniu kręgów' },
  { rodzaj: 'ORD', kod: 'ORD', nazwa: 'Oaza Rekolekcyjna Diakonii' },
  { rodzaj: 'INNE', kod: 'Inne', nazwa: 'Inne rekolekcje' },
] as const;

export const STOPNIE: readonly RodzajRekolekcji[] = RODZAJE_REKOLEKCJI.filter(
  (r) => r.rodzaj !== 'INNE',
).map((r) => r.rodzaj);

export function opisRodzaju(rodzaj: RodzajRekolekcji): RodzajOpis {
  const opis = RODZAJE_REKOLEKCJI.find((r) => r.rodzaj === rodzaj);
  if (!opis) throw new Error(`Nieznany rodzaj rekolekcji: ${rodzaj}`);
  return opis;
}

export function najwyzszyStopien(rodzaje: RodzajRekolekcji[]): RodzajRekolekcji | null {
  const posiadane = STOPNIE.filter((s) => rodzaje.includes(s));
  return posiadane.at(-1) ?? null;
}

/**
 * Couples commonly have gaps in their formation path, so the suggestion is
 * the earliest missing degree rather than the one after their highest.
 */
export function nastepnyStopien(posiadane: RodzajRekolekcji[]): RodzajRekolekcji {
  return STOPNIE.find((s) => !posiadane.includes(s)) ?? 'INNE';
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- rekolekcje`
Expected: PASS, 7 testów

- [ ] **Step 5: Napisz test rejonów**

`src/lib/domena/rejony.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROMAN, kolorRejonu, numerRzymski } from './rejony';

describe('numerRzymski', () => {
  it('maps region numbers to Roman numerals', () => {
    expect(numerRzymski(1)).toBe('I');
    expect(numerRzymski(4)).toBe('IV');
    expect(numerRzymski(12)).toBe('XII');
  });

  it('rejects numbers outside 1-12', () => {
    expect(() => numerRzymski(0)).toThrow();
    expect(() => numerRzymski(13)).toThrow();
  });

  it('covers exactly twelve regions', () => {
    expect(ROMAN).toHaveLength(12);
  });
});

describe('kolorRejonu', () => {
  it('returns the palette colour for a region', () => {
    expect(kolorRejonu(1)).toBe('var(--rejon-1)');
    expect(kolorRejonu(12)).toBe('var(--rejon-12)');
  });

  it('rejects numbers outside 1-12', () => {
    expect(() => kolorRejonu(13)).toThrow();
  });
});
```

- [ ] **Step 6: Uruchom test — musi się wywalić**

Run: `npm test -- rejony`
Expected: FAIL — brak modułu

- [ ] **Step 7: Zaimplementuj rejony**

`src/lib/domena/rejony.ts`:

```ts
export const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
] as const;

function sprawdzZakres(rejon: number): void {
  if (!Number.isInteger(rejon) || rejon < 1 || rejon > 12) {
    throw new Error(`Numer rejonu poza zakresem 1-12: ${rejon}`);
  }
}

export function numerRzymski(rejon: number): string {
  sprawdzZakres(rejon);
  return ROMAN[rejon - 1]!;
}

/**
 * Returns the CSS custom property reference rather than a hex literal, so the
 * twelve-colour palette stays defined in exactly one place (tokens.css).
 */
export function kolorRejonu(rejon: number): string {
  sprawdzZakres(rejon);
  return `var(--rejon-${rejon})`;
}
```

- [ ] **Step 8: Uruchom test — musi przejść**

Run: `npm test -- rejony`
Expected: PASS, 5 testów

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add retreat and region domain constants"
```

---

### Task 8: Moduł uprawnień

To jest miejsce, w którym błąd oznacza ujawnienie danych osobowych kategorii szczególnej. Moduł jest czysty — bez Prismy, bez `async` — więc macierz testowa może być wyczerpująca i wykonuje się w milisekundach.

**Files:**
- Create: `src/lib/auth/permissions.ts`
- Test: `src/lib/auth/permissions.test.ts`

**Interfaces:**
- Consumes: `Rola` z `@/generated/prisma/enums`
- Produces:
  - `Uzytkownik = { id: bigint; rola: Rola; rejonId: number | null }`
  - `ParaZakres = { rejonId: number }`
  - `zakresListy(u: Uzytkownik): { usunieteAt: null; rejonId?: number }`
  - `mozeEdytowac(u, para): boolean` · `mozeUsuwac(u, para): boolean`
  - `mozeUsunacTrwale(u): boolean` · `mozeZarzadzacKontami(u): boolean`
  - `mozeCzytacAudyt(u): boolean` · `mozeImportowac(u): boolean`
  - `mozeZmienicRejon(u): boolean` · `mozeEksportowac(u): boolean`
  - `class Zabronione extends Error`
  - `assertMozeEdytowac(u, para): void`

- [ ] **Step 1: Napisz wyczerpującą macierz testową**

`src/lib/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type Uzytkownik, Zabronione, assertMozeEdytowac, mozeCzytacAudyt,
  mozeEksportowac, mozeEdytowac, mozeImportowac, mozeUsunacTrwale, mozeUsuwac,
  mozeZarzadzacKontami, mozeZmienicRejon, zakresListy,
} from './permissions';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

const paraVII = { rejonId: 7 };
const paraIII = { rejonId: 3 };

describe('zakresListy', () => {
  it('narrows a region account to its own region', () => {
    expect(zakresListy(rejonVII)).toEqual({ usunieteAt: null, rejonId: 7 });
  });

  it('does not narrow admin or viewer by region', () => {
    expect(zakresListy(admin)).toEqual({ usunieteAt: null });
    expect(zakresListy(moderator)).toEqual({ usunieteAt: null });
  });

  it('always excludes soft-deleted records', () => {
    for (const u of [admin, rejonVII, moderator]) {
      expect(zakresListy(u).usunieteAt).toBeNull();
    }
  });
});

describe('mozeEdytowac', () => {
  it('lets admin edit couples in any region', () => {
    expect(mozeEdytowac(admin, paraVII)).toBe(true);
    expect(mozeEdytowac(admin, paraIII)).toBe(true);
  });

  it('lets a region account edit only its own region', () => {
    expect(mozeEdytowac(rejonVII, paraVII)).toBe(true);
    expect(mozeEdytowac(rejonVII, paraIII)).toBe(false);
  });

  it('never lets the viewer edit anything', () => {
    expect(mozeEdytowac(moderator, paraVII)).toBe(false);
    expect(mozeEdytowac(moderator, paraIII)).toBe(false);
  });
});

describe('mozeUsuwac', () => {
  it('follows the same rule as editing', () => {
    expect(mozeUsuwac(admin, paraIII)).toBe(true);
    expect(mozeUsuwac(rejonVII, paraVII)).toBe(true);
    expect(mozeUsuwac(rejonVII, paraIII)).toBe(false);
    expect(mozeUsuwac(moderator, paraVII)).toBe(false);
  });
});

describe('admin-only capabilities', () => {
  const tylkoAdmin = {
    mozeUsunacTrwale, mozeZarzadzacKontami, mozeCzytacAudyt,
    mozeImportowac, mozeZmienicRejon,
  };

  for (const [nazwa, fn] of Object.entries(tylkoAdmin)) {
    it(`grants ${nazwa} to admin only`, () => {
      expect(fn(admin), 'admin').toBe(true);
      expect(fn(rejonVII), 'region account').toBe(false);
      expect(fn(moderator), 'viewer').toBe(false);
    });
  }
});

describe('mozeEksportowac', () => {
  it('allows every role to export — scope is narrowed by zakresListy', () => {
    expect(mozeEksportowac(admin)).toBe(true);
    expect(mozeEksportowac(rejonVII)).toBe(true);
    expect(mozeEksportowac(moderator)).toBe(true);
  });
});

describe('assertMozeEdytowac', () => {
  it('passes silently when allowed', () => {
    expect(() => assertMozeEdytowac(rejonVII, paraVII)).not.toThrow();
  });

  it('throws Zabronione when denied', () => {
    expect(() => assertMozeEdytowac(rejonVII, paraIII)).toThrow(Zabronione);
    expect(() => assertMozeEdytowac(moderator, paraVII)).toThrow(Zabronione);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- permissions`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj moduł**

`src/lib/auth/permissions.ts`:

```ts
import type { Rola } from '@/generated/prisma/enums';

export type Uzytkownik = {
  id: bigint;
  rola: Rola;
  rejonId: number | null;
};

/** The minimum a caller must know about a couple to decide access. */
export type ParaZakres = { rejonId: number };

export class Zabronione extends Error {
  constructor(message = 'Brak uprawnień do tej operacji') {
    super(message);
    this.name = 'Zabronione';
  }
}

/**
 * The Prisma `where` fragment that every list, export and statistics query
 * must spread in. Scoping is structural rather than remembered: a query that
 * forgets this fragment fails review, not production.
 */
export function zakresListy(u: Uzytkownik): { usunieteAt: null; rejonId?: number } {
  if (u.rola === 'rejon') {
    // Fail closed. A CHECK constraint keeps rejonId set for this role, but if
    // that invariant ever broke, falling through would hand a region account
    // the whole community rather than denying it.
    if (u.rejonId === null) {
      throw new Zabronione('Konto rejonowe bez przypisanego rejonu');
    }
    return { usunieteAt: null, rejonId: u.rejonId };
  }
  return { usunieteAt: null };
}

export function mozeEdytowac(u: Uzytkownik, para: ParaZakres): boolean {
  if (u.rola === 'admin') return true;
  if (u.rola === 'rejon') return u.rejonId !== null && para.rejonId === u.rejonId;
  return false;
}

export function mozeUsuwac(u: Uzytkownik, para: ParaZakres): boolean {
  return mozeEdytowac(u, para);
}

export function mozeUsunacTrwale(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeZarzadzacKontami(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeCzytacAudyt(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeImportowac(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

/** A region account may never move a couple out of its own region. */
export function mozeZmienicRejon(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

/** Every role may export; zakresListy decides how much they get. */
export function mozeEksportowac(_u: Uzytkownik): boolean {
  return true;
}

export function assertMozeEdytowac(u: Uzytkownik, para: ParaZakres): void {
  if (!mozeEdytowac(u, para)) throw new Zabronione();
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- permissions`
Expected: PASS — 5 grup, w tym 5 wygenerowanych testów uprawnień administracyjnych

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add permission rules with exhaustive role matrix"
```

---

### Task 9: Hashowanie haseł

**Files:**
- Create: `src/lib/auth/hasla.ts`
- Test: `src/lib/auth/hasla.test.ts`

**Interfaces:**
- Consumes: `@node-rs/argon2`
- Produces: `zahashuj(haslo: string): Promise<string>`, `sprawdzHaslo(hasz: string, haslo: string): Promise<boolean>`

- [ ] **Step 1: Zainstaluj bibliotekę**

```bash
npm i @node-rs/argon2
```

- [ ] **Step 2: Napisz test**

`src/lib/auth/hasla.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sprawdzHaslo, zahashuj } from './hasla';

describe('zahashuj', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const hasz = await zahashuj('tajne-haslo');
    expect(hasz).not.toContain('tajne-haslo');
    expect(hasz.startsWith('$argon2id$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await zahashuj('to-samo')).not.toBe(await zahashuj('to-samo'));
  });
});

describe('sprawdzHaslo', () => {
  it('accepts the correct password', async () => {
    const hasz = await zahashuj('poprawne');
    expect(await sprawdzHaslo(hasz, 'poprawne')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hasz = await zahashuj('poprawne');
    expect(await sprawdzHaslo(hasz, 'niepoprawne')).toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await sprawdzHaslo('to-nie-jest-hasz', 'cokolwiek')).toBe(false);
  });

  it('handles Polish characters in passwords', async () => {
    const hasz = await zahashuj('zażółć-gęślą-jaźń');
    expect(await sprawdzHaslo(hasz, 'zażółć-gęślą-jaźń')).toBe(true);
  });
});
```

- [ ] **Step 3: Uruchom test — musi się wywalić**

Run: `npm test -- hasla`
Expected: FAIL — brak modułu

- [ ] **Step 4: Zaimplementuj**

`src/lib/auth/hasla.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

export function zahashuj(haslo: string): Promise<string> {
  return hash(haslo);
}

/**
 * Returns false rather than throwing when the stored hash is malformed or
 * absent — an account in the `oczekuje` state has no hash yet, and a login
 * attempt against it must fail like any other, not crash the action.
 */
export async function sprawdzHaslo(hasz: string, haslo: string): Promise<boolean> {
  try {
    return await verify(hasz, haslo);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Uruchom test — musi przejść**

Run: `npm test -- hasla`
Expected: PASS, 6 testów

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add argon2id password hashing"
```

---

### Task 10: Sesje w bazie

**Files:**
- Create: `src/lib/auth/sesja.ts`
- Test: `src/lib/auth/sesja.int.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 3), `Uzytkownik` (Task 8)
- Produces:
  - `CZAS_ZYCIA_DNI = 30`
  - `utworzSesje(kontoId: bigint): Promise<string>` — zwraca **surowy** token
  - `pobierzUzytkownikaZTokena(token: string): Promise<Uzytkownik | null>`
  - `usunSesje(token: string): Promise<void>`
  - `usunSesjeKonta(kontoId: bigint): Promise<void>`
  - `usunWygasleSesje(): Promise<number>`

- [ ] **Step 1: Napisz test integracyjny**

`src/lib/auth/sesja.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  pobierzUzytkownikaZTokena, usunSesje, usunSesjeKonta, usunWygasleSesje, utworzSesje,
} from './sesja';

async function daneTestowe() {
  await prisma.rejon.upsert({ where: { id: 7 }, update: {}, create: { id: 7, numerRzym: 'VII' } });
  return prisma.konto.upsert({
    where: { email: 'sesja@example.pl' },
    update: { status: 'aktywne' },
    create: {
      email: 'sesja@example.pl', nazwa: 'Test Sesji',
      rola: 'rejon', rejonId: 7, status: 'aktywne',
    },
  });
}

beforeEach(async () => {
  await prisma.sesja.deleteMany();
});

afterAll(async () => {
  await prisma.sesja.deleteMany();
  await prisma.konto.deleteMany({ where: { email: 'sesja@example.pl' } });
  await prisma.$disconnect();
});

describe('utworzSesje', () => {
  it('never stores the raw token', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    const wiersze = await prisma.sesja.findMany();
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]!.tokenHash).not.toBe(token);
  });
});

describe('pobierzUzytkownikaZTokena', () => {
  it('resolves a valid token to the account', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    const u = await pobierzUzytkownikaZTokena(token);
    expect(u).toEqual({ id: konto.id, rola: 'rejon', rejonId: 7 });
  });

  it('returns null for an unknown token', async () => {
    expect(await pobierzUzytkownikaZTokena('zmyslony-token')).toBeNull();
  });

  it('returns null once the session has expired', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    await prisma.sesja.updateMany({ data: { wygasa: new Date(Date.now() - 1000) } });
    expect(await pobierzUzytkownikaZTokena(token)).toBeNull();
  });

  it('returns null when the account has been disabled', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    await prisma.konto.update({ where: { id: konto.id }, data: { status: 'wylaczone' } });
    // This is the reason sessions live in the database rather than a JWT.
    expect(await pobierzUzytkownikaZTokena(token)).toBeNull();
  });
});

describe('session removal', () => {
  it('usunSesje invalidates just that session', async () => {
    const konto = await daneTestowe();
    const a = await utworzSesje(konto.id);
    const b = await utworzSesje(konto.id);
    await usunSesje(a);
    expect(await pobierzUzytkownikaZTokena(a)).toBeNull();
    expect(await pobierzUzytkownikaZTokena(b)).not.toBeNull();
  });

  it('usunSesjeKonta invalidates every session of the account', async () => {
    const konto = await daneTestowe();
    const a = await utworzSesje(konto.id);
    const b = await utworzSesje(konto.id);
    await usunSesjeKonta(konto.id);
    expect(await pobierzUzytkownikaZTokena(a)).toBeNull();
    expect(await pobierzUzytkownikaZTokena(b)).toBeNull();
  });

  it('usunWygasleSesje removes only expired rows', async () => {
    const konto = await daneTestowe();
    const zywy = await utworzSesje(konto.id);
    await utworzSesje(konto.id);

    // Expire the second session only; sessions are created in id order.
    const nowsza = await prisma.sesja.findFirstOrThrow({ orderBy: { id: 'desc' } });
    await prisma.sesja.update({
      where: { id: nowsza.id },
      data: { wygasa: new Date(Date.now() - 1000) },
    });

    expect(await usunWygasleSesje()).toBe(1);
    expect(await pobierzUzytkownikaZTokena(zywy)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- sesja`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/auth/sesja.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Uzytkownik } from './permissions';

export const CZAS_ZYCIA_DNI = 30;

function hashTokena(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token — the only moment it exists outside the cookie. */
export async function utworzSesje(kontoId: bigint): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const wygasa = new Date(Date.now() + CZAS_ZYCIA_DNI * 24 * 60 * 60 * 1000);
  await prisma.sesja.create({
    data: { kontoId, tokenHash: hashTokena(token), wygasa },
  });
  return token;
}

/**
 * Resolves a session token, re-checking account status on every call. A JWT
 * could not do this: a disabled account would keep working until its token
 * expired, which the acceptance checklist forbids.
 */
export async function pobierzUzytkownikaZTokena(token: string): Promise<Uzytkownik | null> {
  const sesja = await prisma.sesja.findUnique({
    where: { tokenHash: hashTokena(token) },
    include: { konto: true },
  });

  if (!sesja) return null;
  if (sesja.wygasa <= new Date()) return null;
  if (sesja.konto.status !== 'aktywne') return null;

  return {
    id: sesja.konto.id,
    rola: sesja.konto.rola,
    rejonId: sesja.konto.rejonId,
  };
}

export async function usunSesje(token: string): Promise<void> {
  await prisma.sesja.deleteMany({ where: { tokenHash: hashTokena(token) } });
}

/** Called whenever an account is disabled, so access ends immediately. */
export async function usunSesjeKonta(kontoId: bigint): Promise<void> {
  await prisma.sesja.deleteMany({ where: { kontoId } });
}

export async function usunWygasleSesje(): Promise<number> {
  const { count } = await prisma.sesja.deleteMany({
    where: { wygasa: { lte: new Date() } },
  });
  return count;
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- sesja`
Expected: PASS, 8 testów

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add database-backed session store"
```

---

### Task 11: Ograniczenie prób logowania

**Files:**
- Create: `src/lib/auth/limity.ts`
- Test: `src/lib/auth/limity.int.test.ts`

**Interfaces:**
- Consumes: `prisma`
- Produces: `LIMIT_PROB = 10`, `OKNO_MINUT = 15`, `czyPrzekroczonoLimit(klucz: string): Promise<boolean>`, `zapiszProbe(klucz: string): Promise<void>`, `wyczyscProby(klucz: string): Promise<void>`

- [ ] **Step 1: Napisz test**

`src/lib/auth/limity.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { LIMIT_PROB, czyPrzekroczonoLimit, wyczyscProby, zapiszProbe } from './limity';

beforeEach(async () => {
  await prisma.probaLogowania.deleteMany();
});

afterAll(async () => {
  await prisma.probaLogowania.deleteMany();
  await prisma.$disconnect();
});

describe('czyPrzekroczonoLimit', () => {
  it('allows the first attempt', async () => {
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });

  it('blocks once the limit is reached', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(true);
  });

  it('counts each key separately', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:b@example.pl')).toBe(false);
  });

  it('ignores attempts older than the window', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    await prisma.probaLogowania.updateMany({
      data: { kiedy: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });
});

describe('wyczyscProby', () => {
  it('resets the counter after a successful login', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    await wyczyscProby('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- limity`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/auth/limity.ts`:

```ts
import { prisma } from '@/lib/db';

export const LIMIT_PROB = 10;
export const OKNO_MINUT = 15;

function poczatekOkna(): Date {
  return new Date(Date.now() - OKNO_MINUT * 60 * 1000);
}

export async function czyPrzekroczonoLimit(klucz: string): Promise<boolean> {
  const liczba = await prisma.probaLogowania.count({
    where: { klucz, kiedy: { gte: poczatekOkna() } },
  });
  return liczba >= LIMIT_PROB;
}

export async function zapiszProbe(klucz: string): Promise<void> {
  await prisma.probaLogowania.create({ data: { klucz } });
}

/** Called after a successful login so a user who finally remembers their
 *  password is not locked out by their own earlier mistakes. */
export async function wyczyscProby(klucz: string): Promise<void> {
  await prisma.probaLogowania.deleteMany({ where: { klucz } });
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- limity`
Expected: PASS, 5 testów

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add login attempt rate limiting"
```

---

### Task 12: Odczyt sesji z cookie i layout chroniony

**Files:**
- Create: `src/lib/auth/requireUser.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/pary/page.tsx`, `src/app/wyloguj/route.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `pobierzUzytkownikaZTokena`, `usunSesje` (Task 10)
- Produces:
  - `NAZWA_COOKIE = 'kartoteka_sesja'`
  - `ustawCookieSesji(token: string): Promise<void>`
  - `usunCookieSesji(): Promise<void>`
  - `pobierzUzytkownika(): Promise<Uzytkownik | null>`
  - `requireUser(): Promise<Uzytkownik>` — przekierowuje na `/logowanie`

- [ ] **Step 1: Zaimplementuj odczyt sesji**

`src/lib/auth/requireUser.ts`:

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CZAS_ZYCIA_DNI, pobierzUzytkownikaZTokena, usunSesje } from './sesja';
import type { Uzytkownik } from './permissions';

export const NAZWA_COOKIE = 'kartoteka_sesja';

export async function ustawCookieSesji(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(NAZWA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CZAS_ZYCIA_DNI * 24 * 60 * 60,
  });
}

export async function usunCookieSesji(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAZWA_COOKIE)?.value;
  if (token) await usunSesje(token);
  jar.delete(NAZWA_COOKIE);
}

export async function pobierzUzytkownika(): Promise<Uzytkownik | null> {
  const token = (await cookies()).get(NAZWA_COOKIE)?.value;
  if (!token) return null;
  return pobierzUzytkownikaZTokena(token);
}

/**
 * Every server action and route handler must call this before touching
 * Prisma. The protected layout calling it is not enough: server actions are
 * public POST endpoints and are not covered by any layout.
 */
export async function requireUser(): Promise<Uzytkownik> {
  const u = await pobierzUzytkownika();
  if (!u) redirect('/logowanie');
  return u;
}
```

- [ ] **Step 2: Napisz layout chroniony i zaślepkę listy**

`src/app/(app)/layout.tsx`:

```tsx
import { requireUser } from '@/lib/auth/requireUser';

export default async function LayoutAplikacji({ children }: { children: React.ReactNode }) {
  // Full shell (sidebar, role-dependent navigation) arrives in Plan 2.
  await requireUser();
  return <>{children}</>;
}
```

`src/app/(app)/pary/page.tsx`:

```tsx
import { requireUser } from '@/lib/auth/requireUser';
import { numerRzymski } from '@/lib/domena/rejony';

export default async function StronaPar() {
  const u = await requireUser();
  const zakres = u.rejonId === null ? 'cała wspólnota' : `rejon ${numerRzymski(u.rejonId)}`;

  return (
    <main style={{ padding: 32 }}>
      <h1>Pary wspólnoty</h1>
      <p>
        Zalogowano jako <strong>{u.rola}</strong> — {zakres}.
      </p>
      <form action="/wyloguj" method="post">
        <button type="submit">Wyloguj</button>
      </form>
    </main>
  );
}
```

Ta strona jest celowo bez stylów — pełna powłoka i lista powstają w Planie 2. Tutaj potwierdza wyłącznie, że sesja i rola docierają na serwer.

- [ ] **Step 3: Napisz wylogowanie**

`src/app/wyloguj/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { usunCookieSesji } from '@/lib/auth/requireUser';

export async function POST(request: Request) {
  await usunCookieSesji();
  return NextResponse.redirect(new URL('/logowanie', request.url), { status: 303 });
}
```

- [ ] **Step 4: Przekieruj stronę główną**

`src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Start() {
  redirect('/pary');
}
```

- [ ] **Step 5: Sprawdź przekierowanie niezalogowanego**

```bash
npm run dev
```

Otwórz `http://localhost:3000/pary` w przeglądarce bez cookie.
Expected: przekierowanie na `/logowanie` (na razie 404 — ekran powstaje w Task 14)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add session cookie handling and protected layout"
```

---

### Task 13: Dane testowe

**Files:**
- Create: `prisma/seed.ts`, `prisma/seed/dane.ts`
- Test: `prisma/seed.int.test.ts`

**Interfaces:**
- Consumes: `zahashuj` (Task 9), `STOPNIE` (Task 7), `ROMAN` (Task 7)
- Produces: baza z 12 rejonami, ~30 parafiami, kręgami, 300 parami i 14 kontami

Rozkład formacji musi gwarantować **niepusty wynik dla każdej z 17 opcji filtra** (punkt listy odbioru) — czyli dla każdego z 7 stopni istnieje para, która go ma, i para, która go nie ma; istnieje para z wpisem `INNE`; istnieje para bez żadnych wpisów.

- [ ] **Step 1: Napisz dane słownikowe**

`prisma/seed/dane.ts`:

```ts
export const NAZWISKA = [
  'Kowalscy', 'Nowakowie', 'Wiśniewscy', 'Wójcikowie', 'Kowalczykowie',
  'Kamińscy', 'Lewandowscy', 'Zielińscy', 'Szymańscy', 'Woźniakowie',
  'Dąbrowscy', 'Kozłowscy', 'Jankowscy', 'Mazurowie', 'Kwiatkowscy',
  'Krawczykowie', 'Piotrowscy', 'Grabowscy', 'Nowakowscy', 'Pawłowscy',
  'Michalscy', 'Adamczykowie', 'Dudkowie', 'Zającowie', 'Wieczorkowie',
  'Jabłońscy', 'Królowie', 'Majewscy', 'Olszewscy', 'Jaworscy',
  'Malinowscy', 'Formela', 'Bagińscy', 'Antczakowie', 'Andryskowscy',
  'Baranowie', 'Bartoszewscy', 'Cichy', 'Sowowie', 'Górzyńscy',
];

export const IMIONA_ZENSKIE = [
  'Anna', 'Maria', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Barbara',
  'Ewa', 'Joanna', 'Magdalena', 'Monika', 'Marta', 'Alicja',
  'Emilia', 'Zofia', 'Teresa', 'Beata', 'Dorota', 'Renata',
];

export const IMIONA_MESKIE = [
  'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Marek', 'Paweł',
  'Jan', 'Michał', 'Grzegorz', 'Waldemar', 'Janusz', 'Sławomir',
  'Bartosz', 'Adam', 'Wojciech', 'Łukasz', 'Rafał', 'Dariusz',
];

export const PARAFIE = [
  ['św. Brygidy', 'Gdańsk'], ['NMP Gwiazdy Morza', 'Sopot'],
  ['MB Bolesnej', 'Gdynia'], ['Bł. Doroty', 'Gdańsk'],
  ['Podwyższenia Krzyża', 'Pruszcz Gd.'], ['Trójcy Świętej', 'Gdańsk'],
  ['św. Jadwigi', 'Gdańsk'], ['Chrystusa Króla', 'Gdynia'],
  ['św. Antoniego', 'Gdynia'], ['NSPJ', 'Gdańsk'],
  ['św. Wojciecha', 'Gdańsk'], ['Opatrzności Bożej', 'Gdańsk'],
  ['św. Maksymiliana', 'Gdynia'], ['MB Częstochowskiej', 'Gdańsk'],
  ['św. Andrzeja Boboli', 'Sopot'], ['św. Michała', 'Gdańsk'],
  ['Matki Bożej Fatimskiej', 'Gdynia'], ['św. Józefa', 'Gdańsk'],
  ['św. Stanisława', 'Gdańsk'], ['Zesłania Ducha Św.', 'Gdynia'],
  ['św. Franciszka', 'Gdańsk'], ['NMP Królowej Polski', 'Gdynia'],
  ['św. Krzyża', 'Pruszcz Gd.'], ['św. Piotra i Pawła', 'Gdańsk'],
  ['Bożego Ciała', 'Gdańsk'], ['św. Rodziny', 'Gdynia'],
  ['Miłosierdzia Bożego', 'Gdańsk'], ['św. Anny', 'Gdańsk'],
  ['św. Kazimierza', 'Gdynia'], ['Zmartwychwstania', 'Gdańsk'],
] as const;

export const PATRONI = [
  'św. Rity', 'św. Weroniki', 'św. Moniki', 'św. Rodziny', 'bł. Karoliny',
  'św. Joanny Beretty', 'św. Zelii i Ludwika', 'św. Jana Pawła II',
];

export const MIEJSCA_REKOLEKCJI = [
  'Krościenko n. Dunajcem', 'Piaseczno', 'Chmielno', 'Szczyrk',
  'Święta Lipka', 'Zaborów', 'Zakopane', 'Niepokalanów',
  'Wierzchowo', 'Nowy Sącz', 'Ustroń', 'Kalisz',
];

export const DZIECI = [
  'Marysia 2014, Antek 2017', 'Zosia 2009, Kuba 2013, Hania 2019',
  'Jan 2011', 'Ola 2016, Staś 2020', '', 'Franek 2008, Ignacy 2012',
  'Lena 2018', '', 'Tymon 2015, Nina 2021', 'Julia 2007, Wiktor 2010',
];
```

- [ ] **Step 2: Napisz skrypt seeda**

`prisma/seed.ts`:

```ts
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
 * result. Indices 0..7 are reserved to guarantee that:
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

async function main() {
  console.log('Czyszczenie bazy…');
  await prisma.rekolekcje.deleteMany();
  await prisma.para.deleteMany();
  await prisma.krag.deleteMany();
  await prisma.sesja.deleteMany();
  await prisma.audyt.deleteMany();
  await prisma.konto.deleteMany();
  await prisma.parafia.deleteMany();
  await prisma.rejon.deleteMany();

  console.log('Rejony…');
  for (let i = 1; i <= 12; i++) {
    await prisma.rejon.create({ data: { id: i, numerRzym: ROMAN[i - 1]! } });
  }

  console.log('Parafie…');
  const parafie = [];
  for (const [nazwa, miasto] of PARAFIE) {
    parafie.push(await prisma.parafia.create({ data: { nazwa, miasto } }));
  }

  console.log('Kręgi…');
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

  console.log('Konta…');
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
        nazwa: oczekuje ? 'Do obsadzenia' : `${wybierz(IMIONA_ZENSKIE)} i ${wybierz(IMIONA_MESKIE)} ${wybierz(NAZWISKA)}`,
        rola: 'rejon', rejonId,
        hashHasla: oczekuje ? null : hash,
        status: oczekuje ? 'oczekuje' : 'aktywne',
        ostatnieLogowanie: oczekuje ? null : new Date(Date.now() - Math.floor(rnd() * 30) * 86400000),
      },
    });
  }

  console.log(`Pary (${LICZBA_PAR})…`);
  for (let i = 0; i < LICZBA_PAR; i++) {
    const krag = wybierz(kregi);
    const nazwisko = wybierz(NAZWISKA);
    const para = await prisma.para.create({
      data: {
        imieZony: wybierz(IMIONA_ZENSKIE),
        imieMeza: wybierz(IMIONA_MESKIE),
        nazwisko,
        // ł has no Unicode decomposition, so it must be replaced before NFD.
        email: `${nazwisko.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '')}${i}@example.pl`,
        telefon: `+48 ${500 + Math.floor(rnd() * 400)} ${String(Math.floor(rnd() * 900) + 100)} ${String(Math.floor(rnd() * 900) + 100)}`,
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

  console.log(`Gotowe. Hasło do wszystkich kont testowych: ${HASLO_TESTOWE}`);
}

// No top-level await: the project has no "type": "module", so tsx loads .ts
// files as CommonJS and top-level await fails with ERR_REQUIRE_ASYNC_MODULE.
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Uruchom seed**

```bash
npm run db:seed
```

Expected: `Gotowe. Hasło do wszystkich kont testowych: kartoteka123`

- [ ] **Step 4: Napisz test weryfikujący rozkład**

`prisma/seed.int.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { STOPNIE } from '@/lib/domena/rekolekcje';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed data', () => {
  it('creates twelve regions and 300 couples', async () => {
    expect(await prisma.rejon.count()).toBe(12);
    expect(await prisma.para.count()).toBe(300);
  });

  it('creates fourteen accounts, one of them awaiting invitation', async () => {
    expect(await prisma.konto.count()).toBe(14);
    expect(await prisma.konto.count({ where: { status: 'oczekuje' } })).toBe(1);
  });

  // The acceptance checklist requires all 17 formation filter options to
  // return a non-empty result on seed data.
  it.each(STOPNIE)('has couples with and without %s', async (stopien) => {
    const maja = await prisma.para.count({
      where: { rekolekcje: { some: { rodzaj: stopien } } },
    });
    const niemaja = await prisma.para.count({
      where: { rekolekcje: { none: { rodzaj: stopien } } },
    });
    expect(maja, `nobody has ${stopien}`).toBeGreaterThan(0);
    expect(niemaja, `everybody has ${stopien}`).toBeGreaterThan(0);
  });

  it('has couples with INNE entries and couples with no entries at all', async () => {
    expect(await prisma.para.count({
      where: { rekolekcje: { some: { rodzaj: 'INNE' } } },
    })).toBeGreaterThan(0);
    expect(await prisma.para.count({
      where: { rekolekcje: { none: {} } },
    })).toBeGreaterThan(0);
  });

  it('has couples whose parish differs from their circle parish', async () => {
    expect(await prisma.para.count({ where: { parafiaId: { not: null } } }))
      .toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Uruchom test**

Run: `npm run test:int -- seed`
Expected: PASS, 11 testów (7 wygenerowanych przez `it.each` + 4)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add seed data with complete formation coverage"
```

---

### Task 14: Ekran logowania

Projekt lewej kolumny pochodzi z `docs/handoff/README.md` §1 i ze zrzutu `docs/handoff/screenshots/01-logowanie.png`. **Prawa kolumna różni się świadomie:** prototyp ma wybór jednego z czterech kont demonstracyjnych, a produkcja wymaga formularza e-mail + hasło (README: „W wersji docelowej: logowanie e-mailem i hasłem"). Język wizualny — tło, monogram, typografia, tokeny — zostaje bez zmian.

**Files:**
- Create: `src/app/(auth)/logowanie/page.tsx`, `src/app/(auth)/logowanie/akcje.ts`, `src/app/(auth)/logowanie/Formularz.tsx`, `src/app/(auth)/logowanie/logowanie.module.css`

**Interfaces:**
- Consumes: `sprawdzHaslo` (Task 9), `utworzSesje` (Task 10), `czyPrzekroczonoLimit`/`zapiszProbe`/`wyczyscProby` (Task 11), `ustawCookieSesji` (Task 12)
- Produces: server action `zaloguj(_stan: StanLogowania, formData: FormData): Promise<StanLogowania>` gdzie `StanLogowania = { blad?: string }`

- [ ] **Step 1: Zainstaluj Zod**

```bash
npm i zod@4
```

- [ ] **Step 2: Napisz server action**

`src/app/(auth)/logowanie/akcje.ts`:

```ts
'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sprawdzHaslo, zahashuj } from '@/lib/auth/hasla';
import { czyPrzekroczonoLimit, wyczyscProby, zapiszProbe } from '@/lib/auth/limity';
import { ustawCookieSesji } from '@/lib/auth/requireUser';
import { utworzSesje } from '@/lib/auth/sesja';
import { prisma } from '@/lib/db';

export type StanLogowania = { blad?: string };

const schemat = z.object({
  email: z.string().trim().toLowerCase().email('Podaj poprawny adres e-mail'),
  haslo: z.string().min(1, 'Podaj hasło'),
});

// One message for every failure mode, so the form cannot be used to discover
// which e-mail addresses have accounts.
const BLAD_OGOLNY = 'Nieprawidłowy e-mail lub hasło.';

// A real argon2id hash of a random string, computed once per process. Verifying
// against it costs the same as verifying a genuine password, so response time
// does not reveal whether an address has an account.
let haszAtrapa: string | null = null;
async function atrapaHasla(): Promise<string> {
  haszAtrapa ??= await zahashuj(randomBytes(32).toString('hex'));
  return haszAtrapa;
}

export async function zaloguj(_stan: StanLogowania, formData: FormData): Promise<StanLogowania> {
  const wynik = schemat.safeParse({
    email: formData.get('email'),
    haslo: formData.get('haslo'),
  });
  if (!wynik.success) {
    return { blad: wynik.error.issues[0]?.message ?? BLAD_OGOLNY };
  }

  const { email, haslo } = wynik.data;
  const klucz = `email:${email}`;

  if (await czyPrzekroczonoLimit(klucz)) {
    return { blad: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' };
  }

  const konto = await prisma.konto.findUnique({ where: { email } });

  const hasz = konto?.hashHasla ?? (await atrapaHasla());
  const poprawne = await sprawdzHaslo(hasz, haslo);

  if (!konto || !poprawne || konto.status !== 'aktywne') {
    await zapiszProbe(klucz);
    return { blad: BLAD_OGOLNY };
  }

  await wyczyscProby(klucz);
  await prisma.konto.update({
    where: { id: konto.id },
    data: { ostatnieLogowanie: new Date() },
  });

  const token = await utworzSesje(konto.id);
  await ustawCookieSesji(token);
  redirect('/pary');
}
```

- [ ] **Step 3: Napisz style**

`src/app/(auth)/logowanie/logowanie.module.css`:

```css
.ekran {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  min-height: 100vh;
}

.lewa {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--navy-900);
  color: #e7edf4;
  padding: 64px 60px;
}

.brand { display: flex; align-items: center; gap: 13px; }

.monogram {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: var(--r-9);
  background: var(--surface);
  color: var(--navy-700);
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 19px;
  letter-spacing: -0.02em;
}

.podpis {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #9dbdd8;
  line-height: 1.6;
}

.tytul {
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 62px;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.015em;
}

.tytul em { font-style: normal; color: var(--gold-500); }

.lead {
  font-size: 17px;
  line-height: 1.55;
  color: #b8cbdc;
  max-width: 45ch;
}

.stopkaLewa { font-size: 13px; color: #7d97ad; }

.prawa {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  background: var(--bg-panel);
  padding: 64px 52px;
}

.naglowekFormularza {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.pole { display: flex; flex-direction: column; gap: 5px; }

.etykieta { font-size: 13px; color: var(--text-muted); }

.input {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 12px;
  font-size: 15px;
  color: var(--text);
  min-height: 44px;
  width: 100%;
}

.input:focus {
  border-color: var(--blue-500);
  box-shadow: 0 0 0 3px rgba(28, 95, 150, .12);
  outline: none;
}

.przycisk {
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

.przycisk:hover { background: var(--navy-900); }
.przycisk:disabled { opacity: .6; cursor: progress; }

.blad {
  background: var(--danger-bg);
  border: 1px solid #e3c4c4;
  border-radius: var(--r-8);
  padding: 11px 13px;
  font-size: 13px;
  color: var(--danger-fg);
}

.stopkaFormularza { font-size: 12px; color: var(--text-faint); }

@media (max-width: 860px) {
  .ekran { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .lewa { padding: 26px 22px 30px; }
  .tytul { font-size: 38px; }
  .prawa { padding: 26px 20px 40px; }
}
```

- [ ] **Step 4: Napisz komponent formularza**

`src/app/(auth)/logowanie/Formularz.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type StanLogowania, zaloguj } from './akcje';
import style from './logowanie.module.css';

function Przycisk() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.przycisk} disabled={pending}>
      {pending ? 'Logowanie…' : 'Zaloguj się'}
    </button>
  );
}

export function Formularz() {
  const [stan, akcja] = useActionState<StanLogowania, FormData>(zaloguj, {});

  return (
    <form action={akcja} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {stan.blad && (
        <p className={style.blad} role="alert">
          {stan.blad}
        </p>
      )}

      <div className={style.pole}>
        <label className={style.etykieta} htmlFor="email">Adres e-mail</label>
        <input
          className={style.input}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className={style.pole}>
        <label className={style.etykieta} htmlFor="haslo">Hasło</label>
        <input
          className={style.input}
          id="haslo"
          name="haslo"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Przycisk />
    </form>
  );
}
```

- [ ] **Step 5: Napisz stronę**

`src/app/(auth)/logowanie/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { pobierzUzytkownika } from '@/lib/auth/requireUser';
import { Formularz } from './Formularz';
import style from './logowanie.module.css';

export default async function StronaLogowania() {
  if (await pobierzUzytkownika()) redirect('/pary');

  return (
    <div className={style.ekran}>
      <section className={style.lewa}>
        <div className={style.brand}>
          <span className={style.monogram} aria-hidden="true">ŚŻ</span>
          <span className={style.podpis}>
            Ruch Światło-Życie
            <br />
            Archidiecezja Gdańska
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 className={style.tytul}>
            Kartoteka
            <br />
            <em>Domowego Kościoła</em>
          </h1>
          <p className={style.lead}>
            Dwanaście rejonów, jedna wspólna baza. Pary rejonowe prowadzą swoją część
            kartoteki, para odpowiedzialna za wspólnotę widzi całość.
          </p>
        </div>

        <p className={style.stopkaLewa}>Archidiecezja Gdańska</p>
      </section>

      <section className={style.prawa}>
        <h2 className={style.naglowekFormularza}>Zaloguj się</h2>
        <Formularz />
        <p className={style.stopkaFormularza}>
          Dostęp nadaje para odpowiedzialna za wspólnotę.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Sprawdź ręcznie**

```bash
npm run dev
```

Otwórz `http://localhost:3000/logowanie`. Zaloguj się jako `admin@example.pl` / `kartoteka123`.
Expected: przekierowanie na `/pary`, treść „Zalogowano jako admin — cała wspólnota."

Sprawdź też błędne hasło.
Expected: komunikat „Nieprawidłowy e-mail lub hasło."

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add login screen with rate-limited credential check"
```

---

### Task 15: Testy end-to-end logowania

**Files:**
- Create: `playwright.config.ts`, `e2e/logowanie.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: całość Planu 1
- Produces: `npm run e2e`

- [ ] **Step 1: Zainstaluj Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Skonfiguruj**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/logowanie',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Dopisz do `package.json`: `"e2e": "playwright test"`

- [ ] **Step 3: Napisz testy**

`e2e/logowanie.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const HASLO = 'kartoteka123';

async function zaloguj(page: import('@playwright/test').Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

test('redirects an anonymous visitor to the login screen', async ({ page }) => {
  await page.goto('/pary');
  await expect(page).toHaveURL(/\/logowanie$/);
});

test('admin signs in and sees the whole community', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/pary$/);
  await expect(page.getByText('cała wspólnota')).toBeVisible();
});

test('a region account is scoped to its own region', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await expect(page.getByText('rejon VII')).toBeVisible();
});

test('the moderator signs in with the view-only role', async ({ page }) => {
  await zaloguj(page, 'moderator@example.pl');
  await expect(page.getByText('podglad')).toBeVisible();
});

test('rejects a wrong password without revealing whether the account exists', async ({ page }) => {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill('admin@example.pl');
  await page.getByLabel('Hasło').fill('zle-haslo');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy e-mail lub hasło.');

  await page.getByLabel('Adres e-mail').fill('nieistniejacy@example.pl');
  await page.getByLabel('Hasło').fill('cokolwiek');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy e-mail lub hasło.');
});

test('an account awaiting invitation cannot sign in', async ({ page }) => {
  await zaloguj(page, 'rejon12@example.pl');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/logowanie$/);
});

test('signing out ends the session', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await page.goto('/pary');
  await expect(page).toHaveURL(/\/logowanie$/);
});
```

- [ ] **Step 4: Uruchom testy**

```bash
npm run db:reset && npm run db:seed && npm run e2e
```

Expected: PASS, 7 testów

- [ ] **Step 5: Sprawdź, że wyłączone konto natychmiast traci dostęp**

To jest punkt listy odbioru, którego nie da się sprawdzić samym logowaniem. Zaloguj się jako `rejon7@example.pl`, następnie w drugim terminalu:

```bash
docker compose exec db psql -U kartoteka -d kartoteka -c "UPDATE konto SET status='wylaczone' WHERE email='rejon7@example.pl';"
```

Odśwież `/pary` w przeglądarce.
Expected: natychmiastowe przekierowanie na `/logowanie`

Przywróć: `docker compose exec db psql -U kartoteka -d kartoteka -c "UPDATE konto SET status='aktywne' WHERE email='rejon7@example.pl';"`

- [ ] **Step 6: Uruchom pełny zestaw i commit**

```bash
npm test && npm run test:int && npm run build
git add -A
git commit -m "test: add end-to-end login and session scoping coverage"
```

---

## Stan po Planie 1

- Aplikacja startuje, baza zawiera 12 rejonów, ~30 parafii, kręgi, 300 par i 14 kont
- Trzy role logują się i docierają na serwer z poprawnym zakresem
- Wyłączenie konta odcina dostęp natychmiast (zweryfikowane ręcznie i testem)
- Moduł uprawnień pokryty wyczerpującą macierzą 3 ról × 2 rejonów × 9 operacji
- Wszystkie tokeny projektu w jednym pliku, fonty self-hostowane
- `npm test`, `npm run test:int`, `npm run e2e`, `npm run build` — wszystko przechodzi

**Plan 2 zaczyna od:** powłoki aplikacji (sidebar/topbar, nawigacja zależna od roli) i zastąpienia zaślepki `/pary` prawdziwą listą.
