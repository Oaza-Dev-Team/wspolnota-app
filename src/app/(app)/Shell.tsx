import Link from 'next/link';
import type { User } from '@/lib/auth/permissions';
import { romanNumeral } from '@/lib/domain/regions';
import { type ViewKey, navItems } from '@/lib/navigation';
import style from './shell.module.css';

const ROLE_LABELS: Record<User['role'], string> = {
  admin: 'Para odpowiedzialna za wspólnotę',
  region: 'Para rejonowa',
  viewer: 'Moderator — podgląd',
};

function accountCode(u: User): string {
  if (u.role === 'admin') return 'ADM';
  if (u.role === 'viewer') return 'MOD';
  return u.regionId === null ? '—' : romanNumeral(u.regionId);
}

export function Shell({
  user,
  accountName,
  active,
  counts,
  children,
}: {
  user: User;
  accountName: string;
  active: ViewKey;
  counts: Partial<Record<ViewKey, number>>;
  children: React.ReactNode;
}) {
  return (
    <div className={style.app}>
      <nav className={style.sidebar} aria-label="Nawigacja główna">
        <div className={style.brand}>
          <span className={style.monogram} aria-hidden="true">ŚŻ</span>
          <span>
            <span className={style.brandName}>Kartoteka DK</span>
            <br />
            <span className={style.brandCaption}>Archidiec. Gdańska</span>
          </span>
        </div>

        <div className={style.nav}>
          {navItems(user).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`${style.navItem} ${item.key === active ? style.navItemActive : ''}`}
              aria-current={item.key === active ? 'page' : undefined}
            >
              <span>{item.label}</span>
              {counts[item.key] !== undefined && (
                <span className={style.count}>{counts[item.key]}</span>
              )}
            </Link>
          ))}
        </div>

        <div className={style.footer}>
          <div className={style.account}>
            <span className={style.avatar} aria-hidden="true">{accountCode(user)}</span>
            <span>
              <span className={style.accountName}>{accountName}</span>
              <br />
              <span className={style.accountRole}>{ROLE_LABELS[user.role]}</span>
            </span>
          </div>
          <form action="/wyloguj" method="post">
            <button type="submit" className={style.signOut}>Wyloguj</button>
          </form>
        </div>
      </nav>

      <main className={style.main}>{children}</main>
    </div>
  );
}
