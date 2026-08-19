-- The technical account: everything an admin may do, plus the accounts an
-- admin may not touch.
--
-- Written by hand. `prisma migrate dev` wanted to drop the trigram index and
-- the defaults on the generated `search_text` columns along with this, because
-- Prisma does not model GENERATED ALWAYS columns and reads them as drift.
-- Appended rather than placed before 'admin': ordering carries no meaning here
-- (the accounts list sorts in the application), and appending keeps a fresh
-- install byte-identical to the databases that already ran this.
ALTER TYPE "Role" ADD VALUE 'superadmin';
