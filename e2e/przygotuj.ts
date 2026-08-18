// Runs before the Playwright suite, under tsx rather than Playwright's own
// loader: the generated Prisma client is ESM and Playwright loads TypeScript
// as CommonJS, which fails with "exports is not defined".
import 'dotenv/config';
import { prisma } from '@/lib/db';

/**
 * The suite deliberately submits wrong passwords, and the rate limiter allows
 * ten attempts per fifteen minutes. Without this reset the suite would start
 * failing against its own limiter after a few consecutive runs.
 */
async function main() {
  const { count } = await prisma.probaLogowania.deleteMany();
  console.log(`Wyczyszczono nieudane proby logowania: ${count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
