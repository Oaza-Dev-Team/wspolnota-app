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

-- Prisma declares these columns as ordinary nullable text; Postgres owns them.
ALTER TABLE "para" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("nazwisko", '') || ' ' ||
      coalesce("imie_zony", '') || ' ' ||
      coalesce("imie_meza", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("telefon", '')
    ))
  ) STORED;

ALTER TABLE "parafia" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(coalesce("nazwa", '') || ' ' || coalesce("miasto", '')))
  ) STORED;

ALTER TABLE "krag" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (immutable_unaccent(lower(coalesce("patron", '')))) STORED;

-- Substring search cannot use a plain btree index; trigram can.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "para_szukajka_idx" ON "para" USING gin ("szukajka" gin_trgm_ops);
