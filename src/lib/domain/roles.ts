import type { Role } from '@/generated/prisma/enums';

/**
 * How a role is named to the person holding it. The account list phrases the
 * same four roles from the outside ("pomocnik rejonu", "moderator"); this is
 * the second person's view of them, and both the sidebar and the account page
 * show it.
 */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Konto techniczne',
  admin: 'Para odpowiedzialna za wspólnotę',
  region: 'Para rejonowa',
  viewer: 'Moderator — podgląd',
};
