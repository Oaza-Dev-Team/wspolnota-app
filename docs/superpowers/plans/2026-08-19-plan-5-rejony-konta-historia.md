# Kartoteka DK — Plan 5: Rejony, konta rejonów, historia zmian

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trzy widoki administracyjne: kafelki rejonów ze statystykami, zarządzanie kontami par rejonowych i paginowana historia zmian.

**Architecture:** Wszystkie trzy to server components czytające przez tę samą warstwę uprawnień co lista. Interaktywne są wyłącznie akcje na kontach (włącz / wyłącz / zaproś) — server actions z ponownym sprawdzeniem uprawnień. Historia zmian to czysty odczyt z paginacją w URL.

**Tech Stack:** Next.js 16.3 · Prisma 7.9 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md` (§6 uwierzytelnianie, §6.1 Google, §12 RODO)
**Wygląd — nadrzędny:** `docs/handoff/README.md` §5 (rejony), §6 (konta), §7 (historia)
**Zrzuty:** `05-rejony.png`, `06-konta-rejonow.png`, `07-historia-zmian.png` — **pokazują 12 rejonów, jest 11**

## Global Constraints

- **Nazewnictwo (spec §3)**, **bez MUI i Tailwinda**, tokeny z `tokens.css`.
- **Bezpieczeństwo:** `requireUser()` przed Prismą; konta i historia wyłącznie dla admina (`canManageAccounts`, `canReadAudit`); rejony dla admina i moderatora, **nie dla pary rejonowej**.
- **Audyt w tej samej transakcji co zmiana** — dotyczy też zmian statusu konta (`kind: 'account'`).
- **Liczebniki przez `plural()`** — „5 kręgów · 4 parafie" ma się odmieniać.
- **Commity** po każdym zadaniu, po angielsku.

## Dwie decyzje podjęte przy pisaniu tego planu

**1. Zaproszenia bez SMTP.** Handoff mówi „wysyłka zaproszenia e-mail", ale poczta nie jest w tym projekcie skonfigurowana i dokładanie jej tutaj oznaczałoby nową zależność do wdrożenia i utrzymania. Zamiast tego **„Zaproś" generuje jednorazowy link, który admin kopiuje i przesyła sam** — mailem, komunikatorem, jak woli. Przy piętnastu kontach zakładanych raz to jest tańsze niż serwer poczty, a przy okazji nie zostawia zaproszeń w cudzych skrzynkach.

Odwracalne: gdy SMTP się pojawi, wysyłka to jedno wywołanie w tej samej akcji.

**2. Logowanie Google zostaje odłożone dalej.** Spec §6.1 wyznaczał ten plan jako moment decyzji, bo tu powstaje przepływ zaproszeń. Decyzja wymaga wiedzy, której nie mam: czy te konkretne piętnaście osób ma konta Google. **Wariant z linkiem jest neutralny** — działa tak samo przy haśle i przy Google, więc odłożenie nic nie kosztuje. Zapisz to w `docs/STATUS.md`.

---

## Struktura plików

```
src/lib/
  regions/stats.ts        statystyki rejonów
  accounts/list.ts        lista kont z zakresem i licznikami
  accounts/manage.ts      włącz / wyłącz / zaproś + audyt
  audit/list.ts           paginowana historia

src/app/(app)/
  rejony/page.tsx  regions.module.css
  konta/page.tsx   AccountRow.tsx  actions.ts  accounts.module.css
  historia/page.tsx  audit.module.css

src/app/zaproszenie/[token]/
  page.tsx  actions.ts  invite.module.css

e2e/
  admin-views.spec.ts
```

---

### Task 1: Statystyki rejonów

**Files:**
- Create: `src/lib/regions/stats.ts`
- Test: `src/lib/regions/stats.int.test.ts`

**Interfaces:**
- Produces:
  - `type RegionStats = { id: number; roman: string; couples: number; circles: number; parishes: number; leadName: string | null }`
  - `regionStats(u: User): Promise<RegionStats[]>`

- [ ] **Step 1: Napisz test**

`src/lib/regions/stats.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import { regionStats } from './stats';

let admin: User;
let viewer: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  viewer = await byEmail('moderator@example.pl');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('regionStats', () => {
  it('returns one entry per region, in order', async () => {
    const stats = await regionStats(admin);
    expect(stats).toHaveLength(REGION_COUNT);
    expect(stats.map((s) => s.id)).toEqual(
      Array.from({ length: REGION_COUNT }, (_, i) => i + 1),
    );
    expect(stats[6]!.roman).toBe('VII');
  });

  it('counts couples, circles and parishes per region', async () => {
    const stats = await regionStats(admin);
    for (const s of stats) {
      expect(s.couples, `region ${s.id}`).toBeGreaterThan(0);
      expect(s.circles, `region ${s.id}`).toBeGreaterThan(0);
      expect(s.parishes, `region ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('sums the couple counts to the whole community', async () => {
    const stats = await regionStats(admin);
    expect(stats.reduce((n, s) => n + s.couples, 0)).toBe(300);
  });

  it('excludes soft-deleted couples from the counts', async () => {
    const before = await regionStats(admin);
    const couple = await prisma.couple.findFirstOrThrow({
      where: { regionId: 7, deletedAt: null },
    });
    await prisma.couple.update({ where: { id: couple.id }, data: { deletedAt: new Date() } });

    const after = await regionStats(admin);
    expect(after[6]!.couples).toBe(before[6]!.couples - 1);

    await prisma.couple.update({ where: { id: couple.id }, data: { deletedAt: null } });
  });

  it('names the responsible couple, or leaves it empty when unstaffed', async () => {
    const stats = await regionStats(admin);
    // The seed leaves the last region without an active account.
    expect(stats.at(-1)!.leadName).toBeNull();
    expect(stats[0]!.leadName).not.toBeNull();
  });

  it('gives the viewer the same figures as admin', async () => {
    expect(await regionStats(viewer)).toEqual(await regionStats(admin));
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm run test:int -- stats`
Expected: FAIL

- [ ] **Step 3: Zaimplementuj**

`src/lib/regions/stats.ts`:

```ts
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
      const set = circlesPerRegion.get(c.regionId) ?? new Set();
      set.add(String(c.circleId));
      circlesPerRegion.set(c.regionId, set);
    }

    const parishId = c.parishId ?? c.circle?.parishId ?? null;
    if (parishId !== null) {
      const set = parishesPerRegion.get(c.regionId) ?? new Set();
      set.add(String(parishId));
      parishesPerRegion.set(c.regionId, set);
    }
  }

  const leadByRegion = new Map(
    accounts.filter((a) => a.regionId !== null).map((a) => [a.regionId!, a.name]),
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
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm run test:int -- stats`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add per-region statistics"
```

---

### Task 2: Widok rejonów

**Files:**
- Create: `src/app/(app)/rejony/page.tsx`, `regions.module.css`
- Modify: `src/app/(app)/layout.tsx` — aktywna pozycja nawigacji

- [ ] **Step 1: Rozwiąż aktywną pozycję nawigacji**

Layout ustawia dziś `active="couples"` na sztywno, więc na `/rejony` podświetli się zła pozycja. Wyprowadź ją ze ścieżki:

```tsx
import { headers } from 'next/headers';
```

Prościej i pewniej: **przenieś `active` do każdej strony**, przekazując je przez layout jest niemożliwe bez kontekstu. Zamiast tego niech `Shell` sam ustala aktywną pozycję na podstawie `usePathname()` — to wymaga uczynienia go komponentem klienckim, czego nie chcemy.

**Rozstrzygnięcie:** dodaj do `navItems` porównanie po prefiksie i przekaż ścieżkę do layoutu przez nagłówek, który Next ustawia sam. W App Routerze layout nie zna ścieżki, więc najprostsze poprawne rozwiązanie to **osobny mały komponent kliencki na samą nawigację**:

```tsx
// src/app/(app)/Nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/navigation';
import style from './shell.module.css';

export function Nav({
  items,
  counts,
}: {
  items: NavItem[];
  counts: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();

  return (
    <div className={style.nav}>
      {items.map((item) => {
        // Prefix match so /pary?card=5 and any future nested route stay active.
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
```

Podmień blok nawigacji w `Shell.tsx` na `<Nav items={navItems(user)} counts={counts} />` i usuń prop `active` z `Shell` oraz z `layout.tsx`. **Zaktualizuj testy**, które sprawdzały liczbę pozycji — one nadal przechodzą, bo liczba się nie zmienia.

- [ ] **Step 2: Napisz style**

`src/app/(app)/rejony/regions.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(264px, 1fr));
  gap: 13px;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 5px solid var(--region-color);
  border-radius: var(--r-12);
  padding: 16px 17px;
  text-decoration: none;
  color: inherit;
}

.tile:hover {
  border-color: var(--navy-700);
  border-left-color: var(--region-color);
  box-shadow: var(--shadow-tile);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.name {
  font-family: var(--font-heading), Georgia, serif;
  font-size: 26px;
  font-weight: 400;
  color: var(--region-color);
}

.count {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  border-radius: var(--r-20);
  padding: 3px 9px;
  color: var(--region-color);
  background: color-mix(in srgb, var(--region-color) 9%, transparent);
  white-space: nowrap;
}

.leadLabel {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-faint);
}

.leadName {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.unstaffed {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
}

.meta {
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Napisz stronę**

`src/app/(app)/rejony/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/requireUser';
import { regionColor } from '@/lib/domain/regions';
import { CIRCLES, COUPLES, PARISHES, plural } from '@/lib/pl';
import { regionStats } from '@/lib/regions/stats';
import { ViewHeader } from '../ViewHeader';
import style from './regions.module.css';

export default async function RegionsPage() {
  const u = await requireUser();
  // A region account has exactly one region; the overview would be a page
  // with a single tile leading back to the list it is already on.
  if (u.role === 'region') redirect('/pary');

  const stats = await regionStats(u);

  return (
    <>
      <ViewHeader
        title="Rejony I–XI"
        subtitle="Kliknij rejon, aby przejść do jego listy par"
      />

      <div className={style.grid}>
        {stats.map((r) => (
          <Link
            key={r.id}
            href={`/pary?region=${r.id}`}
            className={style.tile}
            style={{ '--region-color': regionColor(r.id) } as React.CSSProperties}
          >
            <div className={style.head}>
              <span className={style.name}>{`Rejon ${r.roman}`}</span>
              <span className={style.count}>{plural(r.couples, COUPLES)}</span>
            </div>

            <div>
              <div className={style.leadLabel}>Para odpowiedzialna</div>
              {r.leadName
                ? <div className={style.leadName}>{r.leadName}</div>
                : <div className={style.unstaffed}>Do obsadzenia</div>}
              <div className={style.meta}>
                {`${plural(r.circles, CIRCLES)} · ${plural(r.parishes, PARISHES)}`}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Sprawdź w przeglądarce**

Jako admin: `/rejony` pokazuje **11 kafelków**, każdy w swoim kolorze, z liczbą par i odmienioną statystyką „5 kręgów · 4 parafie". Ostatni ma „Do obsadzenia". Klik przenosi na listę z ustawionym filtrem rejonu. Jako para rejonowa: przekierowanie na `/pary`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the regions overview"
```

---

### Task 3: Lista kont

**Files:**
- Create: `src/lib/accounts/list.ts`
- Test: `src/lib/accounts/list.int.test.ts`

**Interfaces:**
- Produces:
  - `type AccountRow = { id: string; email: string; name: string; role: Role; status: AccountStatus; regionId: number | null; roman: string | null; couples: number; lastLoginAt: string | null }`
  - `accountRows(u: User): Promise<AccountRow[]>`

- [ ] **Step 1: Napisz test**

`src/lib/accounts/list.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { REGION_COUNT } from '@/lib/domain/regions';
import { accountRows } from './list';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('accountRows', () => {
  it('lists every region account plus the moderator, and never the admin', async () => {
    const rows = await accountRows(admin);
    expect(rows).toHaveLength(REGION_COUNT + 1);
    expect(rows.some((r) => r.role === 'admin')).toBe(false);
    expect(rows.filter((r) => r.role === 'viewer')).toHaveLength(1);
  });

  it('orders regions first, moderator last', async () => {
    const rows = await accountRows(admin);
    expect(rows[0]!.regionId).toBe(1);
    expect(rows.at(-1)!.role).toBe('viewer');
  });

  it('carries the couple count for each region', async () => {
    const rows = await accountRows(admin);
    const seventh = rows.find((r) => r.regionId === 7)!;
    expect(seventh.couples).toBeGreaterThan(0);
    expect(seventh.roman).toBe('VII');
  });

  it('marks the unstaffed region as pending', async () => {
    const rows = await accountRows(admin);
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('refuses anyone but admin', async () => {
    await expect(accountRows(regionVII)).rejects.toThrow(Forbidden);
  });
});
```

- [ ] **Step 2: Zaimplementuj**

`src/lib/accounts/list.ts`:

```ts
import type { AccountStatus, Role } from '@/generated/prisma/enums';
import { Forbidden, type User, canManageAccounts } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { formatDate } from '@/lib/pl';

export type AccountRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  regionId: number | null;
  roman: string | null;
  couples: number;
  lastLoginAt: string | null;
};

export async function accountRows(u: User): Promise<AccountRow[]> {
  if (!canManageAccounts(u)) throw new Forbidden();

  const [accounts, counts] = await Promise.all([
    prisma.account.findMany({
      // The admin manages other people's access, not their own.
      where: { role: { not: 'admin' } },
      orderBy: [{ role: 'asc' }, { regionId: 'asc' }],
      select: {
        id: true, email: true, name: true, role: true, status: true,
        regionId: true, lastLoginAt: true,
      },
    }),
    prisma.couple.groupBy({
      by: ['regionId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const couplesByRegion = new Map(counts.map((c) => [c.regionId, c._count._all]));

  const rows = accounts.map((a) => ({
    id: String(a.id),
    email: a.email,
    name: a.name,
    role: a.role,
    status: a.status,
    regionId: a.regionId,
    roman: a.regionId === null ? null : romanNumeral(a.regionId),
    couples: a.regionId === null ? 0 : (couplesByRegion.get(a.regionId) ?? 0),
    lastLoginAt: a.lastLoginAt === null ? null : formatDate(a.lastLoginAt),
  }));

  // Regions in numerical order, the moderator at the bottom — the handoff
  // shows it as the last row.
  return rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'region' ? -1 : 1;
    return (a.regionId ?? 0) - (b.regionId ?? 0);
  });
}
```

- [ ] **Step 3: Uruchom test — musi przejść**

Run: `npm run test:int -- accounts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the account list read model"
```

---

### Task 4: Akcje na kontach

**Files:**
- Create: `src/lib/accounts/manage.ts`
- Test: `src/lib/accounts/manage.int.test.ts`

**Interfaces:**
- Produces:
  - `setAccountStatus(u: User, id: bigint, status: 'active' | 'disabled'): Promise<void>`
  - `createInvite(u: User, id: bigint): Promise<string>` — zwraca **surowy token**, jedyny moment gdy istnieje
  - `redeemInvite(token: string, password: string): Promise<void>`
  - `INVITE_DAYS = 7`

- [ ] **Step 1: Napisz test**

`src/lib/accounts/manage.int.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, userFromToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { createInvite, redeemInvite, setAccountStatus } from './manage';

let admin: User;
let regionVII: User;
let targetId: bigint;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
  targetId = (await prisma.account.findUniqueOrThrow({
    where: { email: 'rejon5@example.pl' },
  })).id;
});

afterEach(async () => {
  await prisma.account.update({
    where: { id: targetId },
    data: { status: 'active', inviteTokenHash: null, inviteExpiresAt: null },
  });
  await prisma.audit.deleteMany({ where: { kind: 'account' } });
});

describe('setAccountStatus', () => {
  it('disables an account and records it', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('disabled');
    expect(await prisma.audit.count({ where: { kind: 'account' } })).toBe(1);
  });

  // The checklist requires a disabled account to lose access immediately.
  it('kills the live sessions of a disabled account', async () => {
    const token = await createSession(targetId);
    expect(await userFromToken(token)).not.toBeNull();

    await setAccountStatus(admin, targetId, 'disabled');
    expect(await userFromToken(token)).toBeNull();
    expect(await prisma.session.count({ where: { accountId: targetId } })).toBe(0);
  });

  it('re-enables an account', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    await setAccountStatus(admin, targetId, 'active');
    expect((await prisma.account.findUniqueOrThrow({ where: { id: targetId } })).status)
      .toBe('active');
  });

  it('refuses anyone but admin', async () => {
    await expect(setAccountStatus(regionVII, targetId, 'disabled')).rejects.toThrow(Forbidden);
  });

  it('refuses to disable the admin account itself', async () => {
    await expect(setAccountStatus(admin, admin.id, 'disabled')).rejects.toThrow();
  });
});

describe('createInvite', () => {
  it('returns a raw token and stores only its hash', async () => {
    const token = await createInvite(admin, targetId);
    expect(token.length).toBeGreaterThan(20);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.inviteTokenHash).not.toBeNull();
    expect(account.inviteTokenHash).not.toBe(token);
    expect(account.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('replaces any previous invite', async () => {
    const first = await createInvite(admin, targetId);
    const second = await createInvite(admin, targetId);
    expect(first).not.toBe(second);
    await expect(redeemInvite(first, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses anyone but admin', async () => {
    await expect(createInvite(regionVII, targetId)).rejects.toThrow(Forbidden);
  });
});

describe('redeemInvite', () => {
  it('sets the password and activates the account', async () => {
    await prisma.account.update({ where: { id: targetId }, data: { status: 'pending' } });
    const token = await createInvite(admin, targetId);

    await redeemInvite(token, 'nowe-haslo-123');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('active');
    expect(await verifyPassword(account.passwordHash!, 'nowe-haslo-123')).toBe(true);
    // A one-time link: the token is consumed.
    expect(account.inviteTokenHash).toBeNull();
  });

  it('refuses a token that was already used', async () => {
    const token = await createInvite(admin, targetId);
    await redeemInvite(token, 'nowe-haslo-123');
    await expect(redeemInvite(token, 'inne-haslo-456')).rejects.toThrow();
  });

  it('refuses an expired token', async () => {
    const token = await createInvite(admin, targetId);
    await prisma.account.update({
      where: { id: targetId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(redeemInvite(token, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses an unknown token', async () => {
    await expect(redeemInvite('zmyslony-token', 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses a password that is too short', async () => {
    const token = await createInvite(admin, targetId);
    await expect(redeemInvite(token, 'krotkie')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Zaimplementuj**

`src/lib/accounts/manage.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import type { AccountStatus } from '@/generated/prisma/enums';
import { Forbidden, type User, canManageAccounts } from '@/lib/auth/permissions';
import { hashPassword } from '@/lib/auth/password';
import { deleteAccountSessions } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

export const INVITE_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 10;

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function setAccountStatus(
  u: User,
  id: bigint,
  status: Extract<AccountStatus, 'active' | 'disabled'>,
): Promise<void> {
  if (!canManageAccounts(u)) throw new Forbidden();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { role: true, name: true },
  });
  // Locking oneself out of account management would need database access to undo.
  if (account.role === 'admin') {
    throw new Forbidden('Nie można wyłączyć konta administratora');
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { status } });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: status === 'disabled'
          ? `Wyłączono konto ${account.name}`
          : `Włączono konto ${account.name}`,
        accountId: u.id,
      },
    });
  });

  // Outside the transaction is fine: re-enabling creates no sessions, and
  // disabling must end them whether or not the audit row committed first.
  if (status === 'disabled') await deleteAccountSessions(id);
}

/**
 * Returns the raw token — the only moment it exists. The admin copies the link
 * and passes it on however they like; there is no SMTP in this project and
 * adding one for fifteen accounts created once would cost more than it saves.
 */
export async function createInvite(u: User, id: bigint): Promise<string> {
  if (!canManageAccounts(u)) throw new Forbidden();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { name: true, role: true },
  });
  if (account.role === 'admin') throw new Forbidden('Konto administratora nie wymaga zaproszenia');

  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id },
      data: {
        // Issuing a new invite invalidates the previous one.
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Wygenerowano zaproszenie dla ${account.name}`,
        accountId: u.id,
      },
    });
  });

  return token;
}

export async function redeemInvite(token: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new InviteError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
  }

  const account = await prisma.account.findFirst({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, inviteExpiresAt: true },
  });
  if (!account) throw new InviteError('Zaproszenie jest nieprawidłowe lub zostało już użyte');
  if (!account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
    throw new InviteError('Zaproszenie wygasło — poproś o nowe');
  }

  const passwordHash = await hashPassword(password);

  await prisma.account.update({
    where: { id: account.id },
    data: {
      passwordHash,
      status: 'active',
      // One-time link: consumed on use.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
}
```

- [ ] **Step 3: Uruchom test — musi przejść**

Run: `npm run test:int -- manage`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add account status changes and one-time invites"
```

---

### Task 5: Widok kont

**Files:**
- Create: `src/app/(app)/konta/page.tsx`, `AccountRow.tsx`, `actions.ts`, `accounts.module.css`

- [ ] **Step 1: Napisz server actions**

`src/app/(app)/konta/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { Forbidden } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { createInvite, setAccountStatus } from '@/lib/accounts/manage';

export type AccountsState = { error?: string; inviteLink?: string; forAccount?: string };

function idFrom(formData: FormData): bigint | null {
  const raw = formData.get('id');
  return typeof raw === 'string' && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

export async function toggleAccountAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  const next = formData.get('next') === 'disabled' ? 'disabled' : 'active';

  try {
    await setAccountStatus(u, id, next);
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }

  revalidatePath('/konta');
  return {};
}

export async function inviteAction(
  _state: AccountsState,
  formData: FormData,
): Promise<AccountsState> {
  const u = await requireUser();
  const id = idFrom(formData);
  if (id === null) return { error: 'Brak identyfikatora konta' };

  try {
    const token = await createInvite(u, id);
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    revalidatePath('/konta');
    return {
      inviteLink: `${base}/zaproszenie/${token}`,
      forAccount: String(id),
    };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    throw e;
  }
}
```

- [ ] **Step 2: Napisz wiersz konta**

`src/app/(app)/konta/AccountRow.tsx` — kliencki, bo trzyma wynik akcji zaproszenia:

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountRow as Row } from '@/lib/accounts/list';
import { regionColor } from '@/lib/domain/regions';
import { COUPLES, plural } from '@/lib/pl';
import { type AccountsState, inviteAction, toggleAccountAction } from './actions';
import style from './accounts.module.css';

const STATUS_LABEL: Record<Row['status'], string> = {
  active: 'aktywne',
  disabled: 'wyłączone',
  pending: 'oczekuje',
};

function ActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={style.action} disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

export function AccountRow({ row }: { row: Row }) {
  const [toggleState, toggle] = useActionState<AccountsState, FormData>(toggleAccountAction, {});
  const [inviteState, invite] = useActionState<AccountsState, FormData>(inviteAction, {});

  const code = row.roman ?? 'MOD';
  const color = row.regionId === null ? 'var(--navy-700)' : regionColor(row.regionId);
  const scope = row.regionId === null
    ? 'Cała wspólnota · podgląd'
    : `Rejon ${row.roman} · ${plural(row.couples, COUPLES)}`;

  const error = toggleState.error ?? inviteState.error;

  return (
    <div className={style.row}>
      <span
        className={style.badge}
        style={{ '--region-color': color } as React.CSSProperties}
        aria-hidden="true"
      >
        {code}
      </span>

      <span className={style.identity}>
        <span className={style.name}>{row.name}</span>
        <span className={style.email}>{row.email}</span>
      </span>

      <span className={style.scope}>{scope}</span>
      <span className={style.lastLogin}>{row.lastLoginAt ?? '—'}</span>

      <span className={`${style.status} ${style[row.status]}`}>{STATUS_LABEL[row.status]}</span>

      {row.status === 'pending' ? (
        <form action={invite}>
          <input type="hidden" name="id" value={row.id} />
          <ActionButton label="Zaproś" />
        </form>
      ) : (
        <form action={toggle}>
          <input type="hidden" name="id" value={row.id} />
          <input
            type="hidden"
            name="next"
            value={row.status === 'active' ? 'disabled' : 'active'}
          />
          <ActionButton label={row.status === 'active' ? 'Wyłącz' : 'Włącz'} />
        </form>
      )}

      {error && <p className={style.error} role="alert">{error}</p>}

      {inviteState.inviteLink && (
        <p className={style.invite} role="status">
          Link zaproszenia — skopiuj i przekaż tej parze. Jest ważny 7 dni i działa raz:
          <code className={style.inviteLink}>{inviteState.inviteLink}</code>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Napisz stronę**

`src/app/(app)/konta/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { accountRows } from '@/lib/accounts/list';
import { canManageAccounts } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { ViewHeader } from '../ViewHeader';
import { AccountRow } from './AccountRow';
import style from './accounts.module.css';

export default async function AccountsPage() {
  const u = await requireUser();
  if (!canManageAccounts(u)) redirect('/pary');

  const rows = await accountRows(u);

  return (
    <>
      <ViewHeader title="Konta rejonów" subtitle="Dostępy par rejonowych i moderatora" />
      <div className={style.container}>
        {rows.map((row) => <AccountRow key={row.id} row={row} />)}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Napisz style**

`src/app/(app)/konta/accounts.module.css`:

```css
.container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-12);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--divider);
  flex-wrap: wrap;
}

.badge {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: var(--r-8);
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--region-color);
  background: color-mix(in srgb, var(--region-color) 10%, transparent);
}

.identity {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 140px;
  overflow-wrap: anywhere;
}

.name { font-size: 14px; font-weight: 600; color: var(--text); }
.email { font-size: 13px; color: var(--text-muted); }

.scope {
  font-size: 13px;
  color: var(--text-body);
  min-width: 104px;
}

.lastLogin {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-faint);
  min-width: 128px;
}

.status {
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--r-20);
  padding: 4px 10px;
  min-width: 78px;
  text-align: center;
  flex: none;
}

.active { background: var(--success-bg); color: var(--success-fg); }
.disabled { background: var(--bg-row); color: var(--text-faint); }
.pending { background: var(--warn-bg); color: var(--warn-fg); }

.action {
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-7);
  padding: 9px 14px;
  font-size: 13px;
  min-height: 40px;
  cursor: pointer;
  color: var(--text);
}

.action:hover { border-color: var(--navy-700); }

.error {
  flex: 1 1 100%;
  background: var(--danger-bg);
  border-radius: var(--r-7);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--danger-fg);
  margin: 0;
}

.invite {
  flex: 1 1 100%;
  background: var(--warn-bg);
  border-radius: var(--r-7);
  padding: 10px 12px;
  font-size: 13px;
  color: var(--warn-strong);
  margin: 0;
}

.inviteLink {
  display: block;
  margin-top: 6px;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
  color: var(--navy-700);
}

/* The handoff hides the last-login column on narrow screens. */
@media (max-width: 1120px) {
  .lastLogin { display: none; }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the accounts view with invites and status changes"
```

---

### Task 6: Strona zaproszenia

**Files:**
- Create: `src/app/zaproszenie/[token]/page.tsx`, `actions.ts`, `invite.module.css`

Trasa leży **poza** grupą `(app)`, bo osoba korzystająca z zaproszenia nie ma jeszcze sesji.

- [ ] **Step 1: Napisz akcję**

`src/app/zaproszenie/[token]/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { InviteError, MIN_PASSWORD_LENGTH, redeemInvite } from '@/lib/accounts/manage';

export type InviteState = { error?: string };

export async function redeemAction(_state: InviteState, formData: FormData): Promise<InviteState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  if (password !== repeat) return { error: 'Hasła nie są takie same' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków` };
  }

  try {
    await redeemInvite(token, password);
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }

  redirect('/logowanie?invited=1');
}
```

- [ ] **Step 2: Napisz stronę i formularz**

Strona reużywa układu ekranu logowania (`login.module.css`) — ta sama lewa kolumna, po prawej formularz ustawienia hasła. Pełny kod w Kroku 3 planu wykonawczego; kluczowe elementy:

- `params` jest `Promise` (Next 16) — trzeba `await`
- token idzie w ukrytym polu, nie w URL akcji
- dwa pola hasła, sprawdzane po stronie serwera
- po sukcesie przekierowanie na `/logowanie?invited=1` z komunikatem „Hasło ustawione — możesz się zalogować"

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add the invite redemption page"
```

---

### Task 7: Historia zmian

**Files:**
- Create: `src/lib/audit/list.ts`, `src/app/(app)/historia/page.tsx`, `audit.module.css`
- Test: `src/lib/audit/list.int.test.ts`

**Interfaces:**
- Produces:
  - `type AuditRow = { id: string; at: string; kind: AuditKind; description: string; author: string }`
  - `AUDIT_PAGE_SIZE = 50`
  - `auditPage(u: User, page: number): Promise<{ rows: AuditRow[]; total: number }>`

- [ ] **Step 1: Napisz test**

`src/lib/audit/list.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { AUDIT_PAGE_SIZE, auditPage } from './list';

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');

  await prisma.audit.createMany({
    data: Array.from({ length: AUDIT_PAGE_SIZE + 5 }, (_, i) => ({
      kind: 'edit' as const,
      description: `Wpis testowy ${i}`,
      accountId: admin.id,
    })),
  });
});

afterAll(async () => {
  await prisma.audit.deleteMany({ where: { description: { startsWith: 'Wpis testowy' } } });
  await prisma.$disconnect();
});

describe('auditPage', () => {
  it('returns newest first', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows.length).toBeGreaterThan(0);
    const ids = rows.map((r) => BigInt(r.id));
    expect([...ids].sort((a, b) => (b > a ? 1 : -1))).toEqual(ids);
  });

  it('pages fifty at a time', async () => {
    const first = await auditPage(admin, 1);
    expect(first.rows).toHaveLength(AUDIT_PAGE_SIZE);

    const second = await auditPage(admin, 2);
    const seen = new Set(first.rows.map((r) => r.id));
    expect(second.rows.some((r) => seen.has(r.id))).toBe(false);
  });

  it('names the author, or says the account is gone', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows.every((r) => r.author.length > 0)).toBe(true);
  });

  it('formats the timestamp for reading', async () => {
    const { rows } = await auditPage(admin, 1);
    expect(rows[0]!.at).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });

  it('refuses anyone but admin', async () => {
    await expect(auditPage(regionVII, 1)).rejects.toThrow(Forbidden);
  });
});
```

- [ ] **Step 2: Zaimplementuj**

`src/lib/audit/list.ts`:

```ts
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
  if (!canReadAudit(u)) throw new Forbidden();

  const [records, total] = await Promise.all([
    prisma.audit.findMany({
      orderBy: { id: 'desc' },
      skip: (Math.max(1, page) - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true, at: true, kind: true, description: true,
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
```

- [ ] **Step 3: Napisz widok**

`src/app/(app)/historia/page.tsx` — server component z paginacją w URL (`?page=`), plakietki rodzajów wg §7 handoffu. Etykiety po polsku:

```ts
const KIND_LABEL: Record<AuditKind, string> = {
  edit: 'edycja',
  create: 'dodanie',
  delete: 'usunięcie',
  export: 'eksport',
  account: 'konto',
};
```

Kolory plakietek z tokenów: `edit` → `--bg-row`/`--navy-700`, `create` → success, `delete` → danger, `export` → warn, `account` → purple.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the paginated change history"
```

---

### Task 8: Testy end-to-end

**Files:**
- Create: `e2e/admin-views.spec.ts`

Zakres: dostępność widoków wg roli (rejony — admin i moderator, konta i historia — tylko admin), 11 kafelków z odmienioną statystyką, „Do obsadzenia" na nieobsadzonym rejonie, klik w kafelek ustawia filtr rejonu, wyłączenie konta zmienia plakietkę statusu, wygenerowanie zaproszenia pokazuje link, historia paginuje się i pokazuje plakietki rodzajów.

**Uwaga:** testy zmieniające status konta muszą przywrócić stan — inaczej `login.spec.ts` zacznie padać, bo któreś konto testowe przestanie się logować. Najbezpieczniej operować na `rejon5@example.pl`, którego żaden inny test nie używa, i przywracać `active` na końcu.

- [ ] **Step 1: Napisz testy**
- [ ] **Step 2: Uruchom** — `npm run e2e`
- [ ] **Step 3: Commit**

---

## Stan po Planie 5

- Rejony: 11 kafelków w kolorach palety, statystyki z odmianą, przejście do listy z filtrem
- Konta: statusy, włączanie i wyłączanie z natychmiastowym unieważnieniem sesji, jednorazowe linki zaproszeń
- Historia zmian: paginowana, z plakietkami rodzajów i autorem
- Strona ustawienia hasła z zaproszenia

**Zostaje na Plan 6:** trwałe usunięcie na żądanie RODO, retencja audytu, klauzula informacyjna, przegląd dostępności i przejście listy odbioru punkt po punkcie.
