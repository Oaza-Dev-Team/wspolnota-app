-- CreateEnum
CREATE TYPE "Rola" AS ENUM ('admin', 'rejon', 'podglad');

-- CreateEnum
CREATE TYPE "StatusKonta" AS ENUM ('aktywne', 'wylaczone', 'oczekuje');

-- CreateEnum
CREATE TYPE "RodzajAudytu" AS ENUM ('edycja', 'dodanie', 'usuniecie', 'eksport', 'konto');

-- CreateTable
CREATE TABLE "konto" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "hash_hasla" TEXT,
    "nazwa" TEXT NOT NULL,
    "rola" "Rola" NOT NULL,
    "rejon_id" SMALLINT,
    "status" "StatusKonta" NOT NULL DEFAULT 'oczekuje',
    "ostatnie_logowanie" TIMESTAMPTZ(6),
    "zaproszenie_token_hash" TEXT,
    "zaproszenie_wygasa" TIMESTAMPTZ(6),

    CONSTRAINT "konto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesja" (
    "id" BIGSERIAL NOT NULL,
    "konto_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "utworzono" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wygasa" TIMESTAMPTZ(6) NOT NULL,
    "ostatnia_aktywnosc" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audyt" (
    "id" BIGSERIAL NOT NULL,
    "kiedy" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rodzaj" "RodzajAudytu" NOT NULL,
    "opis" TEXT NOT NULL,
    "konto_id" BIGINT,
    "para_id" BIGINT,

    CONSTRAINT "audyt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proba_logowania" (
    "id" BIGSERIAL NOT NULL,
    "klucz" TEXT NOT NULL,
    "kiedy" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proba_logowania_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "konto_email_key" ON "konto"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sesja_token_hash_key" ON "sesja"("token_hash");

-- CreateIndex
CREATE INDEX "sesja_konto_id_idx" ON "sesja"("konto_id");

-- CreateIndex
CREATE INDEX "audyt_kiedy_idx" ON "audyt"("kiedy");

-- CreateIndex
CREATE INDEX "proba_logowania_klucz_kiedy_idx" ON "proba_logowania"("klucz", "kiedy");

-- AddForeignKey
ALTER TABLE "konto" ADD CONSTRAINT "konto_rejon_id_fkey" FOREIGN KEY ("rejon_id") REFERENCES "rejon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesja" ADD CONSTRAINT "sesja_konto_id_fkey" FOREIGN KEY ("konto_id") REFERENCES "konto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audyt" ADD CONSTRAINT "audyt_konto_id_fkey" FOREIGN KEY ("konto_id") REFERENCES "konto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A region account must name its region; admin and viewer must not.
ALTER TABLE "konto" ADD CONSTRAINT konto_rejon_zgodny_z_rola
  CHECK ((rola = 'rejon') = (rejon_id IS NOT NULL));
