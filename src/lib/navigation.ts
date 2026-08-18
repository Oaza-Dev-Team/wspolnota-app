import { type User, canImport, canManageAccounts, canReadAudit } from '@/lib/auth/permissions';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { COUPLES, REGIONS_IN, plural } from '@/lib/pl';

export type ViewKey = 'couples' | 'regions' | 'accounts' | 'audit' | 'import';

export type NavItem = {
  href: string;
  label: string;
  key: ViewKey;
};

export function navItems(u: User): NavItem[] {
  // A region account manages one region, so "all couples" would be a lie —
  // it gets a single entry named after what it actually sees.
  if (u.role === 'region') {
    return [{ href: '/pary', label: 'Mój rejon', key: 'couples' }];
  }

  const items: NavItem[] = [
    { href: '/pary', label: 'Wszystkie pary', key: 'couples' },
    { href: '/rejony', label: 'Rejony', key: 'regions' },
  ];

  if (canManageAccounts(u)) {
    items.push({ href: '/konta', label: 'Konta rejonów', key: 'accounts' });
  }
  if (canReadAudit(u)) {
    items.push({ href: '/historia', label: 'Historia zmian', key: 'audit' });
  }
  if (canImport(u)) {
    items.push({ href: '/import', label: 'Import', key: 'import' });
  }
  return items;
}

export function listHeading(u: User, coupleCount: number): { title: string; subtitle: string } {
  if (u.role === 'region' && u.regionId !== null) {
    return {
      title: `Rejon ${romanNumeral(u.regionId)}`,
      subtitle: 'Twoje pary — możesz dodawać i edytować dane',
    };
  }
  return {
    title: 'Pary wspólnoty',
    subtitle: `Cała wspólnota — ${plural(coupleCount, COUPLES)} w ${plural(REGION_COUNT, REGIONS_IN)}`,
  };
}
