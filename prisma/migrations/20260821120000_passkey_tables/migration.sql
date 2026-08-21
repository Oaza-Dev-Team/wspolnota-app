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
