/**
 * Invite policy in its own module: the client components that state these
 * numbers to the user must not import manage.ts, which pulls in node:crypto
 * and Prisma and would drag the whole write layer into the browser bundle.
 */
export const INVITE_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 10;

/** Matches the couple surname limit; both name a household. */
export const MAX_ACCOUNT_NAME = 120;
