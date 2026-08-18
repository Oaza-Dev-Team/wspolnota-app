import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AuditKind } from '@/generated/prisma/enums';
import { AUDIT_PAGE_SIZE, auditPage } from '@/lib/audit/list';
import { canReadAudit } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { ENTRIES, plural } from '@/lib/pl';
import { ViewHeader } from '../ViewHeader';
import style from './audit.module.css';

const KIND_LABEL: Record<AuditKind, string> = {
  edit: 'edycja',
  create: 'dodanie',
  delete: 'usunięcie',
  export: 'eksport',
  account: 'konto',
};

function pageFrom(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await requireUser();
  // The nav hides the entry, but the address bar does not respect the nav.
  if (!canReadAudit(u)) redirect('/pary');

  const page = pageFrom((await searchParams).page);
  const { rows, total } = await auditPage(u, page);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <>
      <ViewHeader
        title="Historia zmian"
        subtitle={`Kto, co i kiedy — ${plural(total, ENTRIES)}`}
      />

      {rows.length === 0 ? (
        <p className={style.empty}>Ta strona historii jest pusta.</p>
      ) : (
        <ul className={style.container} aria-label="Wpisy historii">
          {rows.map((r) => (
            <li key={r.id} className={style.entry}>
              <span className={style.at}>{r.at}</span>
              <span className={`${style.kind} ${style[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
              <span className={style.description}>{r.description}</span>
              <span className={style.author}>{r.author}</span>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className={style.pagination} aria-label="Strony historii">
          {page > 1 && (
            <Link href={`/historia?page=${page - 1}`} className={style.pageLink}>
              ← Poprzednia
            </Link>
          )}
          <span className={style.pageCounter}>
            Strona {page} z {pages}
          </span>
          {page < pages && (
            <Link href={`/historia?page=${page + 1}`} className={style.pageLink}>
              Następna →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
