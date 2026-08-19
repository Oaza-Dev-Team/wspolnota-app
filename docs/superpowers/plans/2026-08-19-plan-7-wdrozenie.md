# Kartoteka DK — Plan 7: Wdrożenie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obraz produkcyjny, `docker-compose` z TLS i bazą, kopie zapasowe i runbook — wszystko, co da się zrobić **bez** znajomości dostawcy i domeny.

**Architecture:** Standalone build Next.js w wielostopniowym obrazie, Postgres 16 obok, Caddy jako reverse proxy z automatycznym Let's Encrypt. Migracje przy starcie kontenera aplikacji, nie w osobnym kroku — jedna instancja, więc wyścigu nie ma, a wdrożenie zostaje jednym poleceniem.

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` §18 (deployment), §12 (RODO)

## Czego ten plan **nie** rozstrzyga

Dostawca VPS i domena to decyzje zamawiającego. Wszystko poniżej działa niezależnie
od nich; w runbooku miejsca wymagające tych dwóch informacji są oznaczone.

## Global Constraints

- **Nic tajnego w repozytorium.** Hasła i sekrety wyłącznie przez `.env` na serwerze,
  którego repozytorium nie zna.
- **Baza nie wystawia portu na świat.** Tylko sieć wewnętrzna compose.
- **Kopie zapasowe szyfrowane, w UE, retencja 30 dni** (spec §12).

---

### Task 1: Standalone build i obraz

- [x] **Step 1:** `output: 'standalone'` w `next.config.ts`
- [x] **Step 2:** `Dockerfile` — etap `deps`, `build`, `runner`; użytkownik bez roota; `prisma generate` przed buildem
- [x] **Step 3:** `.dockerignore`
- [x] **Step 4:** Zbuduj obraz lokalnie i sprawdź, że wstaje
- [x] **Step 5: Commit** — `build: add the production image`

---

### Task 2: Endpoint zdrowia

- [x] **Step 1:** `src/app/zdrowie/route.ts` — sprawdza połączenie z bazą, zwraca 200 albo 503. Bez `requireUser()`: to sonda dla Dockera, nie widok. Nie ujawnia niczego poza „działa / nie działa".
- [x] **Step 2: Commit** — `feat: add a health endpoint for the container probe`

---

### Task 3: Compose produkcyjny z TLS

- [x] **Step 1:** `docker-compose.prod.yml` — `app`, `db`, `proxy`; baza bez publikowanego portu; healthchecki; `restart: unless-stopped`
- [x] **Step 2:** `Caddyfile` — jeden host, automatyczne HTTPS, nagłówki bezpieczeństwa
- [x] **Step 3:** `.env.production.example`
- [x] **Step 4: Commit** — `build: add the production compose stack`

---

### Task 4: Kopie zapasowe

- [x] **Step 1:** `scripts/backup.sh` — `pg_dump`, szyfrowanie GPG symetryczne, retencja 30 dni, wyjście niezerowe przy błędzie
- [x] **Step 2: Commit** — `feat: add the encrypted backup script`

---

### Task 5: Runbook

- [x] **Step 1:** `docs/DEPLOYMENT.md` — pierwsze uruchomienie, aktualizacja, odtworzenie z kopii, cron, luki do uzupełnienia
- [x] **Step 2:** Uporządkuj `.env.example` — `SESSION_SECRET` nie jest przez aplikację używany
- [x] **Step 3: Commit** — `docs: add the deployment runbook`

---

## Stan po Planie 7

Repozytorium zawiera wszystko, czego trzeba, żeby postawić instancję produkcyjną —
brakuje wyłącznie dwóch informacji od zamawiającego: dostawcy i domeny.
