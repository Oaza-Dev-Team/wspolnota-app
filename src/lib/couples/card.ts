import type { RetreatKind } from '@/generated/prisma/enums';
import { type User, canEdit, canPurge } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';

export type FormationEntry = {
  kind: RetreatKind;
  year: string;
  place: string;
  name: string;
};

export type CardData = {
  id: string;
  wifeName: string;
  husbandName: string;
  surname: string;
  email: string;
  phone: string;
  regionId: number;
  circleId: string | null;
  parishId: string | null;
  children: string;
  notes: string;
  retreats: FormationEntry[];
};

// Everything crosses into a client component and feeds uncontrolled inputs,
// where null would flip an input to controlled and trigger a React warning.
const asText = (v: string | null): string => v ?? '';

export async function loadCard(
  u: User,
  id: bigint,
): Promise<{ card: CardData; editable: boolean; deleted: boolean } | null> {
  const couple = await prisma.couple.findFirst({
    // A soft-deleted record stays reachable for whoever may erase it for good;
    // for everyone else it is gone, which is what soft deletion is for.
    where: canPurge(u) ? { id } : { id, deletedAt: null },
    select: {
      id: true, wifeName: true, husbandName: true, surname: true,
      email: true, phone: true, regionId: true, circleId: true, parishId: true,
      children: true, notes: true, deletedAt: true,
      retreats: {
        select: { kind: true, year: true, place: true, name: true },
        orderBy: { year: 'asc' },
      },
    },
  });
  if (!couple) return null;

  return {
    // A deleted record is a museum piece: it can be erased, not corrected.
    editable: couple.deletedAt === null && canEdit(u, { regionId: couple.regionId }),
    deleted: couple.deletedAt !== null,
    card: {
      id: String(couple.id),
      wifeName: asText(couple.wifeName),
      husbandName: asText(couple.husbandName),
      surname: couple.surname,
      email: asText(couple.email),
      phone: asText(couple.phone),
      regionId: couple.regionId,
      circleId: couple.circleId === null ? null : String(couple.circleId),
      parishId: couple.parishId === null ? null : String(couple.parishId),
      children: asText(couple.children),
      notes: asText(couple.notes),
      retreats: couple.retreats.map((r) => ({
        kind: r.kind,
        year: String(r.year),
        place: asText(r.place),
        name: asText(r.name),
      })),
    },
  };
}

export function blankCard(u: User): CardData {
  return {
    id: '',
    wifeName: '', husbandName: '', surname: '', email: '', phone: '',
    // A region account may only ever create inside its own region, so the
    // field starts there and stays disabled.
    regionId: u.regionId ?? 1,
    circleId: null, parishId: null, children: '', notes: '',
    retreats: [],
  };
}

export async function cardOptions(regionId: number): Promise<{
  circles: { id: string; label: string }[];
  parishes: { id: string; label: string }[];
}> {
  const [circles, parishes] = await Promise.all([
    prisma.circle.findMany({
      where: { regionId },
      select: { id: true, number: true, patron: true },
      orderBy: { number: 'asc' },
    }),
    prisma.parish.findMany({
      select: { id: true, name: true, city: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return {
    circles: circles.map((c) => ({
      id: String(c.id),
      label: c.patron ? `${c.number} · ${c.patron}` : String(c.number),
    })),
    parishes: parishes.map((p) => ({
      id: String(p.id),
      label: `${p.name}, ${p.city}`,
    })),
  };
}
