-- A region may now hold several accounts: the couple responsible for it, and
-- the helpers it asks to keep the registry up to date. They differ in nothing
-- a permission reads - a helper edits the same couples - only in who the
-- regions overview names and whose account "Przekaż rejon" hands over.
--
-- Written by hand. `prisma migrate dev` reads the generated `search_text`
-- columns as drift and would drop the trigram index along with this.
ALTER TABLE "account" ADD COLUMN "region_lead" BOOLEAN NOT NULL DEFAULT false;

-- Every region account that exists today is its region's responsible couple.
UPDATE "account" SET "region_lead" = true WHERE "role" = 'region';

-- Only a region account can lead a region.
ALTER TABLE "account" ADD CONSTRAINT account_region_lead_role
  CHECK (NOT "region_lead" OR "role" = 'region');

-- One responsible couple per region. Helpers are not counted and not limited.
CREATE UNIQUE INDEX "account_region_lead_key" ON "account" ("region_id") WHERE "region_lead";
