# Stan projektu — 18.08.2026

Dokument do wznowienia pracy po przerwie. Aktualizuj przy każdym zatrzymaniu.

## Gdzie jesteśmy

Kartoteka Domowego Kościoła — aplikacja webowa dla wspólnoty Ruchu Światło-Życie
(archidiecezja gdańska). **11 rejonów**, ~300 par, ~15 kont edytujących, 3 role.

Budowane z handoffu projektowego w `docs/handoff/` (README = wygląd, IMPLEMENTATION =
lista odbioru). Projekt techniczny: `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md`.

## Gałąź i commity

**Aktualna gałąź: `plan-3-couple-card`** — drzewo czyste, 2 commity ponad `main`:

```
11123e9  feat: add couple and retreat validation schema
93690db  Add couple write layer with transactional audit
```

`main` jest **6 commitów przed `origin/main`** — nic nie wypchnięte na GitHuba
(`github.com/Oaza-Dev-Team/wspolnota-app`). To świadoma decyzja, czeka na Twoją zgodę.

## Postęp planów

| Plan | Zakres | Stan |
|---|---|---|
| 1 | fundament, uwierzytelnianie, uprawnienia, seed | ✅ scalony do `main` |
| 2 | powłoka, lista par, filtry | ✅ scalony do `main` |
| — | refactor na angielski + squash migracji | ✅ scalony do `main` |
| **3** | **karta pary i formacja** | **w toku — zadania 1–2 z 9 gotowe** |
| 4 | eksport CSV/XLSX i import z Excela | niezaplanowany |
| 5 | rejony, konta rejonów, historia zmian | niezaplanowany |
| 6 | RODO i lista odbioru | niezaplanowany |

### Plan 3 — szczegółowo

Plan: `docs/superpowers/plans/2026-08-18-plan-3-karta-pary.md`

- [x] **Zadanie 1** — schemat walidacji (`src/lib/couples/schema.ts`), 11 testów
- [x] **Zadanie 2** — warstwa zapisu (`src/lib/couples/save.ts`), 13 testów integracyjnych
- [ ] **Zadanie 3** — odczyt karty (`src/lib/couples/card.ts`) ← **TU WZNAWIAMY**
- [ ] Zadanie 4 — server actions
- [ ] Zadanie 5 — toast
- [ ] Zadanie 6 — panel karty (`<dialog>`)
- [ ] Zadanie 7 — sekcja formacji
- [ ] Zadanie 8 — podpięcie do listy
- [ ] Zadanie 9 — testy e2e

## Jak wznowić

```bash
cd C:\PrvDevelopment\wspolnota-app
docker compose up -d          # Postgres na porcie 5433
npm run dev                   # http://localhost:3000
```

Baza jest zaseedowana (300 par, 11 rejonów, 13 kont). Jeśli po restarcie okaże się
pusta albo rozjechana: `npm run db:seed`.

Konta testowe, wszystkie z hasłem `kartoteka123`:

| E-mail | Rola |
|---|---|
| `admin@example.pl` | para odpowiedzialna za wspólnotę |
| `moderator@example.pl` | moderator, tylko podgląd |
| `rejon1@example.pl` … `rejon10@example.pl` | pary rejonowe |
| `rejon11@example.pl` | status `pending`, **nie zaloguje się** (to jest testowane) |

## Weryfikacja

```bash
npm test          # 96 testów jednostkowych
npm run test:int  # 63 integracyjne (wymagają bazy)
npm run lint
npm run build
npm run e2e       # 22 testy Playwright, na buildzie produkcyjnym
```

## Decyzje, do których nie wracamy

- **Stos:** Next.js 16 App Router + PostgreSQL + Prisma. Bez MUI, bez Tailwinda —
  projekt jest autorski i podany co do piksela, więc CSS Modules + tokeny.
- **Sesje w bazie, nie JWT.** Lista odbioru wymaga, żeby wyłączenie konta działało
  natychmiast; JWT dawałby dostęp do wygaśnięcia tokena.
- **Bez Auth.js** — v5 od lat w becie, a przy danych art. 9 RODO to zła podstawa.
- **11 rejonów, nie 12.** Handoff mówił 12; teksty poprawione, zrzuty ekranu i prototyp
  nadal pokazują 12 i zostają jako materiał historyczny.
- **Nazewnictwo:** po polsku wyłącznie to, co czyta człowiek — interfejs, formy odmiany,
  ścieżki tras (`/pary`), kody rekolekcji. Reszta po angielsku, łącznie ze schematem bazy.
- **Ścieżki tras zostają polskie** — potwierdzone, nie otwieramy ponownie.
- **Logowanie Google** — rozważane, decyzja odłożona do Planu 5 (spec §6.1). Do tego
  czasu **nie budujemy przepływu zaproszeń ani resetu hasła**, bo to jedyna część,
  która przy zmianie decyzji byłaby stratą.

## Pułapki tego środowiska

- **Port bazy to 5433**, nie 5432 — 5432 zajmuje `docfields_postgres` z innego projektu.
- **Prisma 7 wymaga sterownika** — `new PrismaClient()` bez `adapter` nie kompiluje się.
- **`prisma generate` po każdej zmianie schematu** — `migrate` tego nie robi.
- **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Sprawdź
  `prisma migrate status` zanim uznasz, że padła; wiszący proces trzyma blokadę advisory.
- **`tsx` nie ładuje `.env`** — skrypty zaczynają się od `import 'dotenv/config'`.
- **Kolumny `search_text` są `GENERATED ALWAYS`** — nigdy nie wymieniaj ich w `data`.
- **E2E tylko na buildzie produkcyjnym** — na `next dev` kompilacja tras na żądanie
  daje losowo padające testy.
- **`npm audit` zgłasza 3 podatności high** (`deepmerge-ts` przez `prisma` → devDependency).
  **Nie naprawiaj** — `audit fix --force` cofa do Prismy 6.

## Otwarte pytania do Ciebie

1. **Push na GitHuba** — 6 commitów czeka lokalnie. Repozytorium jest w organizacji,
   więc push je upublicznia jej członkom.
2. **Format Excela do importu** — zdefiniowany w spec §11 (szablon = układ eksportu).
   Przy Planie 4 przyda się próbka Twoich rzeczywistych danych.
3. **Hosting** — ustalone „VPS w UE + Docker", ale bez konkretów. Do rozstrzygnięcia
   przed Planem 6.
