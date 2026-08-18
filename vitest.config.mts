import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves the "@/*" alias from tsconfig natively; the
  // vite-tsconfig-paths plugin is no longer needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests need a running database; they are opt-in via the
    // `int` suffix so `npm test` stays fast and offline.
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
  },
});
