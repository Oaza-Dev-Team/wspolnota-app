'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem, ViewKey } from '@/lib/navigation';
import style from './shell.module.css';

/**
 * The only client component in the shell. A layout in the App Router does not
 * know the current path, and threading it down from every page would mean
 * every page repeating itself; usePathname asks the router directly.
 */
export function Nav({
  items,
  counts,
}: {
  items: NavItem[];
  counts: Partial<Record<ViewKey, number>>;
}) {
  const pathname = usePathname();

  return (
    <div className={style.nav}>
      {items.map((item) => {
        // Prefix match, so a nested route such as /accounts/invite keeps its
        // parent entry highlighted.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${style.navItem} ${active ? style.navItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span>{item.label}</span>
            {counts[item.key] !== undefined && (
              <span className={style.count}>{counts[item.key]}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
