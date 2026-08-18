import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// Prisma 7 makes driver adapters mandatory. The datasource URL in
// prisma.config.ts serves the CLI (migrations, generate); the runtime client
// needs its own connection, passed here.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Brak zmiennej DATABASE_URL — skopiuj .env.example do .env');
}

// Next.js hot-reloads modules in development, which would otherwise open a
// new connection pool on every edit until Postgres refuses them.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
