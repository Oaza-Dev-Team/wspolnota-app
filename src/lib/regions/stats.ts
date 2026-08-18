import { type User, listScope } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';

export type RegionStats = {
  id: number;
  roman: string;
  couples: number;
  circles: number;
  parishes: number;
  leadName: string | null;
};

/**
 * One pass over the couples the user may see, folded into per-region tallies.
 * Parishes are counted as effective parishes — a couple's own when set,
 * otherwise its circle's — so the figure matches what the parish filter offers.
 */
export async function regionStats(u: User): Promise<RegionStats[]> {
  const [couples, accounts] = await Promise.all([
    prisma.couple.findMany({
      where: listScope(u),
      select: {
        regionId: true,
        circleId: true,
        parishId: true,
        circle: { select: { parishId: true } },
      },
    }),
    prisma.account.findMany({
      where: { role: 'region', status: 'active' },
      select: { regionId: true, name: true },
    }),
  ]);

  const circlesPerRegion = new Map<number, Set<string>>();
  const parishesPerRegion = new Map<number, Set<string>>();
  const couplesPerRegion = new Map<number, number>();

  for (const c of couples) {
    couplesPerRegion.set(c.regionId, (couplesPerRegion.get(c.regionId) ?? 0) + 1);

    if (c.circleId !== null) {
      const set = circlesPerRegion.get(c.regionId) ?? new Set<string>();
      set.add(String(c.circleId));
      circlesPerRegion.set(c.regionId, set);
    }

    const parishId = c.parishId ?? c.circle?.parishId ?? null;
    if (parishId !== null) {
      const set = parishesPerRegion.get(c.regionId) ?? new Set<string>();
      set.add(String(parishId));
      parishesPerRegion.set(c.regionId, set);
    }
  }

  const leadByRegion = new Map(
    accounts
      .filter((a): a is typeof a & { regionId: number } => a.regionId !== null)
      .map((a) => [a.regionId, a.name]),
  );

  return Array.from({ length: REGION_COUNT }, (_, i) => {
    const id = i + 1;
    return {
      id,
      roman: romanNumeral(id),
      couples: couplesPerRegion.get(id) ?? 0,
      circles: circlesPerRegion.get(id)?.size ?? 0,
      parishes: parishesPerRegion.get(id)?.size ?? 0,
      leadName: leadByRegion.get(id) ?? null,
    };
  });
}
