# Logowanie kluczem dostępu (passkey) — plan wykonawczy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić logowanie hasłem na logowanie kluczem dostępu (WebAuthn), usuwając hasło z aplikacji całkowicie.

**Architecture:** Ceremonie WebAuthn kończą się w `createSession(accountId)` — istniejącym szwie, za którym nic się nie zmienia (`requireUser()`, uprawnienia, `listScope`, server actions). Logika dzieli się na warstwę domenową w `src/lib/auth/webauthn/` (bez Reacta, testowalną integracyjnie) i cienkie server actions wołane z komponentów klienckich. Kryptografię obsługuje biblioteka; nasze własne reguły (licznik podpisów, ostatni klucz, status konta) są w osobnych, czystych funkcjach.

**Tech Stack:** Next.js 16.3 (App Router) · React 19.2 · TypeScript strict · Prisma 7.9 + `@prisma/adapter-pg` · PostgreSQL 16 · `@simplewebauthn/server` 13.3 · `@simplewebauthn/browser` 13.3 · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-21-passkey-login-design.md`

## Global Constraints

- **RP ID: `kartoteka.oazagdansk.pl`.** Wyprowadzany z `APP_URL`, nigdy z osobnej zmiennej. Klucz jest przywiązany do domeny nieodwracalnie.
- **`requireUser()` przed każdym dotknięciem Prismy** w server action i route handlerze. Layout nie chroni server actions — to publiczne endpointy POST.
- **Audyt w tej samej transakcji co zmiana.** Bez wyjątków.
- **Reguły uprawnień wyłącznie w `src/lib/auth/permissions.ts`.** Porównania ról przez `hasAdminPowers` / `canManageRole`, nigdy `role === 'admin'`.
- **Style: CSS Modules + `var(--…)` z `src/styles/tokens.css`.** Bez MUI, bez Tailwinda.
  - **Uwaga, `AGENTS.md` mówi tu więcej, niż kod robi.** Reguła brzmi „literalna wartość koloru, odstępu, promienia lub cienia jest błędem", ale `tokens.css` **nie zawiera tokenów odstępu ani rozmiaru pisma** — są wyłącznie kolory (`--text-muted`, `--border`, `--surface`…), promienie (`--r-4`…`--r-20`), cienie (`--shadow-card`…), czasy i punkty łamania. Istniejące moduły, `account.module.css` włącznie, piszą `padding: 22px 24px` i `font-size: 13px` wprost.
  - **Obowiązuje kod, nie zapis reguły:** kolor, promień i cień **zawsze** przez `var(--…)`; odstęp i rozmiar pisma literałem, dopasowanym do sąsiednich reguł w tym samym module. **Nie wymyślaj `--space-*` ani `--font-size-*`** — nie istnieją i wprowadzanie ich przy okazji tej zmiany byłoby refaktorem poza zakresem.
- **Język: po polsku tylko to, co czyta człowiek.** Identyfikatory, nazwy plików, klasy CSS, schemat bazy, komentarze, nazwy testów, commity i **całe URL-e** po angielsku.
- **Port bazy 5433**, nie 5432.
- **Migracje pisane ręcznie.** `prisma migrate dev` czyta kolumny `search_text` (`GENERATED ALWAYS`) jako dryf i kasuje `couple_search_text_idx`. Sprawdzać na jednorazowej bazie: `CREATE DATABASE …` + `migrate deploy`. Po zastosowaniu weryfikować `prisma migrate status` — proces potrafi zawisnąć mimo poprawnie zastosowanej migracji.
- **Skrypty: rozszerzenie `.mts`** (brak `"type": "module"` sprawia, że `tsx` ładuje `.ts` jako CommonJS i top-level `await` wywala się z `ERR_REQUIRE_ASYNC_MODULE`) oraz **`import 'dotenv/config'` w pierwszej linii** (`tsx` nie ładuje `.env`).
- **Konwencje SQL z istniejących migracji:** `CREATE TYPE "Name" AS ENUM (…)`, `TIMESTAMPTZ(6)`, indeksy `table_column_idx`, identyfikatory w cudzysłowach, komentarz na górze pliku wyjaśniający, dlaczego migracja jest pisana ręcznie.
- **TypeScript strict + `noUncheckedIndexedAccess`.**
- **Nie uruchamiać `npm audit fix --force`** — cofa do Prismy 6 i łamie konfigurację.

## Kolejność i zasada „aplikacja działa po każdym zadaniu"

Migracja jest **rozbita na dwie**. Migracja A (Zadanie 2) tylko dodaje: `credential`, `webauthn_challenge`, `account.webauthn_user_id`. Migracja B (Zadanie 12) usuwa `account.password_hash` — dopiero wtedy, gdy logowanie kluczem działa end-to-end. Dzięki temu na żadnym etapie nie powstaje commit, po którym nikt nie może się zalogować.

## Struktura plików

**Nowe — warstwa domenowa** (`src/lib/auth/webauthn/`, każdy plik jedna odpowiedzialność):

| Plik | Odpowiedzialność |
|---|---|
| `config.ts` | RP ID, `origin`, nazwa RP — wyprowadzone z `APP_URL` |
| `challenge.ts` | wydanie i jednorazowe zużycie wyzwania |
| `policy.ts` | czyste reguły: licznik podpisów. Bez I/O |
| `register.ts` | ceremonia rejestracji: opcje + weryfikacja + zapis |
| `authenticate.ts` | ceremonia logowania: opcje + weryfikacja + sesja |
| `credentials.ts` | lista, zmiana nazwy, usunięcie, reguła ostatniego klucza |

**Nowe — pozostałe:** `src/app/(app)/account/KeyList.tsx`, `scripts/key-reset.mts`, `e2e/support/signIn.ts`, `e2e/passkey.spec.ts`, dwie migracje.

**Modyfikowane:** `prisma/schema.prisma`, `src/lib/auth/session.ts`, `src/lib/auth/rateLimit.ts`, `src/lib/accounts/manage.ts`, `src/lib/accounts/self.ts`, `src/lib/accounts/policy.ts`, `src/app/(auth)/login/{actions.ts,LoginForm.tsx}`, `src/app/(auth)/invite/[token]/{actions.ts,InviteForm.tsx,page.tsx}`, `src/app/(app)/account/{actions.ts,page.tsx,account.module.css}`, `scripts/create-superadmin.mts`, `scripts/retention.mts`, `prisma/seed.ts`, `package.json`, sześć plików `e2e/*.spec.ts`.

**Usuwane:** `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`, `src/app/(app)/account/PasswordForm.tsx`, `e2e/password.spec.ts`, `e2e/prepare.ts`.

---

### Task 1: Zależności i konfiguracja RP

**Files:**
- Modify: `package.json`
- Create: `src/lib/auth/webauthn/config.ts`
- Test: `src/lib/auth/webauthn/config.test.ts`

**Interfaces:**
- Produces: `rpConfig(): { rpID: string; origin: string }`, `RP_NAME: string`

- [ ] **Step 1: Zainstaluj biblioteki**

```bash
npm install @simplewebauthn/server@^13.3.2 @simplewebauthn/browser@^13.3.0
```

- [ ] **Step 2: Napisz test, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rpConfig } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rpConfig', () => {
  it('derives the relying party id and origin from APP_URL', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    expect(rpConfig()).toEqual({
      rpID: 'kartoteka.oazagdansk.pl',
      origin: 'https://kartoteka.oazagdansk.pl',
    });
  });

  it('drops a trailing slash, so the origin matches what the browser sends', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl/');
    expect(rpConfig().origin).toBe('https://kartoteka.oazagdansk.pl');
  });

  it('keeps the port in the origin but not in the id', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    expect(rpConfig()).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000' });
  });

  it('falls back to localhost in development, where there is nothing to configure', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(rpConfig().rpID).toBe('localhost');
  });

  it('refuses to guess in production: a wrong origin only shows up as sign-in failing', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => rpConfig()).toThrow(/APP_URL/);
  });
});
```

- [ ] **Step 3: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run src/lib/auth/webauthn/config.test.ts`
Expected: FAIL — `Failed to resolve import "./config"`

- [ ] **Step 4: Napisz implementację**

Utwórz `src/lib/auth/webauthn/config.ts`:

```ts
/**
 * A passkey is bound to a domain: a credential created for one relying party
 * id does not exist for any other. Both values therefore come from a single
 * environment variable — two variables could be set to disagree, and the only
 * symptom would be that signing in stops working, with nothing in the error to
 * say why.
 */

export const RP_NAME = 'Kartoteka Domowego Kościoła';

const DEV_FALLBACK = 'http://localhost:3000';

export function rpConfig(): { rpID: string; origin: string } {
  const raw = process.env.APP_URL?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Brak zmiennej APP_URL — bez niej logowanie kluczem nie zadziała pod żadnym adresem',
      );
    }
    return { rpID: 'localhost', origin: DEV_FALLBACK };
  }

  const url = new URL(raw);
  // The browser sends the origin without a trailing slash; URL.origin already
  // normalises that, and also drops any path someone put in the variable.
  return { rpID: url.hostname, origin: url.origin };
}
```

- [ ] **Step 5: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run src/lib/auth/webauthn/config.test.ts`
Expected: PASS — 5 testów

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/auth/webauthn/
git commit -m "feat(auth): derive the WebAuthn relying party from APP_URL"
```

---

### Task 2: Schemat i migracja A (dodanie tabel)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821120000_passkey_tables/migration.sql`
- Test: `src/lib/auth/webauthn/schema.int.test.ts`

**Interfaces:**
- Produces: modele `Credential`, `WebauthnChallenge`, pole `Account.webauthnUserId`, enum `ChallengePurpose`

- [ ] **Step 1: Dopisz modele do `prisma/schema.prisma`**

Po enumie `AuditKind` dodaj:

```prisma
enum ChallengePurpose {
  registration
  authentication
}
```

W modelu `Account`, po `inviteExpiresAt`, dodaj pole i relację:

```prisma
  /// Opaque, random, and stable for the life of the account. Sent to the
  /// authenticator as `user.id` and stored there, which is why the WebAuthn
  /// spec forbids putting anything personal in it — no e-mail, no surname.
  /// It is also what a sign-in resolves to an account by, since the login
  /// screen asks for no address.
  webauthnUserId   String        @unique @map("webauthn_user_id")
```

```prisma
  credentials Credential[]
```

Po modelu `Session` dodaj:

```prisma
model Credential {
  /// The identifier the authenticator itself assigned, base64url. Unique by
  /// construction and the value a sign-in looks the key up by, so a second
  /// surrogate id would earn nothing.
  id         String    @id
  accountId  BigInt    @map("account_id")
  /// The only half we hold. Useless to whoever dumps the database.
  publicKey  Bytes     @map("public_key")
  counter    BigInt    @default(0)
  /// The browser's hint for the next sign-in: internal, hybrid, usb, nfc, ble.
  transports String[]
  label      String
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastUsedAt DateTime? @map("last_used_at") @db.Timestamptz(6)

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@map("credential")
}

/// A signature only proves freshness against a challenge the server issued and
/// has not seen used. Storing it client-side would let a recorded response be
/// replayed, so the row lives here and is deleted the moment it is spent.
model WebauthnChallenge {
  id        BigInt           @id @default(autoincrement())
  challenge String           @unique
  /// Filled for a registration, empty for a sign-in: at the moment a sign-in
  /// challenge is issued nobody has said who they are yet, and that is the point.
  accountId BigInt?          @map("account_id")
  purpose   ChallengePurpose
  expiresAt DateTime         @map("expires_at") @db.Timestamptz(6)

  @@index([expiresAt])
  @@map("webauthn_challenge")
}
```

- [ ] **Step 2: Napisz migrację ręcznie**

Utwórz `prisma/migrations/20260821120000_passkey_tables/migration.sql`:

```sql
-- Sign-in moves from a password to a passkey. This migration only adds; the
-- password column goes in a later one, once signing in with a key works, so
-- that no commit in between leaves the installation unable to log in.
--
-- Written by hand. `prisma migrate dev` reads the generated `search_text`
-- columns as drift and would drop `couple_search_text_idx` along with this.
CREATE TYPE "ChallengePurpose" AS ENUM ('registration', 'authentication');

CREATE TABLE "credential" (
    "id" TEXT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credential_account_id_idx" ON "credential"("account_id");

ALTER TABLE "credential" ADD CONSTRAINT "credential_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webauthn_challenge" (
    "id" BIGSERIAL NOT NULL,
    "challenge" TEXT NOT NULL,
    "account_id" BIGINT,
    "purpose" "ChallengePurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webauthn_challenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webauthn_challenge_challenge_key" ON "webauthn_challenge"("challenge");
CREATE INDEX "webauthn_challenge_expires_at_idx" ON "webauthn_challenge"("expires_at");

-- Added nullable and backfilled, because the table is not empty: the technical
-- account already exists. gen_random_uuid() needs no extension on Postgres 16
-- and gives an opaque 128-bit value, which is all this column ever has to be.
ALTER TABLE "account" ADD COLUMN "webauthn_user_id" TEXT;

UPDATE "account" SET "webauthn_user_id" = REPLACE(gen_random_uuid()::TEXT, '-', '')
  WHERE "webauthn_user_id" IS NULL;

ALTER TABLE "account" ALTER COLUMN "webauthn_user_id" SET NOT NULL;

CREATE UNIQUE INDEX "account_webauthn_user_id_key" ON "account"("webauthn_user_id");
```

- [ ] **Step 3: Sprawdź migrację na jednorazowej bazie**

```bash
docker compose up -d
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE migration_check;"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/migration_check" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/migration_check" npx prisma migrate status
```

Expected: `migrate deploy` stosuje komplet migracji bez błędu, `migrate status` mówi „up to date".
Sprawdź, że indeks wyszukiwania przeżył:

```bash
docker compose exec -T postgres psql -U postgres -d migration_check -c "\di couple_search_text_idx"
```

Expected: indeks istnieje. Jeśli go nie ma — migracja jest błędna, nie idź dalej.
Posprzątaj: `docker compose exec -T postgres psql -U postgres -c "DROP DATABASE migration_check;"`

- [ ] **Step 4: Zastosuj na bazie deweloperskiej i wygeneruj klienta**

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

- [ ] **Step 5: Napisz test integracyjny**

Utwórz `src/lib/auth/webauthn/schema.int.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

const created: bigint[] = [];

async function account() {
  const a = await prisma.account.create({
    data: {
      email: `schema-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Testowi',
      role: 'viewer',
      status: 'active',
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);
  return a;
}

afterEach(async () => {
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

it('stores a credential and hands back the public key unchanged', async () => {
  const a = await account();
  const publicKey = randomBytes(64);

  await prisma.credential.create({
    data: {
      id: randomBytes(16).toString('base64url'),
      accountId: a.id,
      publicKey,
      transports: ['internal', 'hybrid'],
      label: 'Telefon',
    },
  });

  const stored = await prisma.credential.findFirstOrThrow({ where: { accountId: a.id } });
  expect(Buffer.from(stored.publicKey)).toEqual(publicKey);
  expect(stored.transports).toEqual(['internal', 'hybrid']);
  expect(stored.counter).toBe(0n);
});

it('takes the credentials down with the account, leaving nothing to sign in with', async () => {
  const a = await account();
  await prisma.credential.create({
    data: {
      id: randomBytes(16).toString('base64url'),
      accountId: a.id,
      publicKey: randomBytes(64),
      label: 'Telefon',
    },
  });

  await prisma.account.delete({ where: { id: a.id } });
  created.pop();

  expect(await prisma.credential.count({ where: { accountId: a.id } })).toBe(0);
});
```

- [ ] **Step 6: Uruchom test integracyjny**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/schema.int.test.ts`
Expected: PASS — 2 testy

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/auth/webauthn/schema.int.test.ts
git commit -m "feat(db): add credential and challenge tables for passkey sign-in"
```

---

### Task 3: Magazyn wyzwań

**Files:**
- Create: `src/lib/auth/webauthn/challenge.ts`
- Test: `src/lib/auth/webauthn/challenge.int.test.ts`

**Interfaces:**
- Consumes: modele z Zadania 2
- Produces:
  - `rememberChallenge(challenge: string, purpose: 'registration' | 'authentication', accountId?: bigint): Promise<void>`
  - `consumeChallenge(challenge: string, purpose: 'registration' | 'authentication'): Promise<{ accountId: bigint | null }>` — rzuca `ChallengeError`
  - `class ChallengeError extends Error`
  - `CHALLENGE_SECONDS = 60`

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/challenge.int.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ChallengeError, consumeChallenge, rememberChallenge } from './challenge';

function value() {
  return randomBytes(32).toString('base64url');
}

it('gives back what was remembered', async () => {
  const c = value();
  await rememberChallenge(c, 'authentication');
  await expect(consumeChallenge(c, 'authentication')).resolves.toEqual({ accountId: null });
});

it('carries the account through a registration', async () => {
  const a = await prisma.account.create({
    data: {
      email: `chal-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Testowi',
      role: 'viewer',
      status: 'pending',
      webauthnUserId: value(),
    },
  });
  const c = value();
  await rememberChallenge(c, 'registration', a.id);

  await expect(consumeChallenge(c, 'registration')).resolves.toEqual({ accountId: a.id });
  await prisma.account.delete({ where: { id: a.id } });
});

it('spends a challenge once, so a recorded response cannot be replayed', async () => {
  const c = value();
  await rememberChallenge(c, 'authentication');
  await consumeChallenge(c, 'authentication');
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses a challenge issued for the other ceremony', async () => {
  const c = value();
  await rememberChallenge(c, 'registration');
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses one that has expired', async () => {
  const c = value();
  await prisma.webauthnChallenge.create({
    data: { challenge: c, purpose: 'authentication', expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(consumeChallenge(c, 'authentication')).rejects.toThrow(ChallengeError);
});

it('refuses one nobody issued', async () => {
  await expect(consumeChallenge(value(), 'authentication')).rejects.toThrow(ChallengeError);
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/challenge.int.test.ts`
Expected: FAIL — `Failed to resolve import "./challenge"`

- [ ] **Step 3: Napisz implementację**

Utwórz `src/lib/auth/webauthn/challenge.ts`:

```ts
import type { ChallengePurpose } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

/**
 * A WebAuthn signature proves possession of a key over a value the server
 * chose. That only means anything if the server picked the value, has not
 * accepted it before, and picked it recently — so the value lives here rather
 * than in a cookie, and is deleted the moment it is spent.
 */

export const CHALLENGE_SECONDS = 60;

export class ChallengeError extends Error {
  constructor() {
    // One message for every failure: unknown, expired, spent, and issued for
    // the other ceremony are the same event from the browser's side, and
    // telling them apart would only help somebody probing.
    super('Sesja logowania wygasła — spróbuj jeszcze raz');
    this.name = 'ChallengeError';
  }
}

export async function rememberChallenge(
  challenge: string,
  purpose: ChallengePurpose,
  accountId?: bigint,
): Promise<void> {
  await prisma.webauthnChallenge.create({
    data: {
      challenge,
      purpose,
      accountId: accountId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000),
    },
  });
}

export async function consumeChallenge(
  challenge: string,
  purpose: ChallengePurpose,
): Promise<{ accountId: bigint | null }> {
  // DELETE ... RETURNING in one statement rather than find-then-delete: the
  // delete IS the claim on the challenge, so two requests racing on the same
  // value cannot both win it, and the account id still comes back. Prisma's
  // deleteMany cannot return the deleted row, which is why this is raw SQL.
  const rows = await prisma.$queryRaw<{ account_id: bigint | null }[]>`
    DELETE FROM "webauthn_challenge"
    WHERE "challenge" = ${challenge}
      AND "purpose" = ${purpose}::"ChallengePurpose"
      AND "expires_at" > NOW()
    RETURNING "account_id"
  `;

  const row = rows[0];
  if (!row) throw new ChallengeError();
  return { accountId: row.account_id };
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/challenge.int.test.ts`
Expected: PASS — 6 testów

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/webauthn/challenge.ts src/lib/auth/webauthn/challenge.int.test.ts
git commit -m "feat(auth): store WebAuthn challenges server-side, single use"
```

---

### Task 4: Reguła licznika podpisów

**Files:**
- Create: `src/lib/auth/webauthn/policy.ts`
- Test: `src/lib/auth/webauthn/policy.test.ts`

**Interfaces:**
- Produces: `checkCounter(stored: bigint, received: bigint): void` — rzuca `ClonedKeyError`; `class ClonedKeyError extends Error`

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ClonedKeyError, checkCounter } from './policy';

describe('checkCounter', () => {
  it('accepts a counter that moved forward', () => {
    expect(() => checkCounter(4n, 5n)).not.toThrow();
  });

  it('rejects one that stood still: the same assertion was replayed', () => {
    expect(() => checkCounter(5n, 5n)).toThrow(ClonedKeyError);
  });

  it('rejects one that went backwards: the authenticator was cloned', () => {
    expect(() => checkCounter(5n, 4n)).toThrow(ClonedKeyError);
  });

  it('accepts zero against zero, because synced passkeys never count', () => {
    // Apple and Google platform authenticators always report zero: the key
    // lives on several devices at once, so a monotonic counter is meaningless.
    // A naive "must increase" rule would lock out nearly every user we have.
    expect(() => checkCounter(0n, 0n)).not.toThrow();
  });

  it('still rejects a drop to zero from a counting authenticator', () => {
    expect(() => checkCounter(7n, 0n)).toThrow(ClonedKeyError);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run src/lib/auth/webauthn/policy.test.ts`
Expected: FAIL — `Failed to resolve import "./policy"`

- [ ] **Step 3: Napisz implementację**

Utwórz `src/lib/auth/webauthn/policy.ts`:

```ts
/**
 * Our own rules, kept apart from the library's so they are visible and tested.
 * SimpleWebAuthn checks the counter too; this stays because the rule is
 * load-bearing and a library upgrade that loosened it must not do so silently.
 */

export class ClonedKeyError extends Error {
  constructor() {
    super('Klucz został odrzucony — zgłoś to administratorowi');
    this.name = 'ClonedKeyError';
  }
}

/**
 * A signature counter that fails to advance means the same assertion came
 * twice, or the authenticator was copied. Both are refusals.
 *
 * The exception is an authenticator that does not count at all and reports
 * zero every time — which is what every synced passkey does, because the key
 * exists on several devices and no single one of them holds the true count.
 */
export function checkCounter(stored: bigint, received: bigint): void {
  if (stored === 0n && received === 0n) return;
  if (received <= stored) throw new ClonedKeyError();
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run src/lib/auth/webauthn/policy.test.ts`
Expected: PASS — 5 testów

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/webauthn/policy.ts src/lib/auth/webauthn/policy.test.ts
git commit -m "feat(auth): reject a signature counter that does not advance"
```

---

### Task 5: Ceremonia rejestracji — warstwa domenowa

**Files:**
- Create: `src/lib/auth/webauthn/register.ts`
- Test: `src/lib/auth/webauthn/register.int.test.ts`

**Interfaces:**
- Consumes: `rpConfig`, `RP_NAME` (Task 1); `rememberChallenge`, `consumeChallenge`, `ChallengeError` (Task 3)
- Produces:
  - `registrationOptions(accountId: bigint): Promise<PublicKeyCredentialCreationOptionsJSON>`
  - `saveCredential(accountId: bigint, verified: VerifiedCredential): Promise<void>` — transakcja: klucz + `active` + zerowanie zaproszenia + audyt
  - `type VerifiedCredential = { id: string; publicKey: Uint8Array; counter: bigint; transports: string[]; label: string }`
  - `labelFor(attachment: string | undefined, transports: string[]): string`

- [ ] **Step 1: Napisz test etykiety i opcji, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/register.int.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { labelFor, registrationOptions, saveCredential } from './register';

const created: bigint[] = [];

beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function pendingAccount() {
  const token = randomBytes(32).toString('base64url');
  const a = await prisma.account.create({
    data: {
      email: `reg-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      status: 'pending',
      webauthnUserId: randomBytes(32).toString('base64url'),
      inviteTokenHash: token,
      inviteExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  created.push(a.id);
  return a;
}

it('asks for a discoverable key and for the user to be verified', async () => {
  const a = await pendingAccount();
  const options = await registrationOptions(a.id);

  // Discoverable, so the sign-in screen needs no e-mail field at all.
  expect(options.authenticatorSelection?.residentKey).toBe('required');
  // Without this the passkey stops being two factors and the whole design
  // argument collapses. It is not a detail to leave at its default.
  expect(options.authenticatorSelection?.userVerification).toBe('required');
  expect(options.rp.id).toBe('kartoteka.oazagdansk.pl');
});

it('remembers the challenge it just handed out', async () => {
  const a = await pendingAccount();
  const options = await registrationOptions(a.id);

  const stored = await prisma.webauthnChallenge.findUnique({
    where: { challenge: options.challenge },
  });
  expect(stored?.accountId).toBe(a.id);
  expect(stored?.purpose).toBe('registration');
});

it('offers the keys already registered, so the same device is not stored twice', async () => {
  const a = await pendingAccount();
  await prisma.credential.create({
    data: {
      id: 'already-here',
      accountId: a.id,
      publicKey: randomBytes(64),
      transports: ['internal'],
      label: 'Telefon',
    },
  });

  const options = await registrationOptions(a.id);
  expect(options.excludeCredentials?.map((c) => c.id)).toEqual(['already-here']);
});

it('activates the account, spends the invitation and audits, all at once', async () => {
  const a = await pendingAccount();

  await saveCredential(a.id, {
    id: 'new-key',
    publicKey: randomBytes(64),
    counter: 0n,
    transports: ['internal'],
    label: 'Ten komputer',
  });

  const after = await prisma.account.findUniqueOrThrow({ where: { id: a.id } });
  expect(after.status).toBe('active');
  expect(after.inviteTokenHash).toBeNull();
  expect(after.inviteExpiresAt).toBeNull();

  expect(await prisma.credential.count({ where: { accountId: a.id } })).toBe(1);

  const audit = await prisma.audit.findFirst({
    where: { accountId: a.id, kind: 'account' },
    orderBy: { at: 'desc' },
  });
  expect(audit?.description).toContain('klucz');
});

it('names a key by how it will be reached next time', () => {
  expect(labelFor('platform', ['internal'])).toBe('To urządzenie');
  expect(labelFor('cross-platform', ['hybrid'])).toBe('Telefon');
  expect(labelFor('cross-platform', ['usb'])).toBe('Kluczyk USB');
  expect(labelFor(undefined, [])).toBe('Klucz dostępu');
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/register.int.test.ts`
Expected: FAIL — `Failed to resolve import "./register"`

- [ ] **Step 3: Napisz implementację**

Utwórz `src/lib/auth/webauthn/register.ts`:

```ts
import {
  type PublicKeyCredentialCreationOptionsJSON,
  generateRegistrationOptions,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { prisma } from '@/lib/db';
import { rememberChallenge } from './challenge';
import { RP_NAME, rpConfig } from './config';

export type VerifiedCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[];
  label: string;
};

/**
 * The list in /account has to distinguish one key from another, and nobody
 * wants to read "internal" there. The guess is deliberately coarse; the point
 * is a starting name the person can change, not accuracy.
 */
export function labelFor(attachment: string | undefined, transports: string[]): string {
  if (transports.includes('usb') || transports.includes('nfc')) return 'Kluczyk USB';
  if (transports.includes('hybrid')) return 'Telefon';
  if (attachment === 'platform' || transports.includes('internal')) return 'To urządzenie';
  return 'Klucz dostępu';
}

export async function registrationOptions(
  accountId: bigint,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = rpConfig();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { email: true, name: true, webauthnUserId: true },
  });

  const existing = await prisma.credential.findMany({
    where: { accountId },
    select: { id: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // Opaque and stored on the authenticator; the WebAuthn spec forbids
    // anything personal here. The name and display name below are the
    // readable half, and they are what the picker shows the person.
    userID: isoBase64URL.toBuffer(account.webauthnUserId),
    userName: account.email,
    userDisplayName: account.name,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      // Discoverable, so signing in needs no e-mail field — which also means
      // the form cannot be used to find out who has an account.
      residentKey: 'required',
      // Load-bearing: this is the second factor. Without it a passkey is
      // possession alone.
      userVerification: 'required',
    },
  });

  await rememberChallenge(options.challenge, 'registration', accountId);
  return options;
}

/**
 * Writes the key and everything that must be true at the same moment: the
 * account becomes usable, the invitation stops working, and the history says
 * so. One transaction, per the project rule about audit.
 */
export async function saveCredential(
  accountId: bigint,
  credential: VerifiedCredential,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.credential.create({
      data: {
        id: credential.id,
        accountId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
        label: credential.label,
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: { status: 'active', inviteTokenHash: null, inviteExpiresAt: null },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Zarejestrowano klucz dostępu: „${credential.label}"`,
        accountId,
      },
    });
  });
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/register.int.test.ts`
Expected: PASS — 5 testów

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/webauthn/register.ts src/lib/auth/webauthn/register.int.test.ts
git commit -m "feat(auth): registration ceremony for a passkey"
```

---

### Task 6: Ceremonia logowania — warstwa domenowa

**Files:**
- Create: `src/lib/auth/webauthn/authenticate.ts`
- Test: `src/lib/auth/webauthn/authenticate.int.test.ts`

**Interfaces:**
- Consumes: `rpConfig` (Task 1); `rememberChallenge` (Task 3); `checkCounter`, `ClonedKeyError` (Task 4)
- Produces:
  - `authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON>`
  - `resolveCredential(credentialId: string): Promise<{ credential: …; account: … }>` — rzuca `SignInError`
  - `completeSignIn(credentialId: string, accountId: bigint, newCounter: bigint): Promise<string>` — zwraca surowy token sesji, rzuca `SignInError`
  - `class SignInError extends Error`

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/authenticate.int.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ClonedKeyError } from './policy';
import {
  SignInError,
  authenticationOptions,
  completeSignIn,
  resolveCredential,
} from './authenticate';

const created: bigint[] = [];

beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function accountWithKey(status: 'active' | 'disabled' | 'pending', counter = 0n) {
  const a = await prisma.account.create({
    data: {
      email: `auth-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      status,
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);

  const id = randomBytes(16).toString('base64url');
  await prisma.credential.create({
    data: { id, accountId: a.id, publicKey: randomBytes(64), counter, label: 'Telefon' },
  });
  return { account: a, credentialId: id };
}

it('asks for no particular key, so the browser offers whatever it holds', async () => {
  const options = await authenticationOptions();
  // Empty on purpose: naming credentials here would need an e-mail first, and
  // that would turn the sign-in form into a way of asking who has an account.
  expect(options.allowCredentials ?? []).toEqual([]);
  expect(options.userVerification).toBe('required');
  expect(options.rpId).toBe('kartoteka.oazagdansk.pl');
});

it('remembers the challenge without tying it to anybody', async () => {
  const options = await authenticationOptions();
  const stored = await prisma.webauthnChallenge.findUnique({
    where: { challenge: options.challenge },
  });
  expect(stored?.purpose).toBe('authentication');
  expect(stored?.accountId).toBeNull();
});

it('finds the account behind a key', async () => {
  const { account, credentialId } = await accountWithKey('active');
  const found = await resolveCredential(credentialId);
  expect(found.account.id).toBe(account.id);
});

it('refuses a key nobody registered', async () => {
  await expect(resolveCredential('never-seen')).rejects.toThrow(SignInError);
});

it('signs in an active account and opens a session', async () => {
  const { account, credentialId } = await accountWithKey('active');
  const token = await completeSignIn(credentialId, account.id, 1n);

  expect(token).toMatch(/^[\w-]{20,}$/);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(1);

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
  expect(key.counter).toBe(1n);
  expect(key.lastUsedAt).not.toBeNull();

  const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  expect(after.lastLoginAt).not.toBeNull();
});

it('refuses a disabled account holding a perfectly good key', async () => {
  const { account, credentialId } = await accountWithKey('disabled');
  await expect(completeSignIn(credentialId, account.id, 1n)).rejects.toThrow(SignInError);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);
});

it('refuses an account still holding an invitation', async () => {
  const { account, credentialId } = await accountWithKey('pending');
  await expect(completeSignIn(credentialId, account.id, 1n)).rejects.toThrow(SignInError);
});

it('refuses a counter that did not advance', async () => {
  const { account, credentialId } = await accountWithKey('active', 5n);
  await expect(completeSignIn(credentialId, account.id, 5n)).rejects.toThrow(ClonedKeyError);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);
});

it('lets a synced passkey through, which never counts past zero', async () => {
  const { account, credentialId } = await accountWithKey('active', 0n);
  await expect(completeSignIn(credentialId, account.id, 0n)).resolves.toBeTruthy();
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/authenticate.int.test.ts`
Expected: FAIL — `Failed to resolve import "./authenticate"`

- [ ] **Step 3: Napisz implementację**

Utwórz `src/lib/auth/webauthn/authenticate.ts`:

```ts
import {
  type PublicKeyCredentialRequestOptionsJSON,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';
import { createSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { rememberChallenge } from './challenge';
import { rpConfig } from './config';
import { checkCounter } from './policy';

export class SignInError extends Error {
  constructor() {
    // One message for everything: unknown key, disabled account, account still
    // holding an invitation. Telling them apart would answer questions the
    // sign-in screen has no business answering.
    super('Nie udało się zalogować tym kluczem');
    this.name = 'SignInError';
  }
}

export async function authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = rpConfig();

  const options = await generateAuthenticationOptions({
    rpID,
    // Deliberately empty. Listing the account's credentials would require
    // knowing the account, which would require an e-mail field, which would
    // make the form a way of discovering who has an account. Discoverable
    // credentials let the browser answer instead.
    allowCredentials: [],
    userVerification: 'required',
  });

  await rememberChallenge(options.challenge, 'authentication');
  return options;
}

export async function resolveCredential(credentialId: string) {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { account: true },
  });
  if (!credential) throw new SignInError();
  return { credential, account: credential.account };
}

/**
 * Runs after the signature has been verified. Returns the raw session token —
 * the only moment it exists outside the cookie — and the caller puts it there.
 */
export async function completeSignIn(
  credentialId: string,
  accountId: bigint,
  newCounter: bigint,
): Promise<string> {
  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential || credential.accountId !== accountId) throw new SignInError();

  // Before anything is written: a counter that failed to advance means a
  // replay or a copied authenticator.
  checkCounter(credential.counter, newCounter);

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  // Re-checked here rather than trusted from the lookup: an account disabled
  // between the challenge and the signature must not get in.
  if (account.status !== 'active') throw new SignInError();

  await prisma.$transaction([
    prisma.credential.update({
      where: { id: credentialId },
      data: { counter: newCounter, lastUsedAt: new Date() },
    }),
    prisma.account.update({ where: { id: accountId }, data: { lastLoginAt: new Date() } }),
  ]);

  return createSession(accountId);
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/authenticate.int.test.ts`
Expected: PASS — 9 testów

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/webauthn/authenticate.ts src/lib/auth/webauthn/authenticate.int.test.ts
git commit -m "feat(auth): authentication ceremony for a passkey"
```

---

### Task 7: Zarządzanie kluczami — warstwa domenowa

**Files:**
- Create: `src/lib/auth/webauthn/credentials.ts`
- Test: `src/lib/auth/webauthn/credentials.int.test.ts`

**Interfaces:**
- Produces:
  - `listCredentials(accountId: bigint): Promise<CredentialSummary[]>` gdzie `CredentialSummary = { id: string; label: string; createdAt: Date; lastUsedAt: Date | null }`
  - `renameCredential(accountId: bigint, id: string, label: string): Promise<void>`
  - `removeCredential(accountId: bigint, id: string): Promise<void>` — rzuca `LastKeyError` lub `SignInError`
  - `class LastKeyError extends Error`
  - `MAX_LABEL = 60`

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `src/lib/auth/webauthn/credentials.int.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { SignInError } from './authenticate';
import { LastKeyError, listCredentials, removeCredential, renameCredential } from './credentials';

const created: bigint[] = [];

afterEach(async () => {
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function accountWith(keys: number) {
  const a = await prisma.account.create({
    data: {
      email: `keys-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      status: 'active',
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);

  const ids: string[] = [];
  for (let i = 0; i < keys; i += 1) {
    const id = randomBytes(16).toString('base64url');
    await prisma.credential.create({
      data: { id, accountId: a.id, publicKey: randomBytes(64), label: `Klucz ${i + 1}` },
    });
    ids.push(id);
  }
  return { account: a, ids };
}

it('lists the keys without ever handing out the public key', async () => {
  const { account } = await accountWith(2);
  const list = await listCredentials(account.id);

  expect(list).toHaveLength(2);
  expect(Object.keys(list[0] ?? {})).toEqual(['id', 'label', 'createdAt', 'lastUsedAt']);
});

it('renames a key', async () => {
  const { account, ids } = await accountWith(1);
  await renameCredential(account.id, ids[0] ?? '', '  Telefon Ani  ');

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: ids[0] ?? '' } });
  expect(key.label).toBe('Telefon Ani');
});

it('removes a key when another one remains', async () => {
  const { account, ids } = await accountWith(2);
  await removeCredential(account.id, ids[0] ?? '');
  expect(await prisma.credential.count({ where: { accountId: account.id } })).toBe(1);
});

it('refuses to remove the last key, which would lock the account out', async () => {
  const { account, ids } = await accountWith(1);
  await expect(removeCredential(account.id, ids[0] ?? '')).rejects.toThrow(LastKeyError);
  expect(await prisma.credential.count({ where: { accountId: account.id } })).toBe(1);
});

it('refuses to touch a key belonging to somebody else', async () => {
  const mine = await accountWith(2);
  const theirs = await accountWith(2);

  await expect(removeCredential(mine.account.id, theirs.ids[0] ?? '')).rejects.toThrow(SignInError);
  expect(await prisma.credential.count({ where: { accountId: theirs.account.id } })).toBe(2);
});

it('writes the removal into the history in the same transaction', async () => {
  const { account, ids } = await accountWith(2);
  await removeCredential(account.id, ids[0] ?? '');

  const audit = await prisma.audit.findFirst({
    where: { accountId: account.id, kind: 'account' },
    orderBy: { at: 'desc' },
  });
  expect(audit?.description).toContain('Usunięto klucz');
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/credentials.int.test.ts`
Expected: FAIL — `Failed to resolve import "./credentials"`

- [ ] **Step 3: Napisz implementację**

Utwórz `src/lib/auth/webauthn/credentials.ts`:

```ts
import { prisma } from '@/lib/db';
import { SignInError } from './authenticate';

export const MAX_LABEL = 60;

export type CredentialSummary = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export class LastKeyError extends Error {
  constructor() {
    super('To jedyny klucz na tym koncie — dodaj drugi, zanim usuniesz ten');
    this.name = 'LastKeyError';
  }
}

export function listCredentials(accountId: bigint): Promise<CredentialSummary[]> {
  return prisma.credential.findMany({
    where: { accountId },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Every call takes the account id and filters by it: a credential id arrives
 * from the browser, so it says which key, never whose. */
async function ownedOrThrow(accountId: bigint, id: string) {
  const key = await prisma.credential.findFirst({ where: { id, accountId } });
  if (!key) throw new SignInError();
  return key;
}

export async function renameCredential(
  accountId: bigint,
  id: string,
  rawLabel: string,
): Promise<void> {
  await ownedOrThrow(accountId, id);
  const label = rawLabel.trim().slice(0, MAX_LABEL) || 'Klucz dostępu';
  await prisma.credential.update({ where: { id }, data: { label } });
}

export async function removeCredential(accountId: bigint, id: string): Promise<void> {
  const key = await ownedOrThrow(accountId, id);

  // Checked on the server, not merely hidden in the interface: a server action
  // is a public POST endpoint, and this is the guard against an account
  // locking itself out, not a cosmetic one.
  const remaining = await prisma.credential.count({ where: { accountId } });
  if (remaining <= 1) throw new LastKeyError();

  await prisma.$transaction(async (tx) => {
    await tx.credential.delete({ where: { id } });
    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Usunięto klucz dostępu: „${key.label}"`,
        accountId,
      },
    });
  });
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/auth/webauthn/credentials.int.test.ts`
Expected: PASS — 6 testów

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/webauthn/credentials.ts src/lib/auth/webauthn/credentials.int.test.ts
git commit -m "feat(auth): manage an account's passkeys, refusing to drop the last"
```

---

### Task 8: Strona zaproszenia — rejestracja klucza

**Files:**
- Modify: `src/app/(auth)/invite/[token]/actions.ts`
- Modify: `src/app/(auth)/invite/[token]/InviteForm.tsx`
- Modify: `src/app/(auth)/invite/[token]/page.tsx`
- Modify: `src/lib/accounts/manage.ts` (`redeemInvite`)

**Interfaces:**
- Consumes: `registrationOptions`, `saveCredential`, `labelFor` (Task 5); `consumeChallenge` (Task 3); `rpConfig` (Task 1)
- Produces: server actions `beginEnrollment(token: string)`, `finishEnrollment(token: string, response: RegistrationResponseJSON)`

- [ ] **Step 1: Przepisz `redeemInvite` w `src/lib/accounts/manage.ts`**

Funkcja przestaje przyjmować hasło i przestaje aktywować konto — aktywacja przeszła do `saveCredential` (Task 5), bo musi być w jednej transakcji z zapisem klucza. Zostaje wyłącznie sprawdzenie tokenu:

```ts
/**
 * Checks the invitation and says whose it is. It no longer activates anything:
 * the account becomes usable at the moment a key is stored, and that has to be
 * one transaction with the key itself.
 */
export async function accountForInvite(token: string): Promise<bigint> {
  const account = await prisma.account.findFirst({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, inviteExpiresAt: true },
  });
  if (!account) throw new InviteError('Zaproszenie jest nieprawidłowe lub zostało już użyte');
  if (!account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
    throw new InviteError('Zaproszenie wygasło — poproś o nowe');
  }
  return account.id;
}
```

Usuń dotychczasową `redeemInvite` oraz import `hashPassword` i `MIN_PASSWORD_LENGTH`. Zaktualizuj `src/lib/accounts/manage.int.test.ts`: testy `redeemInvite` zamień na testy `accountForInvite` (poprawny token → id, token wygasły → `InviteError`, token nieznany → `InviteError`).

- [ ] **Step 2: Przepisz `src/app/(auth)/invite/[token]/actions.ts`**

```ts
'use server';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { InviteError, accountForInvite } from '@/lib/accounts/manage';
import { setSessionCookie } from '@/lib/auth/requireUser';
import { createSession } from '@/lib/auth/session';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import { labelFor, registrationOptions, saveCredential } from '@/lib/auth/webauthn/register';

export type EnrollState = { error?: string };

/** The challenge the browser actually signed, read back out of the response so
 * the server can look up the row it issued. */
function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

export async function beginEnrollment(
  token: string,
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON } | EnrollState> {
  try {
    const accountId = await accountForInvite(token);
    return { options: await registrationOptions(accountId) };
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }
}

export async function finishEnrollment(
  token: string,
  response: RegistrationResponseJSON,
): Promise<EnrollState> {
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);

  try {
    const accountId = await accountForInvite(token);

    const { accountId: challengeOwner } = await consumeChallenge(challenge, 'registration');
    // The challenge was issued for one account; a response carrying somebody
    // else's is not a registration we asked for.
    if (challengeOwner !== accountId) return { error: 'Nie udało się zarejestrować klucza' };

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // The whole design rests on this: without user verification a passkey is
      // possession alone, not two factors.
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Nie udało się zarejestrować klucza' };
    }

    const { credential } = verification.registrationInfo;
    await saveCredential(accountId, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      label: labelFor(response.authenticatorAttachment, credential.transports ?? []),
    });

    // createSession directly, NOT completeSignIn: that one guards against a
    // counter which failed to advance, and a key registered a line ago has by
    // definition not advanced past the value just stored. The signature has
    // already been verified here, so there is nothing left for it to check.
    //
    // Signed in at all because the old flow's reasoning is gone: it made the
    // person type the new password once more before trusting it, and a
    // signature repeated proves nothing. This is also the only moment we know
    // they are at the screen, which is where the second-key prompt belongs.
    await setSessionCookie(await createSession(accountId));
    return {};
  } catch (e) {
    if (e instanceof InviteError || e instanceof ChallengeError) return { error: e.message };
    throw e;
  }
}
```

- [ ] **Step 3: Przepisz `InviteForm.tsx`**

```tsx
'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { beginEnrollment, finishEnrollment } from './actions';
import style from '../../login/login.module.css';

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Asked before anything is offered: a button that cannot work is worse than
  // a sentence explaining why, and this is the moment we can tell.
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  async function enrol() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginEnrollment(token);
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się rozpocząć');
        return;
      }
      const response = await startRegistration({ optionsJSON: begun.options });
      const done = await finishEnrollment(token, response);
      if (done.error) {
        setError(done.error);
        return;
      }
      router.push('/account?welcome=1');
    } catch {
      // Includes the person closing the system dialog, which is not an error
      // worth alarming them about.
      setError('Nie udało się utworzyć klucza. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <p className={style.error} role="alert">
        Ta przeglądarka nie obsługuje kluczy dostępu. Otwórz ten link w telefonie
        albo w aktualnej wersji Chrome lub Edge. Jeśli to nie pomoże, skontaktuj
        się z administratorem kartoteki.
      </p>
    );
  }

  return (
    <div className={style.form}>
      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={style.button} onClick={enrol} disabled={busy}>
        {busy ? 'Tworzenie klucza…' : 'Utwórz klucz'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Popraw tekst na `page.tsx`**

W `src/app/(auth)/invite/[token]/page.tsx` zamień akapit `style.lead`:

```tsx
          <p className={style.lead}>
            {`Utwórz klucz dostępu — potwierdzisz go odciskiem palca albo PIN-em
            urządzenia. Hasła nie będzie. Link działa raz i wygasa po ${INVITE_DAYS} dniach.`}
          </p>
```

- [ ] **Step 5: Sprawdź ręcznie w przeglądarce**

```bash
npm run dev
```

W Chrome otwórz DevTools → More tools → WebAuthn → **Enable virtual authenticator environment**, dodaj uwierzytelniacz z `Supports resident keys` i `Supports user verification` włączonymi. Wygeneruj link zaproszenia (na razie: `npx tsx -e "…"` albo z interfejsu `/accounts` zalogowany hasłem — hasło jeszcze działa) i przejdź ścieżkę.

Expected: przycisk „Utwórz klucz" tworzy klucz, przeglądarka ląduje na `/account`, konto jest `active`, w bazie jest wiersz `credential`.

- [ ] **Step 6: Uruchom testy i lint**

```bash
npm test
npm run test:int
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(auth\)/invite src/lib/accounts/manage.ts src/lib/accounts/manage.int.test.ts
git commit -m "feat(invite): enrol a passkey instead of setting a password"
```

---

### Task 9: Strona logowania

**Files:**
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/app/(auth)/login/LoginForm.tsx`
- Modify: `src/app/(auth)/login/page.tsx` (tekst wprowadzający)

**Interfaces:**
- Consumes: `authenticationOptions`, `resolveCredential`, `completeSignIn`, `SignInError` (Task 6); `consumeChallenge` (Task 3)
- Produces: server actions `beginSignIn()`, `finishSignIn(response: AuthenticationResponseJSON)`

- [ ] **Step 1: Przepisz `src/app/(auth)/login/actions.ts`**

Usuń komplet: `schema`, `GENERIC_ERROR`, `decoyHash`, `decoy()`, `signIn`. W ich miejsce:

```ts
'use server';

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { redirect } from 'next/navigation';
import { setSessionCookie } from '@/lib/auth/requireUser';
import {
  SignInError,
  authenticationOptions,
  completeSignIn,
  resolveCredential,
} from '@/lib/auth/webauthn/authenticate';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import { ClonedKeyError } from '@/lib/auth/webauthn/policy';
import { clearAttempts, isRateLimited, recordAttempt } from '@/lib/auth/rateLimit';
import { headers } from 'next/headers';

export type LoginState = { error?: string };

function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

/**
 * The counter is per address, never global: one shared bucket would mean the
 * fifteen accounts locking each other out. The sign-in form no longer asks for
 * an e-mail, so the address is the only key left — and the right one, since
 * what is being limited is challenge rows, not guesses at a secret.
 */
async function limitKey(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return `ip:${forwarded?.split(',')[0]?.trim() ?? 'unknown'}`;
}

export async function beginSignIn(): Promise<
  { options: PublicKeyCredentialRequestOptionsJSON } | LoginState
> {
  // A signature is not guessable, so this no longer defends the password it
  // once did. It stays to keep the challenge table from being flooded.
  const key = await limitKey();
  if (await isRateLimited(key)) {
    return { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' };
  }
  await recordAttempt(key);
  return { options: await authenticationOptions() };
}

export async function finishSignIn(response: AuthenticationResponseJSON): Promise<LoginState> {
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);

  try {
    await consumeChallenge(challenge, 'authentication');
    const { credential, account } = await resolveCredential(response.id);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as never,
      },
      // The second factor. Never leave this at its default.
      requireUserVerification: true,
    });

    if (!verification.verified) throw new SignInError();

    const token = await completeSignIn(
      credential.id,
      account.id,
      BigInt(verification.authenticationInfo.newCounter),
    );
    await setSessionCookie(token);
    // Whoever got in is not the traffic the limiter is for. Without this a
    // couple signing in from one address every week would eventually meet
    // their own earlier attempts.
    await clearAttempts(await limitKey());
  } catch (e) {
    if (e instanceof SignInError || e instanceof ChallengeError || e instanceof ClonedKeyError) {
      return { error: e.message };
    }
    throw e;
  }

  // A signature that arrived from another device means this one was reached by
  // scanning a QR code — the hardest path we offer, and the one nobody wants
  // to repeat weekly. The response says so, so we can catch that moment and
  // offer to store a key here instead. Redirecting to /account rather than
  // showing a banner over the list keeps the offer next to the button that
  // acts on it.
  redirect(crossDevice ? '/account?crossDevice=1' : '/couples');
}
```

`crossDevice` policz przed blokiem `try`, zaraz po `challenge`:

```ts
  const crossDevice = response.authenticatorAttachment === 'cross-platform';
```

- [ ] **Step 2: Przepisz `LoginForm.tsx`**

```tsx
'use client';

import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { useEffect, useState } from 'react';
import { beginSignIn, finishSignIn } from './actions';
import style from './login.module.css';

export function LoginForm() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginSignIn();
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się zalogować');
        return;
      }
      const response = await startAuthentication({ optionsJSON: begun.options });
      const done = await finishSignIn(response);
      if (done?.error) setError(done.error);
    } catch {
      setError('Nie udało się zalogować. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <p className={style.error} role="alert">
        Ta przeglądarka nie obsługuje kluczy dostępu. Otwórz kartotekę w telefonie
        albo w aktualnej wersji Chrome lub Edge.
      </p>
    );
  }

  return (
    <div className={style.form}>
      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={style.button} onClick={signIn} disabled={busy}>
        {busy ? 'Logowanie…' : 'Zaloguj się kluczem'}
      </button>
      <p className={style.hint}>
        Nie masz klucza na tym urządzeniu? W oknie, które się pojawi, wybierz
        „Użyj innego urządzenia" i zeskanuj kod telefonem.
      </p>
    </div>
  );
}
```

Dodaj klasę `.hint` do `src/app/(auth)/login/login.module.css`. Kolor przez token, odstęp i rozmiar pisma literałem — tak jak w sąsiednich regułach tego pliku:

```css
.hint {
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
```

- [ ] **Step 3: Sprawdź ręcznie**

Z włączonym wirtualnym uwierzytelniaczem w DevTools i kontem, które przeszło Zadanie 8: `/login` → „Zaloguj się kluczem" → `/couples`.

- [ ] **Step 4: Uruchom testy i lint**

```bash
npm test
npm run test:int
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/login
git commit -m "feat(login): sign in with a passkey and no e-mail field"
```

---

### Task 10: `/account` — lista kluczy

**Files:**
- Create: `src/app/(app)/account/KeyList.tsx`
- Delete: `src/app/(app)/account/PasswordForm.tsx`
- Modify: `src/app/(app)/account/actions.ts`
- Modify: `src/app/(app)/account/page.tsx`
- Modify: `src/app/(app)/account/account.module.css`

**Interfaces:**
- Consumes: `listCredentials`, `renameCredential`, `removeCredential`, `LastKeyError` (Task 7); `registrationOptions`, `saveCredential`, `labelFor` (Task 5)
- Produces: server actions `beginAddKey()`, `finishAddKey(response)`, `renameKeyAction(id, label)`, `removeKeyAction(id)`

- [ ] **Step 1: Przepisz `src/app/(app)/account/actions.ts`**

Usuń `changePasswordAction` i import `changeOwnPassword`. Dodaj cztery akcje. **Każda zaczyna się od `requireUser()`** — server action jest publicznym endpointem POST, a tutaj sesja jest zarazem odpowiedzią na pytanie, czyj to klucz:

```ts
'use server';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/requireUser';
import { ChallengeError, consumeChallenge } from '@/lib/auth/webauthn/challenge';
import { rpConfig } from '@/lib/auth/webauthn/config';
import { LastKeyError, removeCredential, renameCredential } from '@/lib/auth/webauthn/credentials';
import { labelFor, registrationOptions, saveCredential } from '@/lib/auth/webauthn/register';

export type KeyState = { error?: string };

function challengeOf(clientDataJSON: string): string {
  const data = JSON.parse(isoBase64URL.toUTF8String(clientDataJSON)) as { challenge: string };
  return data.challenge;
}

export async function beginAddKey(): Promise<
  { options: PublicKeyCredentialCreationOptionsJSON } | KeyState
> {
  const u = await requireUser();
  return { options: await registrationOptions(u.id) };
}

export async function finishAddKey(response: RegistrationResponseJSON): Promise<KeyState> {
  const u = await requireUser();
  const { rpID, origin } = rpConfig();
  const challenge = challengeOf(response.response.clientDataJSON);

  try {
    const { accountId } = await consumeChallenge(challenge, 'registration');
    if (accountId !== u.id) return { error: 'Nie udało się dodać klucza' };

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Nie udało się dodać klucza' };
    }

    const { credential } = verification.registrationInfo;
    await saveCredential(u.id, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      label: labelFor(response.authenticatorAttachment, credential.transports ?? []),
    });
  } catch (e) {
    if (e instanceof ChallengeError) return { error: e.message };
    throw e;
  }

  revalidatePath('/account');
  return {};
}

export async function renameKeyAction(id: string, label: string): Promise<KeyState> {
  const u = await requireUser();
  await renameCredential(u.id, id, label);
  revalidatePath('/account');
  return {};
}

export async function removeKeyAction(id: string): Promise<KeyState> {
  const u = await requireUser();
  try {
    await removeCredential(u.id, id);
  } catch (e) {
    if (e instanceof LastKeyError) return { error: e.message };
    throw e;
  }
  revalidatePath('/account');
  return {};
}
```

- [ ] **Step 2: Napisz `KeyList.tsx`**

Utwórz `src/app/(app)/account/KeyList.tsx`:

```tsx
'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useState } from 'react';
import type { CredentialSummary } from '@/lib/auth/webauthn/credentials';
import { formatDate } from '@/lib/pl';
import { beginAddKey, finishAddKey, removeKeyAction, renameKeyAction } from './actions';
import style from './account.module.css';

type Props = {
  keys: CredentialSummary[];
  /** Just enrolled from an invitation. */
  welcome: boolean;
  /** Signed in by scanning a QR code, so no key lives on this device yet. */
  crossDevice: boolean;
};

export function KeyList({ keys, welcome, crossDevice }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function addKey() {
    setBusy(true);
    setError(null);
    try {
      const begun = await beginAddKey();
      if (!('options' in begun)) {
        setError(begun.error ?? 'Nie udało się dodać klucza');
        return;
      }
      const response = await startRegistration({ optionsJSON: begun.options });
      const done = await finishAddKey(response);
      if (done.error) setError(done.error);
    } catch {
      setError('Nie udało się dodać klucza. Spróbuj jeszcze raz.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const done = await removeKeyAction(id);
    if (done.error) setError(done.error);
  }

  async function rename(id: string, label: string) {
    setEditing(null);
    await renameKeyAction(id, label);
  }

  // role="status" rather than role="alert": this is advice, and a screen
  // reader interrupting for it would be wrong.
  const notice = crossDevice
    ? 'Zalogowano kodem QR, więc na tym komputerze nie ma jeszcze klucza. Dodaj go, a następnym razem wejdziesz jednym dotknięciem.'
    : welcome
      ? 'Klucz utworzony. Dodaj teraz drugie urządzenie — to jedyny moment, w którym masz to z głowy.'
      : keys.length === 1
        ? 'Masz zapisany jeden klucz. Dodaj drugi, żeby nie stracić dostępu przy wymianie telefonu.'
        : null;

  return (
    <section className={style.card}>
      <h2 className={style.title}>Klucze dostępu</h2>

      {notice && (
        <p className={style.notice} role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className={style.error} role="alert">
          {error}
        </p>
      )}

      <button type="button" className={style.button} onClick={addKey} disabled={busy}>
        {busy ? 'Dodawanie…' : 'Dodaj urządzenie'}
      </button>

      <ul className={style.keys}>
        {keys.map((key) => (
          <li key={key.id} className={style.key}>
            {editing === key.id ? (
              <form
                className={style.rename}
                action={(data) => rename(key.id, String(data.get('label') ?? ''))}
              >
                <label className={style.srOnly} htmlFor={`label-${key.id}`}>
                  Nazwa klucza
                </label>
                <input
                  className={style.input}
                  id={`label-${key.id}`}
                  name="label"
                  defaultValue={key.label}
                  maxLength={60}
                  autoFocus
                />
                <button type="submit" className={style.linkButton}>
                  Zapisz
                </button>
              </form>
            ) : (
              <>
                <span className={style.keyLabel}>{key.label}</span>
                <span className={style.keyMeta}>
                  {`dodany ${formatDate(key.createdAt)} · `}
                  {key.lastUsedAt
                    ? `ostatnie użycie ${formatDate(key.lastUsedAt)}`
                    : 'jeszcze nieużywany'}
                </span>
                <button
                  type="button"
                  className={style.linkButton}
                  onClick={() => setEditing(key.id)}
                >
                  Zmień nazwę
                </button>
                <button
                  type="button"
                  className={style.linkButton}
                  onClick={() => remove(key.id)}
                >
                  Usuń
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Sprawdź w `src/lib/pl/index.ts`, czy `formatDate` jest stamtąd reeksportowany; jeśli nie, importuj z `@/lib/pl/format`.

- [ ] **Step 2a: Dopisz style do `account.module.css`**

Klasy `.notice`, `.keys`, `.key`, `.keyLabel`, `.keyMeta`, `.rename`, `.linkButton`, `.srOnly`. Kolory, promienie i cienie przez `var(--…)`; odstępy i rozmiar pisma literałem, dopasowane do reguł już obecnych w tym pliku. Wzór dla paska:

```css
.notice {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--warn-border);
  border-radius: var(--r-8);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 13px;
}
```

`.srOnly` to standardowa klasa ukrywająca etykietę wzrokowo — jeśli taka już istnieje w projekcie, użyj jej zamiast dopisywać drugą.

- [ ] **Step 3: Przepisz `page.tsx`**

Strona woła `requireUser()`, pobiera `listCredentials(u.id)` i renderuje listę. Usuń `PasswordForm` z importów i z drzewa; nagłówek „Hasło" zastępuje „Klucze dostępu" wewnątrz `KeyList`.

```tsx
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; crossDevice?: string }>;
}) {
  const u = await requireUser();
  const { welcome, crossDevice } = await searchParams;
  const keys = await listCredentials(u.id);

  return (
    <KeyList keys={keys} welcome={welcome === '1'} crossDevice={crossDevice === '1'} />
  );
}
```

Zachowaj resztę strony (karta konta, nazwa, rola) taką, jaka jest — zmienia się wyłącznie sekcja hasła.

- [ ] **Step 4: Usuń `PasswordForm.tsx`**

```bash
git rm src/app/\(app\)/account/PasswordForm.tsx
```

- [ ] **Step 5: Sprawdź ręcznie**

Zalogowany kluczem: dodaj drugie urządzenie (w DevTools dodaj drugi wirtualny uwierzytelniacz), zmień nazwę, usuń jeden, spróbuj usunąć ostatni.
Expected: usunięcie ostatniego odrzucone z komunikatem; pasek zachęty znika po dodaniu drugiego klucza.

- [ ] **Step 6: Uruchom testy i lint**

```bash
npm test && npm run test:int && npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/account
git commit -m "feat(account): manage passkeys where the password form used to be"
```

---

### Task 11: Konta rejonów — przekazanie kasuje klucze, „Nowy klucz…" zamiast „Nowe hasło…"

**Files:**
- Modify: `src/lib/accounts/manage.ts:254` (`handOverRegion`)
- Modify: widok `/accounts` — plik z przyciskiem „Nowe hasło…" (znajdź: `grep -rn 'Nowe hasło' src/`)
- Test: `src/lib/accounts/manage.int.test.ts`

Przekazanie rejonu to jedyne miejsce, gdzie pominięcie zmiany **niczego nie psuje widocznie** — dostęp po prostu zostaje u niewłaściwych osób. Stąd osobne zadanie i test obowiązkowy.

- [ ] **Step 1: Napisz test, który ma nie przejść**

Dopisz do `src/lib/accounts/manage.int.test.ts`:

```ts
it('takes the outgoing couple keys away, or they would still sign in', async () => {
  // The account stays; a different couple sits down at it. A key left behind
  // is the outgoing couple keeping the region's records.
  const { admin, regionAccount } = await regionSetup();
  await prisma.credential.create({
    data: {
      id: randomBytes(16).toString('base64url'),
      accountId: regionAccount.id,
      publicKey: randomBytes(64),
      label: 'Telefon ustępującej pary',
    },
  });

  await handOverRegion(admin, regionAccount.id, 'Nowacy', 'nowacy@example.pl');

  expect(await prisma.credential.count({ where: { accountId: regionAccount.id } })).toBe(0);
});
```

Dopasuj `regionSetup()` do pomocników już istniejących w tym pliku — nie dopisuj drugiego, jeśli jest równoważny.

- [ ] **Step 2: Uruchom test i potwierdź, że nie przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/accounts/manage.int.test.ts -t 'outgoing couple'`
Expected: FAIL — `expected 1 to be 0`

- [ ] **Step 3: Popraw `handOverRegion`**

W transakcji, przed `tx.account.update`, dodaj:

```ts
    // A different couple takes over this account. The outgoing couple's key
    // would otherwise keep working at the new address — the same reasoning
    // that used to clear the password hash, which no longer exists.
    await tx.credential.deleteMany({ where: { accountId: id } });
```

Usuń z `data` linię `passwordHash: null` wraz z jej komentarzem — kolumna znika w Zadaniu 12, a wartość i tak nic już nie znaczy.

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run --config vitest.int.config.mts src/lib/accounts/manage.int.test.ts`
Expected: PASS — cały plik

- [ ] **Step 5: Zmień nazwę przycisku na `/accounts`**

```bash
grep -rn 'Nowe hasło' src/ e2e/
```

Zamień etykietę i wszystkie teksty jej towarzyszące (podpowiedzi, potwierdzenia, komunikaty po wykonaniu) na wariant o kluczu: **„Nowy klucz…"**. Mechanika `createInvite` zostaje nietknięta — zmienia się wyłącznie to, co czyta człowiek. Popraw też zdanie wyjaśniające: dotychczasowy klucz działa do chwili użycia linku, a żeby zabrać dostęp od razu, trzeba najpierw „Wyłącz".

Popraw znalezione wystąpienia w `e2e/` — te pliki i tak przechodzą przez Zadanie 14, ale nazwa musi się zgadzać już teraz, żeby zestaw był zielony na tym commicie.

- [ ] **Step 6: Uruchom testy i lint**

```bash
npm test && npm run test:int && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/accounts/manage.ts src/lib/accounts/manage.int.test.ts src/app e2e
git commit -m "fix(accounts): revoke the outgoing couple's keys, offer a key not a password"
```

---

### Task 12: Usunięcie hasła, migracja B, sesja 7 dni

**Files:**
- Delete: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`
- Modify: `src/lib/accounts/self.ts`, `src/lib/accounts/self.int.test.ts`
- Modify: `src/lib/accounts/policy.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/rateLimit.ts` (komentarz)
- Modify: `prisma/schema.prisma`, `package.json`
- Create: `prisma/migrations/20260821140000_drop_password/migration.sql`

- [ ] **Step 1: Usuń warstwę haseł**

```bash
git rm src/lib/auth/password.ts src/lib/auth/password.test.ts
```

Z `src/lib/accounts/self.ts` usuń `changeOwnPassword` i `PasswordError` wraz z importami `hashPassword`, `verifyPassword`, `MIN_PASSWORD_LENGTH`. Jeśli plik zostaje pusty — usuń go i usuń `self.int.test.ts`; jeśli zostaje w nim cokolwiek, zostaw plik i wytnij tylko testy hasła.

Z `src/lib/accounts/policy.ts` usuń `MIN_PASSWORD_LENGTH`. `INVITE_DAYS` i `MAX_ACCOUNT_NAME` zostają.

```bash
npm uninstall @node-rs/argon2
```

- [ ] **Step 2: Skróć sesję**

W `src/lib/auth/session.ts` zamień:

```ts
export const SESSION_DAYS = 30;
```

na:

```ts
/**
 * Seven rather than thirty: a stolen session cookie is now the shortest way in,
 * since there is no password to leak. Signing in again costs one touch of a
 * reader, so the narrower window is nearly free — which it would not have been
 * with a password or a six-digit code.
 */
export const SESSION_DAYS = 7;
```

Ciasteczko w `requireUser.ts` bierze tę stałą samo — nie zmieniaj go.

- [ ] **Step 3: Popraw komentarz w `rateLimit.ts`**

Nagłówkowy komentarz opisuje obronę hasła. Zamień na jedno zdanie: licznik chroni już tylko przed zaśmiecaniem tabeli wyzwań, bo podpisu kryptograficznego nie zgaduje się metodą prób. Progi bez zmian.

- [ ] **Step 4: Usuń `passwordHash` ze schematu i napisz migrację B**

W `prisma/schema.prisma` usuń z modelu `Account` linię `passwordHash String? @map("password_hash")`.

Utwórz `prisma/migrations/20260821140000_drop_password/migration.sql`:

```sql
-- The password is gone from the application: sign-in is a passkey and nothing
-- else. Dropped only now, after the key ceremonies work end to end, so that no
-- commit in between left the installation unable to log in.
--
-- Written by hand. `prisma migrate dev` reads the generated `search_text`
-- columns as drift and would drop `couple_search_text_idx` along with this.
ALTER TABLE "account" DROP COLUMN "password_hash";
```

- [ ] **Step 5: Sprawdź migrację na jednorazowej bazie, potem zastosuj**

```bash
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE migration_check;"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/migration_check" npx prisma migrate deploy
docker compose exec -T postgres psql -U postgres -d migration_check -c "\di couple_search_text_idx"
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE migration_check;"
npx prisma migrate deploy && npx prisma generate && npx prisma migrate status
```

Expected: indeks wyszukiwania istnieje, `migrate status` mówi „up to date".

- [ ] **Step 6: Uruchom komplet i napraw, co się posypie**

```bash
npm test && npm run test:int && npm run lint && npm run build
```

Spodziewane błędy kompilacji: każde miejsce nadal czytające `passwordHash`. Usuń je — nie obchodź.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): drop passwords from the schema and the code"
```

---

### Task 13: Skrypty i seed

**Files:**
- Create: `scripts/key-reset.mts`
- Modify: `scripts/create-superadmin.mts`, `scripts/retention.mts`, `prisma/seed.ts`, `package.json`

- [ ] **Step 1: Przepisz `scripts/create-superadmin.mts`**

Usuń `ADMIN_PASSWORD`, `MIN_PASSWORD_LENGTH` i `hashPassword`. Konto powstaje jako `pending` z tokenem zaproszenia; skrypt wypisuje link. Popraw komentarz na górze pliku — obiecuje dziś „zmień hasło po pierwszym zalogowaniu". Odmowa utworzenia drugiego konta technicznego zostaje.

```ts
const token = randomBytes(32).toString('base64url');

const account = await prisma.account.create({
  data: {
    email,
    name,
    role: 'superadmin',
    status: 'pending',
    webauthnUserId: randomBytes(32).toString('base64url'),
    inviteTokenHash: createHash('sha256').update(token).digest('hex'),
    inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  },
});

console.log(`Utworzono konto techniczne: ${account.email}`);
console.log(`Otwórz link i utwórz klucz: ${process.env.APP_URL}/invite/${token}`);
console.log('Zaraz potem dodaj drugi klucz na telefonie — patrz docs/DEPLOYMENT.md.');
```

Użyj tej samej funkcji skrótu, co `manage.ts` (`hashToken`) — wyeksportuj ją stamtąd zamiast powielać.

- [ ] **Step 2: Napisz `scripts/key-reset.mts`**

```ts
/**
 * Issues a one-time link so somebody who lost every key can register a new one.
 *
 *   npm run key:reset -- adres@example.pl
 *
 * The way back in when the interface cannot help: the last remaining admin with
 * no working key, or the very first sign-in after an install. Whoever runs this
 * has a shell on the server and could reach the database directly anyway, so no
 * further permission is checked.
 *
 * Deliberately does NOT revoke the existing keys. The usual reason for running
 * it is a lost phone, and a lost phone still needs its owner's PIN to be of use
 * to anybody. To cut access off at once, disable the account first.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { INVITE_DAYS } from '../src/lib/accounts/policy';
import { hashToken } from '../src/lib/accounts/manage';
import { prisma } from '../src/lib/db';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Podaj adres: npm run key:reset -- adres@example.pl');
  }

  const account = await prisma.account.findUnique({ where: { email } });
  if (!account) throw new Error(`Nie ma konta o adresie ${email}`);

  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: account.id },
      data: {
        // Issuing a new invitation invalidates the previous one.
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Wydano link do nowego klucza z konsoli serwera: ${email}`,
        // Nobody was signed in. Audit.accountId is nullable, so the row does
        // not have to pretend somebody was.
        accountId: null,
      },
    });
  });

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  console.log(`Link ważny ${INVITE_DAYS} dni — przekaż go osobiście, nie mailem:`);
  console.log(`  ${appUrl}/invite/${token}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

Wyeksportuj `hashToken` z `src/lib/accounts/manage.ts` (dziś jest prywatna) zamiast powielać funkcję skrótu w skrypcie — dwie implementacje, które muszą się zgadzać, prędzej czy później się rozjadą.

Dopisz do `package.json`: `"key:reset": "tsx scripts/key-reset.mts"`.

- [ ] **Step 3: Rozszerz `scripts/retention.mts`**

Dopisz kasowanie wygasłych wyzwań:

```ts
const challenges = await prisma.webauthnChallenge.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});
console.log(`Wygasłe wyzwania WebAuthn: ${challenges.count}`);
```

Dopisz test do `scripts/retention.int.test.ts`: wyzwanie z `expiresAt` w przeszłości znika, świeże zostaje.

- [ ] **Step 4: Przepisz `prisma/seed.ts`**

Konta powstają jako `pending`, każde z `webauthnUserId` i tokenem zaproszenia. Na końcu skrypt wypisuje linki:

```ts
console.log('\nKonta czekają na klucz. Otwórz link i utwórz klucz w DevTools →');
console.log('More tools → WebAuthn → Enable virtual authenticator environment.\n');
for (const { email, token } of invites) {
  console.log(`  ${email.padEnd(28)} http://localhost:3000/invite/${token}`);
}
```

Usuń stałą z hasłem `kartoteka123`.

- [ ] **Step 5: Uruchom seed i sprawdź**

```bash
npm run db:reset
npm run db:seed
```

Expected: 300 par, 11 rejonów, konta `pending`, na końcu lista linków.

- [ ] **Step 6: Uruchom testy**

```bash
npm test && npm run test:int
```

- [ ] **Step 7: Commit**

```bash
git add scripts prisma/seed.ts package.json package-lock.json
git commit -m "feat(scripts): bootstrap and reset accounts with a one-time key link"
```

---

### Task 14: Testy end-to-end

**Files:**
- Create: `e2e/support/signIn.ts`, `e2e/passkey.spec.ts`
- Delete: `e2e/password.spec.ts`, `e2e/prepare.ts`
- Modify: sześć plików `e2e/*.spec.ts`, `package.json`, `playwright.config.ts`

- [ ] **Step 1: Napisz wspólnego pomocnika**

Utwórz `e2e/support/signIn.ts`. Siedem plików ma dziś własną kopię `signIn` wpisującą pole „Hasło"; to jest moment, w którym przestaje ich być siedem.

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Chromium exposes a virtual authenticator over CDP that signs exactly like a
 * real one, so the whole ceremony runs without hardware. Resident keys and
 * user verification are both on, because that is what the application asks
 * for — an authenticator without them would be refused, which is the point of
 * the test in passkey.spec.ts.
 */
export async function addAuthenticator(page: Page): Promise<string> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

/** Follows an invitation to its end: a key exists and the account is signed in. */
export async function enrol(page: Page, token: string): Promise<void> {
  await page.goto(`/invite/${token}`);
  await page.getByRole('button', { name: 'Utwórz klucz' }).click();
  await expect(page).toHaveURL(/\/account/);
}

export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();
  await expect(page).toHaveURL(/\/couples/);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/login/);
}
```

- [ ] **Step 2: Napisz `e2e/support/invites.ts`**

Testy potrzebują świeżego zaproszenia dla konta z seeda. Czyta bazę przez Prismę, tak jak robił to `prepare.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { INVITE_DAYS } from '@/lib/accounts/policy';
import { hashToken } from '@/lib/accounts/manage';
import { prisma } from '@/lib/db';

/** Puts a fresh invitation on a seeded account and returns its raw token. */
export async function inviteFor(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.account.update({
    where: { email },
    data: {
      status: 'pending',
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.credential.deleteMany({ where: { account: { email } } });
  return token;
}
```

- [ ] **Step 2a: Napisz `e2e/passkey.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { addAuthenticator, enrol, signIn, signOut } from './support/signIn';
import { inviteFor } from './support/invites';

const EMAIL = 'rejon7@example.pl';

test('an invitation ends in a key, a session, and a nudge for the second one', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));

  // Enrolling signs the person in: the signature was just verified, so making
  // them prove it again would prove nothing.
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText('Dodaj teraz drugie urządzenie')).toBeVisible();
});

test('signs back in with the key alone, with no address to type', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));
  await page.goto('/couples');
  await signOut(page);

  // No e-mail field exists, which is also why the form cannot be used to ask
  // who has an account.
  await expect(page.getByLabel('Adres e-mail')).toHaveCount(0);
  await signIn(page);
});

test('a second key can be added, after which the first can go', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));

  await expect(page.getByRole('listitem')).toHaveCount(1);
  // Removing the only key would lock the account out, so it is refused.
  await page.getByRole('button', { name: 'Usuń' }).first().click();
  await expect(page.getByRole('alert')).toContainText('jedyny klucz');

  await addAuthenticator(page);
  await page.getByRole('button', { name: 'Dodaj urządzenie' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: 'Usuń' }).first().click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('refuses an authenticator that does not verify its user', async ({ page }) => {
  // The load-bearing test of the whole design. A passkey counts as two factors
  // because the key is unlocked by a PIN or a fingerprint; an authenticator
  // that skips that is possession alone, and must not get in.
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));
  await signOut(page);

  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: false,
      isUserVerified: false,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
```

Jeśli `enrol` z Kroku 1 kończy się na `/account`, a trzeci test potrzebuje tam zostać — nie nawiguj z niego nigdzie indziej. Numer wiersza w `getByRole('listitem')` zależy od tego, czy `KeyList` renderuje inne listy na tej stronie; jeśli tak, zawęź selektor do `page.getByRole('list', { name: … })` z etykietą dopisaną w Zadaniu 10.

- [ ] **Step 3: Przepisz sześć pozostałych plików**

`accessibility.spec.ts`, `admin-views.spec.ts`, `card.spec.ts`, `export-import.spec.ts`, `list.spec.ts`, `login.spec.ts`: usuń lokalne `signIn`/`signOut` i stałą `PASSWORD`, importuj z `./support/signIn`.

Dotychczasowe `signIn(page, 'admin@example.pl')` przyjmowało adres, a nowe nie — o tym, na które konto się wchodzi, decyduje teraz to, czyj klucz jest w uwierzytelniaczu. Wzorzec zamiany: tam gdzie test logował się na konkretne konto, poprzedź go rejestracją klucza tego konta.

```ts
import { expect, test } from '@playwright/test';
import { addAuthenticator, enrol, signIn, signOut } from './support/signIn';
import { inviteFor } from './support/invites';

/** Signs in as one particular account: enrols a key for it, which leaves the
 * browser signed in, so nothing else is needed. */
async function signInAs(page: Page, email: string) {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(email));
  await page.goto('/couples');
}
```

Wstaw ten pomocnik do `e2e/support/signIn.ts` i używaj go wszędzie, gdzie stało `signIn(page, adres)`. Testy w `login.spec.ts` sprawdzające błędne hasło zamień na sprawdzenie, że bez zarejestrowanego klucza logowanie nie dochodzi do skutku: `/login`, kliknięcie przycisku, oczekiwany `role="alert"` i adres nadal `/login`.

Uwaga na kolejność: `inviteFor` kasuje klucze konta, więc dwa testy logujące się na to samo konto muszą to robić każdy u siebie, nie w współdzielonym `beforeAll`. Przy `fullyParallel: false` i jednym workerze to jest bezpieczne, ale tylko dopóki nikt nie włączy równoległości.

- [ ] **Step 4: Usuń `password.spec.ts` i `prepare.ts`**

```bash
git rm e2e/password.spec.ts e2e/prepare.ts
```

W `package.json` skróć skrypt `e2e` do `"tsx prisma/seed.ts && playwright test"`. W `playwright.config.ts` usuń `testIgnore: ['**/prepare.ts']`.

- [ ] **Step 5: Uruchom komplet e2e**

```bash
npm run e2e
```

Expected: wszystkie testy przechodzą. Jeśli sypie się na czasie — `expect.timeout` jest już 15 s; nie podnoś go bez powodu, sprawdź, czy przyczyną nie jest brak `automaticPresenceSimulation`.

- [ ] **Step 6: Commit**

```bash
git add -A e2e playwright.config.ts package.json
git commit -m "test(e2e): drive sign-in through a virtual authenticator"
```

---

### Task 15: Dokumentacja

**Files:**
- Modify: `docs/DEPLOYMENT.md`, `docs/STATUS.md`, `AGENTS.md`, `.env.example`

- [ ] **Step 1: `docs/DEPLOYMENT.md`**

Dopisz sekcję o pierwszym uruchomieniu wg §10.2 specyfikacji: DNS, `APP_URL`, `migrate deploy`, `create-superadmin`, rejestracja klucza, **drugi klucz na telefonie**, zakładanie kont, pilotaż na dwóch–trzech osobach. Dopisz użycie `npm run key:reset` i zdanie, którego tam dziś nie ma:

> **Zmiana domeny unieważnia wszystkie klucze dostępu** i oznacza rozesłanie kompletu nowych zaproszeń. Klucz jest przywiązany do `kartoteka.oazagdansk.pl` nieodwracalnie.

- [ ] **Step 2: `docs/STATUS.md`**

Zamień w „Co działa" opis logowania hasłem na logowanie kluczem. Usuń konta testowe z hasłem `kartoteka123` — zastąp instrukcją o linkach z seeda i wirtualnym uwierzytelniaczu w DevTools. Zaktualizuj sekcję o zmianie hasła pod `/account` i o resecie hasła na `/accounts`.

- [ ] **Step 3: `AGENTS.md`**

W „Pułapkach tego środowiska" dopisz dwie pozycje:

- klucz dostępu jest przywiązany do domeny — klucz z `localhost` nie zadziała na produkcji i odwrotnie, co przy debugowaniu wygląda jak zepsute logowanie;
- po `npm run db:reset` konta nie mają kluczy — seed wypisuje linki zaproszeń, a klucz rejestruje się przez wirtualny uwierzytelniacz w DevTools.

- [ ] **Step 4: `.env.example`**

Dopisz `APP_URL` z komentarzem, że to jedyne źródło zakresu kluczy i że w trybie produkcyjnym jej brak zatrzymuje start.

- [ ] **Step 5: Uruchom komplet weryfikacji**

```bash
npm test && npm run test:int && npm run lint && npm run build && npm run e2e
```

- [ ] **Step 6: Commit**

```bash
git add docs AGENTS.md .env.example
git commit -m "docs: record passkey sign-in, first run, and the domain trap"
```
