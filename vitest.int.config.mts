import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts', 'prisma/**/*.int.test.ts'],
    // Integration tests share one database; parallel files would race.
    fileParallelism: false,
    // Only Next.js loads .env on its own; these tests run outside it.
    setupFiles: ['dotenv/config'],
  },
});
