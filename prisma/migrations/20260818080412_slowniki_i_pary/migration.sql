-- CreateEnum
CREATE TYPE "RodzajRekolekcji" AS ENUM ('ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II', 'PILOTOWANIE', 'ORD', 'INNE');

-- CreateTable
CREATE TABLE "rejon" (
    "id" SMALLINT NOT NULL,
    "numer_rzym" TEXT NOT NULL,

    CONSTRAINT "rejon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parafia" (
    "id" BIGSERIAL NOT NULL,
    "nazwa" TEXT NOT NULL,
    "miasto" TEXT NOT NULL,

    CONSTRAINT "parafia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "krag" (
    "id" BIGSERIAL NOT NULL,
    "rejon_id" SMALLINT NOT NULL,
    "numer" SMALLINT NOT NULL,
    "patron" TEXT,
    "parafia_id" BIGINT NOT NULL,

    CONSTRAINT "krag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "para" (
    "id" BIGSERIAL NOT NULL,
    "imie_zony" TEXT NOT NULL,
    "imie_meza" TEXT NOT NULL,
    "nazwisko" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "rejon_id" SMALLINT NOT NULL,
    "krag_id" BIGINT,
    "parafia_id" BIGINT,
    "dzieci" TEXT,
    "notatki" TEXT,
    "utworzono" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zmieniono" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuniete_at" TIMESTAMPTZ(6),

    CONSTRAINT "para_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rekolekcje" (
    "id" BIGSERIAL NOT NULL,
    "para_id" BIGINT NOT NULL,
    "rodzaj" "RodzajRekolekcji" NOT NULL,
    "rok" SMALLINT NOT NULL,
    "miejsce" TEXT,
    "nazwa" TEXT,

    CONSTRAINT "rekolekcje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parafia_nazwa_miasto_key" ON "parafia"("nazwa", "miasto");

-- CreateIndex
CREATE UNIQUE INDEX "krag_rejon_id_numer_key" ON "krag"("rejon_id", "numer");

-- CreateIndex
CREATE INDEX "para_rejon_id_idx" ON "para"("rejon_id");

-- CreateIndex
CREATE INDEX "para_nazwisko_idx" ON "para"("nazwisko");

-- CreateIndex
CREATE INDEX "rekolekcje_para_id_idx" ON "rekolekcje"("para_id");

-- CreateIndex
CREATE INDEX "rekolekcje_rodzaj_idx" ON "rekolekcje"("rodzaj");

-- AddForeignKey
ALTER TABLE "krag" ADD CONSTRAINT "krag_rejon_id_fkey" FOREIGN KEY ("rejon_id") REFERENCES "rejon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "krag" ADD CONSTRAINT "krag_parafia_id_fkey" FOREIGN KEY ("parafia_id") REFERENCES "parafia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "para" ADD CONSTRAINT "para_rejon_id_fkey" FOREIGN KEY ("rejon_id") REFERENCES "rejon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "para" ADD CONSTRAINT "para_krag_id_fkey" FOREIGN KEY ("krag_id") REFERENCES "krag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "para" ADD CONSTRAINT "para_parafia_id_fkey" FOREIGN KEY ("parafia_id") REFERENCES "parafia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekolekcje" ADD CONSTRAINT "rekolekcje_para_id_fkey" FOREIGN KEY ("para_id") REFERENCES "para"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
