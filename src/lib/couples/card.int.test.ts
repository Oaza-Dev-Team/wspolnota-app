import { afterAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { blankCard, cardOptions, loadCard } from './card';

const admin: User = { id: 1n, role: 'admin', regionId: null };
const regionVII: User = { id: 2n, role: 'region', regionId: 7 };
const viewer: User = { id: 3n, role: 'viewer', regionId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

async function anyCoupleIn(regionId: number): Promise<bigint> {
  const c = await prisma.couple.findFirstOrThrow({ where: { regionId, deletedAt: null } });
  return c.id;
}

describe('loadCard', () => {
  it('returns every text field as a string, never null', async () => {
    const result = await loadCard(admin, await anyCoupleIn(7));
    expect(result).not.toBeNull();
    const fields = ['wifeName', 'husbandName', 'surname', 'email', 'phone', 'children', 'notes'] as const;
    for (const field of fields) {
      expect(typeof result!.card[field], field).toBe('string');
    }
    expect(typeof result!.card.id).toBe('string');
  });

  it('returns retreat years as strings for the form inputs', async () => {
    const withRetreats = await prisma.couple.findFirstOrThrow({
      where: { deletedAt: null, retreats: { some: {} } },
      select: { id: true },
    });
    const result = await loadCard(admin, withRetreats.id);
    expect(result!.card.retreats.length).toBeGreaterThan(0);
    expect(typeof result!.card.retreats[0]!.year).toBe('string');
  });

  it('marks a couple in the account own region as editable', async () => {
    expect((await loadCard(regionVII, await anyCoupleIn(7)))!.editable).toBe(true);
  });

  it('marks a couple from another region as read-only rather than hiding it', async () => {
    // The drawer shows a read-only banner; it does not pretend the couple
    // does not exist.
    const result = await loadCard(regionVII, await anyCoupleIn(3));
    expect(result).not.toBeNull();
    expect(result!.editable).toBe(false);
  });

  it('marks everything read-only for the viewer', async () => {
    expect((await loadCard(viewer, await anyCoupleIn(7)))!.editable).toBe(false);
  });

  // On its own couple, never a seeded one: an assertion that throws between
  // the soft delete and the restore would strand a record the other suites
  // count on. That happened once; it does not get to happen twice.
  it('hides a soft-deleted couple from anyone who cannot erase it', async () => {
    const couple = await prisma.couple.create({
      data: { surname: 'Ukryci', wifeName: 'Zofia', husbandName: 'Jan', regionId: 7 },
    });
    try {
      await prisma.couple.update({
        where: { id: couple.id },
        data: { deletedAt: new Date() },
      });

      expect(await loadCard(regionVII, couple.id)).toBeNull();
      expect(await loadCard(viewer, couple.id)).toBeNull();
    } finally {
      await prisma.couple.delete({ where: { id: couple.id } });
    }
  });

  // Erasure on request has to reach a record that already left the lists.
  it('shows a soft-deleted couple to the admin, read-only', async () => {
    const couple = await prisma.couple.create({
      data: { surname: 'Odzyskani', wifeName: 'Zofia', husbandName: 'Jan', regionId: 7 },
    });
    try {
      await prisma.couple.update({
        where: { id: couple.id },
        data: { deletedAt: new Date() },
      });

      const result = await loadCard(admin, couple.id);
      expect(result).not.toBeNull();
      expect(result!.deleted).toBe(true);
      // A deleted record is a museum piece: erasable, not correctable.
      expect(result!.editable).toBe(false);
    } finally {
      await prisma.couple.delete({ where: { id: couple.id } });
    }
  });

  it('returns null for an id that does not exist', async () => {
    expect(await loadCard(admin, 999_999_999n)).toBeNull();
  });
});

describe('blankCard', () => {
  it('pins a region account to its own region', () => {
    expect(blankCard(regionVII).regionId).toBe(7);
  });

  it('starts admin on the first region', () => {
    expect(blankCard(admin).regionId).toBe(1);
  });

  it('has no entries and no ids', () => {
    const card = blankCard(admin);
    expect(card.id).toBe('');
    expect(card.retreats).toEqual([]);
    expect(card.circleId).toBeNull();
  });
});

describe('cardOptions', () => {
  it('offers the circles of the given region and every parish', async () => {
    const { circles, parishes } = await cardOptions(7);
    expect(circles.length).toBeGreaterThan(0);
    expect(parishes.length).toBeGreaterThan(0);
    expect(circles.every((c) => c.label.length > 0)).toBe(true);
  });

  it('offers only the circles of that region', async () => {
    const seven = await cardOptions(7);
    const three = await cardOptions(3);
    const idsInSeven = new Set(seven.circles.map((c) => c.id));
    expect(three.circles.some((c) => idsInSeven.has(c.id))).toBe(false);
  });
});
