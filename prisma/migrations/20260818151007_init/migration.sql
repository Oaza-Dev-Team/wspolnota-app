-- CreateEnum
CREATE TYPE "RetreatKind" AS ENUM ('ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II', 'PILOTOWANIE', 'ORD', 'INNE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'region', 'viewer');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'disabled', 'pending');

-- CreateEnum
CREATE TYPE "AuditKind" AS ENUM ('edit', 'create', 'delete', 'export', 'account');

-- CreateTable
CREATE TABLE "region" (
    "id" SMALLINT NOT NULL,
    "roman_numeral" TEXT NOT NULL,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parish" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "search_text" TEXT,

    CONSTRAINT "parish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle" (
    "id" BIGSERIAL NOT NULL,
    "region_id" SMALLINT NOT NULL,
    "number" SMALLINT NOT NULL,
    "patron" TEXT,
    "parish_id" BIGINT NOT NULL,
    "search_text" TEXT,

    CONSTRAINT "circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple" (
    "id" BIGSERIAL NOT NULL,
    "wife_name" TEXT NOT NULL,
    "husband_name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "region_id" SMALLINT NOT NULL,
    "circle_id" BIGINT,
    "parish_id" BIGINT,
    "children" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "search_text" TEXT,

    CONSTRAINT "couple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retreat" (
    "id" BIGSERIAL NOT NULL,
    "couple_id" BIGINT NOT NULL,
    "kind" "RetreatKind" NOT NULL,
    "year" SMALLINT NOT NULL,
    "place" TEXT,
    "name" TEXT,

    CONSTRAINT "retreat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "region_id" SMALLINT,
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "last_login_at" TIMESTAMPTZ(6),
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "AuditKind" NOT NULL,
    "description" TEXT NOT NULL,
    "account_id" BIGINT,
    "couple_id" BIGINT,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parish_name_city_key" ON "parish"("name", "city");

-- CreateIndex
CREATE UNIQUE INDEX "circle_region_id_number_key" ON "circle"("region_id", "number");

-- CreateIndex
CREATE INDEX "couple_region_id_idx" ON "couple"("region_id");

-- CreateIndex
CREATE INDEX "couple_surname_idx" ON "couple"("surname");

-- CreateIndex
CREATE INDEX "retreat_couple_id_idx" ON "retreat"("couple_id");

-- CreateIndex
CREATE INDEX "retreat_kind_idx" ON "retreat"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_account_id_idx" ON "session"("account_id");

-- CreateIndex
CREATE INDEX "audit_at_idx" ON "audit"("at");

-- CreateIndex
CREATE INDEX "login_attempt_key_at_idx" ON "login_attempt"("key", "at");

-- AddForeignKey
ALTER TABLE "circle" ADD CONSTRAINT "circle_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle" ADD CONSTRAINT "circle_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple" ADD CONSTRAINT "couple_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple" ADD CONSTRAINT "couple_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple" ADD CONSTRAINT "couple_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retreat" ADD CONSTRAINT "retreat_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit" ADD CONSTRAINT "audit_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Below: what Prisma cannot express. Kept in the initial migration so a fresh
-- database converges to the same shape in one step.
-- ---------------------------------------------------------------------------

-- Diacritic-insensitive search: "Baginscy" must find "Bagińscy".
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Polish collation so ORDER BY surname matches localeCompare(…, 'pl').
-- Without it Postgres sorts Ł after Z while the UI sorts it after L.
ALTER TABLE "couple" ALTER COLUMN "surname" TYPE text COLLATE "pl-PL-x-icu";

-- Range and consistency guards Prisma cannot express.
ALTER TABLE "region" ADD CONSTRAINT region_id_range CHECK (id BETWEEN 1 AND 11);
ALTER TABLE "retreat" ADD CONSTRAINT retreat_year_range CHECK (year BETWEEN 1970 AND 2100);
ALTER TABLE "retreat" ADD CONSTRAINT retreat_other_needs_name
  CHECK (kind <> 'INNE' OR name IS NOT NULL);
-- A region account must name its region; admin and viewer must not.
ALTER TABLE "account" ADD CONSTRAINT account_region_matches_role
  CHECK ((role = 'region') = (region_id IS NOT NULL));

-- Most queries filter out soft-deleted rows; index only what they read.
DROP INDEX IF EXISTS "couple_region_id_idx";
CREATE INDEX "couple_region_id_idx" ON "couple" ("region_id") WHERE "deleted_at" IS NULL;

-- unaccent() is declared STABLE because it depends on a dictionary that could
-- in principle be changed. Generated columns require IMMUTABLE, so the
-- dictionary is pinned and the call wrapped. Standard Postgres workaround.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $func$ SELECT public.unaccent('public.unaccent', $1) $func$;

-- Prisma declared search_text as plain nullable text; Postgres owns it.
ALTER TABLE "couple" DROP COLUMN "search_text";
ALTER TABLE "couple" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("surname", '') || ' ' ||
      coalesce("wife_name", '') || ' ' ||
      coalesce("husband_name", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("phone", '')
    ))
  ) STORED;

ALTER TABLE "parish" DROP COLUMN "search_text";
ALTER TABLE "parish" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(coalesce("name", '') || ' ' || coalesce("city", '')))
  ) STORED;

ALTER TABLE "circle" DROP COLUMN "search_text";
ALTER TABLE "circle" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (immutable_unaccent(lower(coalesce("patron", '')))) STORED;

-- Substring search cannot use a plain btree index; trigram can.
CREATE INDEX "couple_search_text_idx" ON "couple" USING gin ("search_text" gin_trgm_ops);
