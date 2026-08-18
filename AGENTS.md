<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Kartoteka DK

Kartoteka małżeństw wspólnoty Domowego Kościoła (Ruch Światło-Życie, archidiecezja
gdańska): ~300 par w **11 rejonach**, ~15 kont edytujących, 3 role.

**Uwaga:** handoff w `docs/handoff/` opisuje 12 rejonów i tyle pokazują zrzuty —
to stan sprzed weryfikacji u zamawiającego. Rejonów jest **11** (I–XI). Handoffu nie
poprawiamy: to otrzymany brief. Liczba rejonów nie jest w kodzie literałem — wynika
z `LICZBA_REJONOW` w `src/lib/domena/rejony.ts`.

**Zanim cokolwiek napiszesz, przeczytaj:**

| Plik | Rola |
|---|---|
| `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` | projekt techniczny — decyzje i uzasadnienia |
| `docs/superpowers/plans/` | plany wykonawcze w krokach TDD |
| `docs/handoff/README.md` | **specyfikacja wizualna — nadrzędna** dla wyglądu i zachowań |
| `docs/handoff/IMPLEMENTATION.md` | lista kontrolna odbioru (~45 punktów) |

`docs/handoff/` to materiał referencyjny, nie kod. `support.js` i `Wspolnota.dc.html`
to prototyp do wyrzucenia — nigdy nie przenoś z nich architektury ani stylów inline.

## Stos

Next.js 16 (App Router) · React 19 · TypeScript strict + `noUncheckedIndexedAccess`
PostgreSQL 16 · Prisma 7 · Zod 4 · CSS Modules · Vitest 4 · Playwright

## Reguły nienegocjowalne

**Bezpieczeństwo.** Żadna server action ani route handler nie dotyka Prismy przed
`requireUser()`. Layout nie chroni server actions — to publiczne endpointy POST.
Każde zapytanie listy, eksportu i statystyk wstrzykuje `zakresListy(user)`.
Reguły uprawnień żyją wyłącznie w `src/lib/auth/permissions.ts`.

**Style.** Bez MUI i bez Tailwinda. Wyłącznie CSS Modules + custom properties
z `src/styles/tokens.css`. **Literalna wartość koloru, odstępu, promienia lub cienia
w pliku `.module.css` jest błędem** — ma być `var(--…)`.

**Fonty.** Wyłącznie `next/font`. Żadnego `<link>` do `fonts.googleapis.com` —
self-hosting jest wymaganiem RODO (dane o przekonaniach religijnych), nie optymalizacją.

**Dane.** Kartoteka zawiera dane kategorii szczególnej (art. 9 RODO) oraz dane dzieci.
Audyt zapisuje się w **tej samej transakcji** co zmiana.

## Język

- **Identyfikatory domenowe po polsku:** `para`, `rejon`, `krag`, `rekolekcje`, `audyt`
- **Identyfikatory techniczne po angielsku:** `requireUser`, `parseFilters`
- **Komentarze, nazwy testów i commity po angielsku**
- **Cały interfejs po polsku**, `lang="pl"` na `<html>`
- Liczebniki wymagają odmiany (`odmiana()` z `src/lib/pl/`), sortowanie przez
  `localeCompare(…, 'pl')`, w bazie kolacja `pl-PL-x-icu`

## Komendy

```bash
docker compose up -d      # Postgres na porcie 5433
npm run dev               # localhost:3000
npm test                  # Vitest — testy jednostkowe, bez bazy
npm run test:int          # testy integracyjne — wymagają działającej bazy
npm run lint
npm run build
npm run db:migrate        # prisma migrate dev
npm run db:seed
npm run db:reset
```

## Pułapki tego środowiska

- **Port bazy to 5433, nie 5432.** Port 5432 zajmuje `docfields_postgres` z innego
  projektu na tej maszynie.
- **Prisma 7 wymaga sterownika.** `new PrismaClient()` bez `adapter` nie kompiluje się.
  URL w `prisma.config.ts` obsługuje wyłącznie CLI; runtime dostaje `@prisma/adapter-pg`.
- **`tsx` nie ładuje `.env`** — robi to tylko Next.js. Skrypty muszą zaczynać się
  od `import 'dotenv/config'`.
- **Brak `"type": "module"`** — `tsx` ładuje `.ts` jako CommonJS, więc top-level `await`
  wywala się z `ERR_REQUIRE_ASYNC_MODULE`. Używaj `.mts` albo opakuj w `main()`.
- **`npm audit` zgłasza 3 podatności high** (`deepmerge-ts`). Ścieżka to
  `prisma → @prisma/config`, czyli devDependency; `@prisma/client` jest czysty.
  **Nie uruchamiaj `npm audit fix --force`** — cofa do Prismy 6 i łamie konfigurację.
- Konfiguracje Vitest mają rozszerzenie `.mts` i używają natywnego
  `resolve.tsconfigPaths` zamiast wtyczki.
