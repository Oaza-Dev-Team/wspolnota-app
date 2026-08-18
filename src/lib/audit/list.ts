import type { AuditKind } from '@/generated/prisma/enums';
import { Forbidden, type User, canReadAudit } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/pl';

export const AUDIT_PAGE_SIZE = 50;

export type AuditRow = {
  id: string;
  at: string;
  kind: AuditKind;
  description: string;
  author: string;
};

export async function auditPage(
  u: User,
  page: number,
): Promise<{ rows: AuditRow[]; total: number }> {
  if (!canReadAudit(u)) throw new Forbidden('Historia zmian jest dostępna tylko dla administratora');

  const [records, total] = await Promise.all([
    prisma.audit.findMany({
      // By id, not by timestamp: entries written in the same transaction share
      // a timestamp, and only the id gives them a stable order.
      orderBy: { id: 'desc' },
      skip: (Math.max(1, page) - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        at: true,
        kind: true,
        description: true,
        account: { select: { name: true } },
      },
    }),
    prisma.audit.count(),
  ]);

  return {
    total,
    rows: records.map((r) => ({
      id: String(r.id),
      at: formatDate(r.at),
      kind: r.kind,
      description: r.description,
      // The account may have been removed; the entry outlives it on purpose.
      author: r.account?.name ?? 'konto usunięte',
    })),
  };
}
