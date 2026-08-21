/** Shared between invites.ts (spec-safe, imported by Playwright) and
 * testServer.ts (tsx-only, never imported by Playwright — see its own header
 * comment). This file must stay free of any Prisma import so both sides can
 * load it. */
export const SUPPORT_SERVER_PORT = 3010;
