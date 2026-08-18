import { describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { listHeading, navItems } from './navigation';

const admin: User = { id: 1n, role: 'admin', regionId: null };
const regionVII: User = { id: 2n, role: 'region', regionId: 7 };
const viewer: User = { id: 3n, role: 'viewer', regionId: null };

describe('navItems', () => {
  // The acceptance checklist counts these exactly: admin 4, region 1, viewer 2.
  it('gives admin all four entries', () => {
    expect(navItems(admin).map((i) => i.key)).toEqual([
      'couples', 'regions', 'accounts', 'audit',
    ]);
  });

  it('gives a region account only its own list', () => {
    const items = navItems(regionVII);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ href: '/pary', label: 'Mój rejon', key: 'couples' });
  });

  it('gives the viewer the list and the regions, without administration', () => {
    expect(navItems(viewer).map((i) => i.key)).toEqual(['couples', 'regions']);
  });
});

describe('listHeading', () => {
  it('names the region for a region account', () => {
    expect(listHeading(regionVII, 27)).toEqual({
      title: 'Rejon VII',
      subtitle: 'Twoje pary — możesz dodawać i edytować dane',
    });
  });

  it('describes the whole community for admin and viewer, with inflection', () => {
    expect(listHeading(admin, 300)).toEqual({
      title: 'Pary wspólnoty',
      subtitle: 'Cała wspólnota — 300 par w 11 rejonach',
    });
    expect(listHeading(viewer, 1).subtitle).toBe('Cała wspólnota — 1 para w 11 rejonach');
  });
});
