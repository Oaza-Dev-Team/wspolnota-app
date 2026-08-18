-- The community turned out to have eleven regions, not the twelve the design
-- handoff describes. Region XII and everything hanging off it goes away, then
-- the range guard narrows.
--
-- Order matters: foreign keys point at rejon, so dependants are cleared first.
-- audyt.konto_id is ON DELETE SET NULL and audyt.para_id has no constraint, so
-- the audit trail survives, which is the point of keeping it.

DELETE FROM "rekolekcje" WHERE "para_id" IN (SELECT "id" FROM "para" WHERE "rejon_id" = 12);
DELETE FROM "para" WHERE "rejon_id" = 12;
DELETE FROM "krag" WHERE "rejon_id" = 12;
DELETE FROM "sesja" WHERE "konto_id" IN (SELECT "id" FROM "konto" WHERE "rejon_id" = 12);
DELETE FROM "konto" WHERE "rejon_id" = 12;
DELETE FROM "rejon" WHERE "id" = 12;

ALTER TABLE "rejon" DROP CONSTRAINT rejon_id_zakres;
ALTER TABLE "rejon" ADD CONSTRAINT rejon_id_zakres CHECK (id BETWEEN 1 AND 11);
