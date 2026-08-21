-- The password is gone from the application: sign-in is a passkey and nothing
-- else. Dropped only now, after the key ceremonies work end to end, so that no
-- commit in between left the installation unable to log in.
--
-- Written by hand. `prisma migrate dev` reads the generated `search_text`
-- columns as drift and would drop `couple_search_text_idx` along with this.
ALTER TABLE "account" DROP COLUMN "password_hash";
