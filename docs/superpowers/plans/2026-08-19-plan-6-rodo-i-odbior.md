# Kartoteka DK — Plan 6: RODO i lista odbioru

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domknąć zobowiązania z §12 specyfikacji — trwałe usunięcie na żądanie, retencja audytu, klauzula informacyjna — a potem przejść listę odbioru punkt po punkcie i zapisać odstępstwa.

**Architecture:** Trwałe usunięcie to jedna transakcja: `DELETE` pary i rekolekcji + **anonimizacja** wpisów audytu, nie ich kasowanie. Retencja to skrypt CLI uruchamiany cronem hosta, nie scheduler wewnątrz aplikacji — przy wielu instancjach kontenera odpalałby się równolegle. Klauzula informacyjna to statyczna strona poza `(app)`, dostępna bez sesji.

**Tech Stack:** Next.js 16.3 · Prisma 7.9 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` (§4.4 usuwanie, §12 RODO, §13 dostępność)
**Wygląd — nadrzędny:** `docs/handoff/README.md`
**Lista odbioru:** `docs/handoff/IMPLEMENTATION.md` §9

## Global Constraints

- **Bezpieczeństwo:** `requireUser()` przed Prismą; trwałe usunięcie wyłącznie dla admina (`canPurge`).
- **Audyt przeżywa usunięcie osoby.** Anonimizujemy `coupleId → NULL` i podmieniamy opis. Rejestr rozliczalności, który da się skasować razem z rekordem, nie jest rejestrem.
- **Bez MUI i Tailwinda**, tokeny z `tokens.css`, liczebniki przez `plural()`.
- **Commity** po każdym zadaniu, po angielsku.

## Trzy decyzje podjęte przy pisaniu tego planu

**1. Miękko usunięte pary muszą być osiągalne.** Dziś `listScope` odcina `deletedAt != null` wszędzie, więc rekord po „Usuń parę" znika bezpowrotnie z interfejsu. To samo w sobie jest problemem RODO: **nie da się usunąć na żądanie czegoś, czego nie da się znaleźć**. Dokładamy filtr „usunięte" widoczny **tylko dla admina**, a nie osobny widok kosza — lista, filtry, sortowanie i paginacja już działają, a kosz byłby ich kopią.

**2. Trwałe usunięcie wymaga przepisania nazwiska.** Zwykłe „na pewno?" przy operacji nieodwracalnej jest za słabe — klika się je odruchowo. Admin przepisuje nazwisko pary. To ta sama technika, co przy kasowaniu repozytorium na GitHubie, i z tego samego powodu.

**3. Klauzula informacyjna z widocznymi lukami.** Treść należy do zamawiającego (administrator danych, podstawa prawna, okres przechowywania). Aplikacja daje stronę z rusztowaniem i **jawnie oznaczonymi miejscami do uzupełnienia**, zamiast zmyślonej treści prawnej, którą ktoś mógłby wziąć za gotową.

---

## Struktura plików

```
src/lib/couples/purge.ts        trwałe usunięcie + anonimizacja audytu
scripts/retention.mts           czyszczenie audytu i sesji, cron hosta

src/app/(app)/pary/PurgeForm.tsx   potwierdzenie przez przepisanie nazwiska
src/app/(auth)/informacja-o-danych/page.tsx   klauzula informacyjna

DECISIONS.md                    odstępstwa od specyfikacji
```

---

### Task 1: Trwałe usunięcie na żądanie

**Files:**
- Create: `src/lib/couples/purge.ts`
- Test: `src/lib/couples/purge.int.test.ts`

**Interfaces:**
- Produces: `purgeCouple(u: User, id: bigint): Promise<void>`

- [x] **Step 1: Napisz test**

Testy pokrywają: usunięcie pary i jej rekolekcji, **przetrwanie** wpisów audytu z `coupleId = null` i podmienionym opisem, odmowę dla nie-admina, odmowę dla nieistniejącego id, oraz dopisanie wpisu `delete` o samym fakcie żądania.

- [x] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- purge`
Expected: FAIL

- [x] **Step 3: Zaimplementuj**

Jedna transakcja: anonimizacja audytu → kasowanie rekolekcji → kasowanie pary → wpis o wykonaniu żądania. Kolejność ma znaczenie: gdyby para poszła pierwsza, klucz obcy `audit.couple_id` albo zablokowałby operację, albo (przy `ON DELETE SET NULL`) zabrałby nam informację, które wpisy anonimizować.

- [x] **Step 4: Uruchom test — musi przejść**

- [x] **Step 5: Commit** — `feat: add permanent erasure for data subject requests`

---

### Task 2: Filtr usuniętych par

**Files:**
- Modify: `src/lib/couples/filters.ts`, `src/lib/couples/queries.ts`, `src/lib/auth/permissions.ts`, `src/app/(app)/pary/FilterBar.tsx`

- [x] **Step 1: Napisz test** — `listScope(u, { deleted: true })` zwraca `deletedAt: { not: null }` dla admina i **ignoruje** flagę dla pozostałych ról. Fail closed: para rejonowa, która dopisze `?deleted=1`, dostaje swoją zwykłą listę, nie cudze usunięte rekordy.

- [x] **Step 2: Zaimplementuj** — `deleted: boolean` w `Filters`, przepuszczony przez `toSearchParams`; w `FilterBar` checkbox „Pokaż usunięte" renderowany tylko dla admina.

- [x] **Step 3: Commit** — `feat: let the admin reach soft-deleted couples`

---

### Task 3: Potwierdzenie i akcja w karcie

**Files:**
- Create: `src/app/(app)/pary/PurgeForm.tsx`
- Modify: `src/app/(app)/pary/actions.ts`, `CoupleCard.tsx`, `card.module.css`

- [x] **Step 1: Napisz akcję** — `purgeCoupleAction` sprawdza `canPurge`, porównuje przepisane nazwisko z prawdziwym, wywołuje `purgeCouple`.
- [x] **Step 2: Napisz formularz** — sekcja „Strefa nieodwracalna" na dole karty, widoczna wyłącznie dla admina.
- [x] **Step 3: Commit** — `feat: add the erasure confirmation to the couple card`

---

### Task 4: Retencja

**Files:**
- Create: `scripts/retention.mts`
- Test: `scripts/retention.int.test.ts`
- Modify: `package.json` — `"retention": "tsx scripts/retention.mts"`

- [x] **Step 1: Napisz test** — kasuje wpisy audytu starsze niż 24 miesiące, **zostawia** młodsze, kasuje wygasłe sesje, zostawia ważne, zwraca liczby.
- [x] **Step 2: Zaimplementuj** — `retention.mts` eksportuje `runRetention()` i wywołuje ją, gdy jest uruchamiany bezpośrednio; test importuje samą funkcję.
- [x] **Step 3: Commit** — `feat: add the retention job for audit and sessions`

---

### Task 5: Klauzula informacyjna

**Files:**
- Create: `src/app/(auth)/informacja-o-danych/page.tsx`, `notice.module.css`
- Modify: `src/app/(auth)/logowanie/page.tsx` (odnośnik), `src/app/(app)/Shell.tsx` (odnośnik w stopce)

- [x] **Step 1: Napisz stronę** — rusztowanie z jawnymi lukami `[do uzupełnienia: …]`.
- [x] **Step 2: Podepnij odnośniki**
- [x] **Step 3: Commit** — `feat: add the privacy notice page`

---

### Task 6: Przegląd dostępności

**Files:**
- Modify: `src/styles/tokens.css` lub arkusze modułów — tam, gdzie brakuje `:focus-visible`

- [x] **Step 1: Zbadaj** — wypisz wszystkie kontrolki i sprawdź: widoczny obrys `:focus-visible`, minimum 44 px na mobile, `<label for>` przy każdym polu.
- [x] **Step 2: Napraw braki**
- [x] **Step 3: Test e2e** — nawigacja klawiaturą po liście i karcie.
- [x] **Step 4: Commit** — `fix: complete the keyboard and touch-target pass`

---

### Task 7: DECISIONS.md i przejście listy odbioru

**Files:**
- Create: `DECISIONS.md`
- Modify: `docs/STATUS.md`

- [x] **Step 1: Napisz `DECISIONS.md`** — każde odstępstwo od handoffu z uzasadnieniem: 11 rejonów zamiast 12, brak CSV, zaproszenia bez SMTP, brak logowania Google, soft-delete + trwałe usunięcie, retencja 24 miesiące.
- [x] **Step 2: Przejdź listę odbioru** — 46 punktów z `IMPLEMENTATION.md` §9, każdy zweryfikowany testem albo ręcznie; wynik w `DECISIONS.md`.
- [x] **Step 3: Commit** — `docs: record decisions and the acceptance walk-through`

---

## Stan po Planie 6

- Trwałe usunięcie na żądanie osoby, z audytem, który przeżywa usunięcie
- Miękko usunięte pary osiągalne dla admina
- Retencja audytu i sesji jako zadanie crona hosta
- Klauzula informacyjna z jawnymi lukami do wypełnienia przez zamawiającego
- Przejrzana dostępność klawiaturowa i dotykowa
- `DECISIONS.md` z odstępstwami i wynikiem listy odbioru

**Poza zakresem:** wdrożenie (Docker Compose produkcyjny, TLS, kopie zapasowe) — osobny plan, wymaga decyzji o hostingu.
