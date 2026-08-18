import { Forbidden, type User, canPurge } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/pl';
import { NotFound } from './save';

/**
 * Permanent erasure on a data subject's request (spec §4.4). Distinct from
 * deleteCouple, which only sets deletedAt: this one leaves nothing behind that
 * could identify the family.
 *
 * The audit entries survive, stripped of the person. A register of
 * accountability that can be erased along with the record it accounts for is
 * not a register — so the rows stay, the couple reference goes, and the
 * description is replaced rather than kept.
 */
export async function purgeCouple(u: User, id: bigint): Promise<void> {
  if (!canPurge(u)) {
    throw new Forbidden('Trwałe usunięcie jest dostępne tylko dla administratora');
  }

  // Soft-deleted couples are in scope: an erasure request usually arrives
  // after the record has already been taken off the lists.
  const couple = await prisma.couple.findUnique({ where: { id }, select: { id: true } });
  if (!couple) throw new NotFound();

  const notice = `Rekord usunięty na żądanie (RODO), ${formatDate(new Date())}`;

  await prisma.$transaction(async (tx) => {
    // Anonymise before deleting: after the couple is gone there is no way left
    // to tell which entries described it.
    await tx.audit.updateMany({
      where: { coupleId: id },
      data: { coupleId: null, description: notice },
    });

    await tx.retreat.deleteMany({ where: { coupleId: id } });
    await tx.couple.delete({ where: { id } });

    // The request itself is an event worth recording — without naming anyone,
    // which would undo the erasure one line below it.
    await tx.audit.create({
      data: {
        kind: 'delete',
        description: 'Wykonano żądanie usunięcia danych (RODO)',
        accountId: u.id,
      },
    });
  });
}
