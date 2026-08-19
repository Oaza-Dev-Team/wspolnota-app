<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Kartoteka DK

Kartoteka małżeństw wspólnoty Domowego Kościoła (Ruch Światło-Życie, archidiecezja
gdańska): ~300 par w **11 rejonach**, ~15 kont edytujących, 4 role.

**Uwaga:** handoff w `docs/handoff/` opisuje 12 rejonów i tyle pokazują zrzuty —
to stan sprzed weryfikacji u zamawiającego. Rejonów jest **11** (I–XI). Handoffu nie
poprawiamy: to otrzymany brief. Liczba rejonów nie jest w kodzie literałem — wynika
z `REGION_COUNT` w `src/lib/domain/regions.ts`.

**Zanim cokolwiek napiszesz, przeczytaj:**

| Plik | Rola |
|---|---|
| `docs/STATUS.md` | **zacznij tutaj** — gdzie jesteśmy, co dalej, jak wznowić |
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
Każde zapytanie listy, eksportu i statystyk wstrzykuje `listScope(user)`.
Reguły uprawnień żyją wyłącznie w `src/lib/auth/permissions.ts`.
Rola `superadmin` to konto techniczne: ma wszystko, co `admin`, plus konta, których
`admin` tknąć nie może. Nowa reguła porównująca role idzie przez `hasAdminPowers`
albo `canManageRole` — nie przez `role === 'admin'`.

**Style.** Bez MUI i bez Tailwinda. Wyłącznie CSS Modules + custom properties
z `src/styles/tokens.css`. **Literalna wartość koloru, odstępu, promienia lub cienia
w pliku `.module.css` jest błędem** — ma być `var(--…)`.

**Fonty.** Wyłącznie `next/font`. Żadnego `<link>` do `fonts.googleapis.com` —
self-hosting jest wymaganiem RODO (dane o przekonaniach religijnych), nie optymalizacją.

**Dane.** Kartoteka zawiera dane kategorii szczególnej (art. 9 RODO) oraz dane dzieci.
Audyt zapisuje się w **tej samej transakcji** co zmiana.

## Język

**Po polsku jest tylko to, co czyta człowiek. Reszta po angielsku.**

Angielski: identyfikatory, nazwy plików, klasy CSS, tokeny, schemat bazy (modele
Prismy oraz tabele i kolumny), komentarze, nazwy testów, commity oraz **całe URL-e** —
ścieżki tras i parametry zapytania.

Polski: teksty interfejsu, formy odmiany liczebników i kody rekolekcji (`ONŻ I`).

**Ścieżki tras były po polsku i przestały nimi być 19.08.2026.** Uzasadnieniem był
„adres, który widzi użytkownik", ale w aplikacji za logowaniem, po której chodzi się
klikając, tego adresu nikt nie czyta ani nie wpisuje — jedyny wysyłany komuś link to
zaproszenie, a ono niesie nieczytelny token. Polski kosztował za to przy każdej trasie:
odmiana (`/pary/1` czy `/para/1`?), ryzyko znaków diakrytycznych (`/kręgi` →
`/kr%C4%99gi`) i dwie nazwy na jedno pojęcie w każdym pliku. Powód i rachunek kosztów
są w `DECISIONS.md` §1.10.

Liczebniki odmieniaj przez `plural()` z `src/lib/pl/`, sortuj przez
`localeCompare(…, 'pl')`; w bazie działa kolacja `pl-PL-x-icu`.

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
- **Alert Dependabota o `uuid` (GHSA-w5hq-g745-h8pq) jest dla nas fałszywie trafny
  i zostaje otwarty świadomie.** `uuid@8.3.2` wchodzi przechodnio przez `exceljs`.
  Podatność dotyczy `v3`/`v5`/`v6` wywołanych **z buforem docelowym**; `exceljs` zna
  wyłącznie `v4`, woła je bez argumentów, i to w obsłudze formatowania warunkowego,
  którego nie używamy. **Podpowiedź npm proponuje cofnięcie `exceljs` do 3.4.0** —
  to złamałoby eksport i import. Pin przez `overrides` też odpadł (sprawdzony, testy
  przechodziły) — nie nosimy pinu dla nieistniejącego problemu, bo wymusza kombinację,
  której autorzy `exceljs` nigdy nie testowali. Zanim zareagujesz na alert, sprawdź
  najpierw, czy podatna ścieżka jest u nas w ogóle osiągalna.
- **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Zanim uznasz, że
  padła, sprawdź `prisma migrate status` — jeśli mówi "up to date", migracja przeszła
  i wystarczy ubić proces. Wiszący proces trzyma blokadę advisory i zablokuje kolejne
  migracje.
- **Kolumny `search_text` są `GENERATED ALWAYS`** — Postgres je wylicza, aplikacja nigdy
  nie zapisuje. Pomijaj je w `data` przy tworzeniu i edycji pary, inaczej baza odrzuci zapis.
- **`prisma migrate dev` chce zepsuć kolumny `GENERATED ALWAYS`.** Prisma ich nie
  modeluje i czyta jako dryf, więc do migracji dokłada `DROP DEFAULT` na `search_text`
  i `DROP INDEX couple_search_text_idx` — a potem sama się na tym wywraca, zostawiając
  **skasowany indeks wyszukiwania**. Migracje dotykające tylko enumów albo kolumn pisz
  ręcznie i sprawdzaj na jednorazowej bazie (`CREATE DATABASE …` + `migrate deploy`),
  zamiast kasować bazę deweloperską.
- Konfiguracje Vitest mają rozszerzenie `.mts` i używają natywnego
  `resolve.tsconfigPaths` zamiast wtyczki.
