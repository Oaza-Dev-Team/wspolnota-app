import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The design handoff ships a throwaway HTML prototype and its runtime.
    // It is reference material, not source, and must never be linted or built.
    "docs/**",
    // Prisma emits TypeScript sources; they are generated, not authored.
    "src/generated/**",
  ]),
  {
    rules: {
      // A leading underscore marks a parameter kept for signature symmetry.
      // mozeEksportowac(_u) takes the user so it matches every other
      // capability check, even though the answer is the same for all roles.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);

export default eslintConfig;
