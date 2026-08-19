import type { Prisma } from '@/generated/prisma/client';
import { type User, assertCanEdit, canChangeRegion, canDelete, canRestore, Forbidden } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import type { SaveInput } from './schema';

export class MissingParish extends Error {
  constructor(message = 'Nowy krąg wymaga parafii') {
    super(message);
    this.name = 'MissingParish';
  }
}

export class NotFound extends Error {
  constructor(message = 'Nie znaleziono pary') {
    super(message);
    this.name = 'NotFound';
  }
}

/**
 * Never mention `searchText` here. Those columns are GENERATED ALWAYS:
 * Postgres computes them and rejects any attempt to write them.
 */
function coupleFields(c: SaveInput['couple']) {
  return {
    wifeName: c.wifeName,
    husbandName: c.husbandName,
    surname: c.surname,
    email: c.email,
    phone: c.phone,
    regionId: c.regionId,
    children: c.children,
    notes: c.notes,
  };
}

/** Resolves the combobox state into ids, creating the new entity when asked. */
async function resolveRelations(
  tx: Prisma.TransactionClient,
  c: SaveInput['couple'],
): Promise<{ circleId: bigint | null; parishId: bigint | null }> {
  let parishId = c.parishId === null ? null : BigInt(c.parishId);

  if (c.newParish) {
    const parish = await tx.parish.upsert({
      where: { name_city: { name: c.newParish.name, city: c.newParish.city } },
      update: {},
      create: c.newParish,
    });
    parishId = parish.id;
  }

  let circleId = c.circleId === null ? null : BigInt(c.circleId);

  if (c.newCircle) {
    // A circle must belong to a parish. When the row does not name one, it
    // inherits the parish this same save just resolved or created.
    const circleParishId =
      c.newCircle.parishId !== null ? BigInt(c.newCircle.parishId) : parishId;
    if (circleParishId === null) {
      throw new MissingParish();
    }

    const circle = await tx.circle.upsert({
      where: { regionId_number: { regionId: c.regionId, number: c.newCircle.number } },
      update: {},
      create: {
        regionId: c.regionId,
        number: c.newCircle.number,
        patron: c.newCircle.patron,
        parishId: circleParishId,
      },
    });
    circleId = circle.id;
  }

  return { circleId, parishId };
}

function coupleLabel(c: SaveInput['couple']): string {
  const names = [c.wifeName, c.husbandName].filter(Boolean).join(' i ');
  return names ? `${names} ${c.surname}` : c.surname;
}

export async function createCouple(u: User, data: SaveInput): Promise<bigint> {
  assertCanEdit(u, { regionId: data.couple.regionId });

  return prisma.$transaction(async (tx) => {
    const { circleId, parishId } = await resolveRelations(tx, data.couple);

    const couple = await tx.couple.create({
      data: {
        ...coupleFields(data.couple),
        circleId,
        parishId,
        retreats: { create: data.retreats },
      },
    });

    // Same transaction as the change itself: a couple must never exist
    // without the audit entry that records who added it.
    await tx.audit.create({
      data: {
        kind: 'create',
        description: `Dodano parę ${coupleLabel(data.couple)}`,
        accountId: u.id,
        coupleId: couple.id,
      },
    });

    return couple.id;
  });
}

export async function updateCouple(u: User, id: bigint, data: SaveInput): Promise<void> {
  const existing = await prisma.couple.findFirst({
    where: { id, deletedAt: null },
    select: { regionId: true },
  });
  if (!existing) throw new NotFound();

  // Two checks, not one: the user must be allowed to touch the couple as it is
  // now, and also allowed to put it where the form wants to put it.
  assertCanEdit(u, { regionId: existing.regionId });
  if (data.couple.regionId !== existing.regionId && !canChangeRegion(u)) {
    throw new Forbidden('Nie możesz przenieść pary do innego rejonu');
  }
  assertCanEdit(u, { regionId: data.couple.regionId });

  await prisma.$transaction(async (tx) => {
    const { circleId, parishId } = await resolveRelations(tx, data.couple);

    await tx.couple.update({
      where: { id },
      data: { ...coupleFields(data.couple), circleId, parishId },
    });

    // The form owns the whole list, so the stored entries are replaced rather
    // than merged — otherwise a removed row would quietly survive.
    await tx.retreat.deleteMany({ where: { coupleId: id } });
    if (data.retreats.length > 0) {
      await tx.retreat.createMany({
        data: data.retreats.map((r) => ({ ...r, coupleId: id })),
      });
    }

    await tx.audit.create({
      data: {
        kind: 'edit',
        description: `Zmieniono dane pary ${coupleLabel(data.couple)}`,
        accountId: u.id,
        coupleId: id,
      },
    });
  });
}

/**
 * Puts a soft-deleted couple back on the lists. The counterpart deleteCouple
 * always implied — the record is kept precisely so a misclick can be undone —
 * and the piece that was missing until somebody asked how to undo one.
 *
 * Nothing is rebuilt: soft deletion only ever set a timestamp, so clearing it
 * restores the record whole, retreats and all.
 */
export async function restoreCouple(u: User, id: bigint): Promise<void> {
  const couple = await prisma.couple.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { regionId: true, surname: true, wifeName: true, husbandName: true },
  });
  if (!couple) throw new NotFound();
  if (!canRestore(u, { regionId: couple.regionId })) throw new Forbidden();

  await prisma.$transaction(async (tx) => {
    await tx.couple.update({ where: { id }, data: { deletedAt: null } });

    await tx.audit.create({
      data: {
        kind: 'edit',
        description:
          `Przywrócono parę ${couple.wifeName} i ${couple.husbandName} ${couple.surname}`,
        accountId: u.id,
        coupleId: id,
      },
    });
  });
}

export async function deleteCouple(u: User, id: bigint): Promise<void> {
  const couple = await prisma.couple.findFirst({
    where: { id, deletedAt: null },
    select: { regionId: true, surname: true, wifeName: true, husbandName: true },
  });
  if (!couple) throw new NotFound();
  if (!canDelete(u, { regionId: couple.regionId })) throw new Forbidden();

  await prisma.$transaction(async (tx) => {
    // Soft delete: a region account can misclick, and the record holds a
    // family's history. Permanent removal is a separate, admin-only action
    // arriving in Plan 6.
    await tx.couple.update({ where: { id }, data: { deletedAt: new Date() } });

    await tx.audit.create({
      data: {
        kind: 'delete',
        description: `Usunięto parę ${couple.wifeName} i ${couple.husbandName} ${couple.surname}`,
        accountId: u.id,
        coupleId: id,
      },
    });
  });
}
