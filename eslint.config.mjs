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
]);

export default eslintConfig;
