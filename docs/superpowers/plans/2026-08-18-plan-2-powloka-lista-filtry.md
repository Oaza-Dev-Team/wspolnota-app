# Kartoteka DK — Plan 2: Powłoka, lista par, filtry

> **Uwaga: ten plan opisuje stan sprzed refactoru na angielski.** Identyfikatory,
> nazwy plikow i schemat bazy zostaly pozniej przemianowane — patrz spec §3.
> Plan zostaje jako zapis tego, co i w jakiej kolejnosci zbudowano; nie odtwarzaj
> z niego nazw.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić zaślepkę `/pary` prawdziwym widokiem kartoteki: powłoka z nawigacją zależną od roli, lista par jako tabela na desktopie i karty na mobile, sortowanie, paginacja i kaskada filtrów — wszystko ze stanem w URL.

**Architecture:** Odczyt idzie wyłącznie przez server component: `searchParams` → walidacja Zod → zapytanie Prismy z wstrzykniętym `zakresListy(user)`. Klient nie wykonuje zapytań, więc nie ma jak poprosić o dane spoza swojego zakresu. Pasek filtrów jest jedynym komponentem klienckim i nie trzyma stanu — zapisuje go do URL, a URL wraca na serwer. Sortowanie i paginacja to zwykłe linki, więc działają bez JavaScriptu.

**Tech Stack:** Next.js 16.3 App Router · React 19.2 · Prisma 7.9 · Zod 4 · CSS Modules · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md`
**Wygląd — nadrzędny:** `docs/handoff/README.md` §2 (powłoka) i §3 (lista par)
**Zrzuty:** `docs/handoff/screenshots/02-lista-par-admin.png`, `08-mobile-lista.png`, `09-tabela-kolumny.png`
**Poprzedni plan:** `docs/superpowers/plans/2026-08-18-plan-1-fundament-i-uwierzytelnianie.md`

## Global Constraints

Obowiązują w **każdym** zadaniu. Powtórzone z Planu 1, bo egzekwuje je review.

- **Wersje:** Next.js 16.3.1 · React 19.2 · TypeScript `strict` + `noUncheckedIndexedAccess` · `target: ES2022` · Prisma 7.9 · Zod 4
- **Bez MUI i bez Tailwinda.** Wyłącznie CSS Modules + custom properties z `src/styles/tokens.css`. **Literalna wartość koloru, odstępu, promienia lub cienia w `.module.css` jest błędem do odrzucenia w review** — ma być `var(--…)`. Wyjątek: wartości, których nie ma w tokenach (np. `#e7edf4` z sidebara) — dodaj je do `tokens.css`, nie wpisuj w miejscu użycia.
- **Bezpieczeństwo:** żadna server action ani route handler nie dotyka Prismy przed `requireUser()`. **Każde** zapytanie listy rozwija `zakresListy(user)`.
- **Nazewnictwo:** identyfikatory domenowe po polsku, techniczne po angielsku, komentarze i nazwy testów po angielsku, interfejs po polsku.
- **Liczba rejonów to `LICZBA_REJONOW` z `@/lib/domena/rejony`** — nigdy literał. Wspólnota ma 11 rejonów, handoff mówi 12 (patrz spec §1).
- **Liczebniki odmieniane przez `odmiana()`** z `@/lib/pl` — „1 parafia" / „2 parafie" / „5 parafii".
- **Commity** po każdym zadaniu, po angielsku, w trybie rozkazującym.

## Trzy rzeczy, które ustaliliśmy podczas Planu 1

Wykonawca musi je znać, zanim napisze pierwszą linijkę.

1. **`searchParams` na stronie jest w Next 16 `Promise`** — trzeba `await`. To breaking change z wersji 16; synchroniczny dostęp został usunięty.
2. **`prisma generate` po każdej zmianie schematu.** `migrate` tego nie robi.
3. **E2E uruchamiaj na buildzie produkcyjnym** (`playwright.config.ts` już tak ma). Na `next dev` kompilacja tras na żądanie objawia się jako losowo padające testy.

---

## Struktura plików

```
src/lib/
  nawigacja.ts                pozycje menu zależne od roli (czysty moduł)
  pary/
    filtry.ts                 schemat Zod + parsowanie i serializacja URL
    zapytania.ts              zapytania listy, opcje kaskady, liczniki
    formacja.ts               najwyższy stopień + "+N" dla plakietki

src/components/
  PlakietkaRejonu.tsx         plakietka z kolorem rejonu
  PlakietkaFormacji.tsx       plakietka formacji
  plakietki.module.css

src/app/(app)/
  layout.tsx                  powłoka: sidebar/topbar + main
  Powloka.tsx                 brand, nawigacja, stopka z wylogowaniem
  powloka.module.css
  NaglowekWidoku.tsx          H1 + podtytuł + slot na akcje
  naglowek.module.css
  pary/
    page.tsx                  server component — odczyt i render
    PasekFiltrow.tsx          jedyny komponent kliencki
    TabelaPar.tsx             widok ≥860 px
    KartyPar.tsx              widok <860 px
    Paginacja.tsx
    pary.module.css

e2e/
  lista.spec.ts               scenariusze z listy odbioru
```

**Granica klient/serwer.** Klienckie są wyłącznie `PasekFiltrow.tsx` (zmienia URL) i nic więcej. Tabela, karty, plakietki i paginacja renderują się na serwerze — nie potrzebują interaktywności, bo sortowanie i strony to linki.

---

### Task 1: Nawigacja zależna od roli

**Files:**
- Create: `src/lib/nawigacja.ts`
- Test: `src/lib/nawigacja.test.ts`

**Interfaces:**
- Consumes: `Uzytkownik`, `mozeZarzadzacKontami`, `mozeCzytacAudyt` z `@/lib/auth/permissions`
- Produces:
  - `type PozycjaNawigacji = { href: string; etykieta: string; klucz: 'pary' | 'rejony' | 'konta' | 'audyt' }`
  - `pozycjeNawigacji(u: Uzytkownik): PozycjaNawigacji[]`
  - `tytulListy(u: Uzytkownik): { tytul: string; podtytul: string }` — podtytuł jest funkcją liczby par, więc przyjmuje ją drugim argumentem: `tytulListy(u, liczbaPar)`

- [ ] **Step 1: Napisz test**

`src/lib/nawigacja.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { pozycjeNawigacji, tytulListy } from './nawigacja';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

describe('pozycjeNawigacji', () => {
  // The acceptance checklist counts these exactly: admin 4, region 1, viewer 2.
  it('gives admin all four entries', () => {
    expect(pozycjeNawigacji(admin).map((p) => p.klucz)).toEqual([
      'pary', 'rejony', 'konta', 'audyt',
    ]);
  });

  it('gives a region account only its own list', () => {
    const pozycje = pozycjeNawigacji(rejonVII);
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0]).toEqual({ href: '/pary', etykieta: 'Mój rejon', klucz: 'pary' });
  });

  it('gives the viewer the list and the regions, without administration', () => {
    expect(pozycjeNawigacji(moderator).map((p) => p.klucz)).toEqual(['pary', 'rejony']);
  });
});

describe('tytulListy', () => {
  it('names the region for a region account', () => {
    expect(tytulListy(rejonVII, 27)).toEqual({
      tytul: 'Rejon VII',
      podtytul: 'Twoje pary — możesz dodawać i edytować dane',
    });
  });

  it('describes the whole community for admin and viewer, with inflection', () => {
    expect(tytulListy(admin, 300)).toEqual({
      tytul: 'Pary wspólnoty',
      podtytul: 'Cała wspólnota — 300 par w 11 rejonach',
    });
    expect(tytulListy(moderator, 1).podtytul).toBe('Cała wspólnota — 1 para w 11 rejonach');
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- nawigacja`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/nawigacja.ts`:

```ts
import type { Uzytkownik } from '@/lib/auth/permissions';
import { mozeCzytacAudyt, mozeZarzadzacKontami } from '@/lib/auth/permissions';
import { LICZBA_REJONOW, numerRzymski } from '@/lib/domena/rejony';
import { PARY, REJONY, odmiana } from '@/lib/pl';

export type KluczWidoku = 'pary' | 'rejony' | 'konta' | 'audyt';

export type PozycjaNawigacji = {
  href: string;
  etykieta: string;
  klucz: KluczWidoku;
};

export function pozycjeNawigacji(u: Uzytkownik): PozycjaNawigacji[] {
  // A region account manages one region, so "all couples" would be a lie —
  // it gets a single entry named after what it actually sees.
  if (u.rola === 'rejon') {
    return [{ href: '/pary', etykieta: 'Mój rejon', klucz: 'pary' }];
  }

  const pozycje: PozycjaNawigacji[] = [
    { href: '/pary', etykieta: 'Wszystkie pary', klucz: 'pary' },
    { href: '/rejony', etykieta: 'Rejony', klucz: 'rejony' },
  ];

  if (mozeZarzadzacKontami(u)) {
    pozycje.push({ href: '/konta', etykieta: 'Konta rejonów', klucz: 'konta' });
  }
  if (mozeCzytacAudyt(u)) {
    pozycje.push({ href: '/historia', etykieta: 'Historia zmian', klucz: 'audyt' });
  }
  return pozycje;
}

export function tytulListy(u: Uzytkownik, liczbaPar: number): { tytul: string; podtytul: string } {
  if (u.rola === 'rejon' && u.rejonId !== null) {
    return {
      tytul: `Rejon ${numerRzymski(u.rejonId)}`,
      podtytul: 'Twoje pary — możesz dodawać i edytować dane',
    };
  }
  return {
    tytul: 'Pary wspólnoty',
    podtytul: `Cała wspólnota — ${odmiana(liczbaPar, PARY)} w ${odmiana(LICZBA_REJONOW, REJONY)}`,
  };
}
```

- [ ] **Step 4: Dodaj brakującą formę odmiany**

`src/lib/pl/odmiana.ts` nie ma jeszcze rejonów. Dopisz:

```ts
export const REJONY: FormyOdmiany = ['rejonie', 'rejonach', 'rejonach'];
```

Miejscownik, bo używamy tego wyłącznie w konstrukcji „w N rejonach". Dopisz też test
w `src/lib/pl/odmiana.test.ts`:

```ts
  it('inflects regions in the locative used by the list subtitle', () => {
    expect(odmiana(1, REJONY)).toBe('1 rejonie');
    expect(odmiana(11, REJONY)).toBe('11 rejonach');
  });
```

- [ ] **Step 5: Uruchom testy — muszą przejść**

Run: `npm test -- nawigacja odmiana`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add role-dependent navigation entries"
```

---

### Task 2: Powłoka aplikacji

**Files:**
- Create: `src/app/(app)/Powloka.tsx`, `src/app/(app)/powloka.module.css`
- Modify: `src/app/(app)/layout.tsx`, `src/styles/tokens.css`

**Interfaces:**
- Consumes: `pozycjeNawigacji` (Task 1), `requireUser`, `prisma`
- Produces: `<Powloka uzytkownik={u} aktywny="pary" liczniki={…}>{children}</Powloka>`, gdzie `liczniki: Partial<Record<KluczWidoku, number>>`

- [ ] **Step 1: Dopisz brakujące tokeny sidebara**

Sidebar używa kolorów, których nie ma w `tokens.css`. Dopisz do `:root`, żeby nie
wpisywać ich literalnie w module (Global Constraints):

```css
  /* Sidebar — jedyne miejsce, gdzie tekst leży na navy */
  --sidebar-tekst: #e7edf4;
  --sidebar-tekst-przygaszony: #c3d3e1;
  --sidebar-tekst-slaby: #7d97ad;
  --sidebar-hover: rgba(255, 255, 255, .08);
  --sidebar-linia: rgba(255, 255, 255, .13);
  --sidebar-obwodka: rgba(255, 255, 255, .2);
  --nawigacja-aktywna-tlo: rgba(226, 176, 74, .16);
  --awatar-tlo: rgba(226, 176, 74, .18);
```

Dopisz je również do listy wymaganych tokenów w `src/styles/tokens.test.ts`.

- [ ] **Step 2: Napisz style powłoki**

`src/app/(app)/powloka.module.css`:

```css
.aplikacja {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 244px;
  flex: none;
  padding: 20px 14px;
  background: var(--navy-900);
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.monogram {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--r-7);
  background: var(--surface);
  color: var(--navy-700);
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 15px;
}

.brandNazwa {
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 18px;
  color: var(--sidebar-tekst);
  line-height: 1.2;
}

.brandPodpis {
  font-family: var(--font-mono), monospace;
  font-size: 9px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--sidebar-tekst-slaby);
}

.nawigacja {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pozycja {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 13px;
  border-radius: var(--r-8);
  font-size: 14px;
  color: var(--sidebar-tekst-przygaszony);
  text-decoration: none;
}

.pozycja:hover {
  background: var(--sidebar-hover);
}

.pozycjaAktywna {
  background: var(--nawigacja-aktywna-tlo);
  color: var(--gold-500);
  font-weight: 600;
}

.licznik {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  opacity: .65;
}

.stopka {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--sidebar-linia);
  padding-top: 15px;
}

.konto {
  display: flex;
  align-items: center;
  gap: 10px;
}

.awatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: var(--r-8);
  background: var(--awatar-tlo);
  color: var(--gold-500);
  font-family: var(--font-mono), monospace;
  font-size: 12px;
}

.kontoNazwa {
  font-size: 13px;
  font-weight: 600;
  color: var(--sidebar-tekst);
}

.kontoRola {
  font-size: 11px;
  color: var(--sidebar-tekst-slaby);
}

.wyloguj {
  background: none;
  border: 1px solid var(--sidebar-obwodka);
  border-radius: var(--r-8);
  padding: 8px;
  font-size: 12px;
  color: var(--sidebar-tekst-przygaszony);
  cursor: pointer;
  min-height: 36px;
}

.wyloguj:hover {
  background: var(--sidebar-hover);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 26px 32px 64px;
}

@media (max-width: 860px) {
  .aplikacja {
    flex-direction: column;
  }

  .sidebar {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'brand user'
      'nav nav';
    gap: 10px;
    width: auto;
    height: auto;
    padding: 11px 14px 9px;
    z-index: 40;
  }

  .brand { grid-area: brand; }
  .stopka { grid-area: user; margin-top: 0; border-top: none; padding-top: 0; flex-direction: row; align-items: center; }
  .nawigacja { grid-area: nav; flex-direction: row; overflow-x: auto; gap: 6px; }

  .pozycja {
    flex: none;
    white-space: nowrap;
    min-height: 44px;
  }

  /* Only the account code and the sign-out button fit on a phone. */
  .kontoNazwa, .kontoRola { display: none; }

  .main {
    padding: 18px 16px 56px;
  }
}
```

- [ ] **Step 3: Napisz komponent powłoki**

`src/app/(app)/Powloka.tsx`:

```tsx
import Link from 'next/link';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { numerRzymski } from '@/lib/domena/rejony';
import { type KluczWidoku, pozycjeNawigacji } from '@/lib/nawigacja';
import style from './powloka.module.css';

const ETYKIETY_ROL: Record<Uzytkownik['rola'], string> = {
  admin: 'Para odpowiedzialna za wspólnotę',
  rejon: 'Para rejonowa',
  podglad: 'Moderator — podgląd',
};

function kodKonta(u: Uzytkownik): string {
  if (u.rola === 'admin') return 'ADM';
  if (u.rola === 'podglad') return 'MOD';
  return u.rejonId === null ? '—' : numerRzymski(u.rejonId);
}

export function Powloka({
  uzytkownik,
  nazwaKonta,
  aktywny,
  liczniki,
  children,
}: {
  uzytkownik: Uzytkownik;
  nazwaKonta: string;
  aktywny: KluczWidoku;
  liczniki: Partial<Record<KluczWidoku, number>>;
  children: React.ReactNode;
}) {
  return (
    <div className={style.aplikacja}>
      <nav className={style.sidebar} aria-label="Nawigacja główna">
        <div className={style.brand}>
          <span className={style.monogram} aria-hidden="true">ŚŻ</span>
          <span>
            <span className={style.brandNazwa}>Kartoteka DK</span>
            <br />
            <span className={style.brandPodpis}>Archidiec. Gdańska</span>
          </span>
        </div>

        <div className={style.nawigacja}>
          {pozycjeNawigacji(uzytkownik).map((p) => (
            <Link
              key={p.klucz}
              href={p.href}
              className={`${style.pozycja} ${p.klucz === aktywny ? style.pozycjaAktywna : ''}`}
              aria-current={p.klucz === aktywny ? 'page' : undefined}
            >
              <span>{p.etykieta}</span>
              {liczniki[p.klucz] !== undefined && (
                <span className={style.licznik}>{liczniki[p.klucz]}</span>
              )}
            </Link>
          ))}
        </div>

        <div className={style.stopka}>
          <div className={style.konto}>
            <span className={style.awatar} aria-hidden="true">{kodKonta(uzytkownik)}</span>
            <span>
              <span className={style.kontoNazwa}>{nazwaKonta}</span>
              <br />
              <span className={style.kontoRola}>{ETYKIETY_ROL[uzytkownik.rola]}</span>
            </span>
          </div>
          <form action="/wyloguj" method="post">
            <button type="submit" className={style.wyloguj}>Wyloguj</button>
          </form>
        </div>
      </nav>

      <main className={style.main}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Podłącz powłokę w layoucie**

`src/app/(app)/layout.tsx` — layout musi znać nazwę konta i liczniki, więc dokłada
jedno zapytanie. Liczniki liczymy w `zakresListy`, żeby para rejonowa widziała
liczbę **swoich** par:

```tsx
import { requireUser } from '@/lib/auth/requireUser';
import { zakresListy, mozeZarzadzacKontami, mozeCzytacAudyt } from '@/lib/auth/permissions';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';
import type { KluczWidoku } from '@/lib/nawigacja';
import { prisma } from '@/lib/db';
import { Powloka } from './Powloka';

export default async function LayoutAplikacji({ children }: { children: React.ReactNode }) {
  const u = await requireUser();

  const [konto, liczbaPar] = await Promise.all([
    prisma.konto.findUniqueOrThrow({ where: { id: u.id }, select: { nazwa: true } }),
    prisma.para.count({ where: zakresListy(u) }),
  ]);

  const liczniki: Partial<Record<KluczWidoku, number>> = { pary: liczbaPar };
  if (u.rola !== 'rejon') liczniki.rejony = LICZBA_REJONOW;
  if (mozeZarzadzacKontami(u)) {
    liczniki.konta = await prisma.konto.count({ where: { rola: { not: 'admin' } } });
  }

  return (
    <Powloka uzytkownik={u} nazwaKonta={konto.nazwa} aktywny="pary" liczniki={liczniki}>
      {children}
    </Powloka>
  );
}
```

`mozeCzytacAudyt` jest zaimportowane, ale historia zmian nie ma licznika — pozycja
nawigacji pojawia się bez plakietki. Usuń nieużywany import, jeśli lint go zgłosi.

- [ ] **Step 5: Sprawdź w przeglądarce**

```bash
docker compose up -d && npm run dev
```

Zaloguj się jako `admin@example.pl` / `kartoteka123`.
Expected: sidebar navy z monogramem, 4 pozycje nawigacji, licznik `300` przy „Wszystkie pary",
`11` przy „Rejony", `12` przy „Konta rejonów"; stopka z kodem `ADM`, nazwą i przyciskiem
„Wyloguj". Jako `rejon7@example.pl` — **jedna** pozycja „Mój rejon" z liczbą par rejonu VII.

Zwęź okno poniżej 860 px.
Expected: sidebar zamienia się w przyklejony pasek u góry, nawigacja przewija się poziomo,
nazwa i rola konta znikają, zostaje kod i „Wyloguj".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add application shell with role-dependent navigation"
```

---

### Task 3: Nagłówek widoku

**Files:**
- Create: `src/app/(app)/NaglowekWidoku.tsx`, `src/app/(app)/naglowek.module.css`

**Interfaces:**
- Produces: `<NaglowekWidoku tytul="…" podtytul="…">{akcje}</NaglowekWidoku>`

- [ ] **Step 1: Napisz style**

`src/app/(app)/naglowek.module.css`:

```css
.naglowek {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.tytul {
  font-family: var(--font-naglowek), Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  letter-spacing: -.01em;
  line-height: 1.1;
}

.podtytul {
  font-size: 14px;
  color: var(--text-muted);
  margin: 4px 0 0;
}

.akcje {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .tytul { font-size: 27px; }
  .akcje { width: 100%; }
}
```

- [ ] **Step 2: Napisz komponent**

`src/app/(app)/NaglowekWidoku.tsx`:

```tsx
import style from './naglowek.module.css';

export function NaglowekWidoku({
  tytul,
  podtytul,
  children,
}: {
  tytul: string;
  podtytul: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={style.naglowek}>
      <div>
        <h1 className={style.tytul}>{tytul}</h1>
        <p className={style.podtytul}>{podtytul}</p>
      </div>
      {children && <div className={style.akcje}>{children}</div>}
    </header>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add view header component"
```

---

### Task 4: Schemat filtrów i sortowania

**Files:**
- Create: `src/lib/pary/filtry.ts`
- Test: `src/lib/pary/filtry.test.ts`

**Interfaces:**
- Consumes: `RODZAJE_REKOLEKCJI`, `STOPNIE` z `@/lib/domena/rekolekcje`; `LICZBA_REJONOW`
- Produces:
  - `type Filtry = { q: string; rejon: number | null; parafia: bigint | null; krag: bigint | null; formacja: Formacja; sort: KluczSortowania; dir: 'asc' | 'desc'; strona: number }`
  - `type Formacja = { rodzaj: 'dowolna' } | { rodzaj: 'ma'; stopien: RodzajRekolekcji } | { rodzaj: 'bez'; stopien: RodzajRekolekcji } | { rodzaj: 'inne' } | { rodzaj: 'brak' }`
  - `type KluczSortowania = 'nazwisko' | 'imiona' | 'email' | 'telefon' | 'rejon' | 'parafia' | 'krag'`
  - `KLUCZE_SORTOWANIA: readonly KluczSortowania[]` — 7 pozycji, bez `formacja`
  - `OPCJE_FORMACJI: readonly { wartosc: string; etykieta: string }[]` — dokładnie 17
  - `type FiltryKlienta = Omit<Filtry, 'parafia' | 'krag'> & { parafia: string | null; krag: string | null }`
  - `parseFiltry(params: Record<string, string | string[] | undefined>): Filtry`
  - `doSearchParams(f: FiltryDoUrl): URLSearchParams` — przyjmuje zarówno `Filtry`, jak i `FiltryKlienta`
  - `czyAktywne(f: Filtry): boolean`
  - `ROZMIAR_STRONY = 50`

- [ ] **Step 1: Napisz test**

`src/lib/pary/filtry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  KLUCZE_SORTOWANIA, OPCJE_FORMACJI, czyAktywne, doSearchParams, parseFiltry,
} from './filtry';

describe('OPCJE_FORMACJI', () => {
  // The acceptance checklist counts these: 1 + 7 + 7 + 1 + 1.
  it('offers exactly seventeen options', () => {
    expect(OPCJE_FORMACJI).toHaveLength(17);
  });

  it('starts with the neutral option and ends with the two special ones', () => {
    expect(OPCJE_FORMACJI[0]).toEqual({ wartosc: 'all', etykieta: 'Formacja — dowolna' });
    expect(OPCJE_FORMACJI.at(-2)).toEqual({ wartosc: 'INNE', etykieta: 'Ma inne rekolekcje' });
    expect(OPCJE_FORMACJI.at(-1)).toEqual({ wartosc: 'brak', etykieta: 'Bez żadnych rekolekcji' });
  });

  it('has a value that parseFiltry accepts for every option', () => {
    for (const opcja of OPCJE_FORMACJI) {
      expect(() => parseFiltry({ formacja: opcja.wartosc })).not.toThrow();
    }
  });
});

describe('parseFiltry', () => {
  it('falls back to defaults on empty input', () => {
    const f = parseFiltry({});
    expect(f).toEqual({
      q: '', rejon: null, parafia: null, krag: null,
      formacja: { rodzaj: 'dowolna' },
      sort: 'nazwisko', dir: 'asc', strona: 1,
    });
  });

  it('reads every filter from the query string', () => {
    const f = parseFiltry({
      q: 'kowal', rejon: '7', parafia: '3', krag: '9',
      formacja: 'ONZ_II', sort: 'email', dir: 'desc', page: '4',
    });
    expect(f.q).toBe('kowal');
    expect(f.rejon).toBe(7);
    expect(f.parafia).toBe(3n);
    expect(f.krag).toBe(9n);
    expect(f.formacja).toEqual({ rodzaj: 'ma', stopien: 'ONZ_II' });
    expect(f.sort).toBe('email');
    expect(f.dir).toBe('desc');
    expect(f.strona).toBe(4);
  });

  it('parses the negated formation options', () => {
    expect(parseFiltry({ formacja: 'bez:ORAR_I' }).formacja)
      .toEqual({ rodzaj: 'bez', stopien: 'ORAR_I' });
    expect(parseFiltry({ formacja: 'brak' }).formacja).toEqual({ rodzaj: 'brak' });
    expect(parseFiltry({ formacja: 'INNE' }).formacja).toEqual({ rodzaj: 'inne' });
  });

  // Garbage in the URL must not 500 the page — a bookmarked or hand-edited
  // link is normal traffic.
  it('ignores values it does not recognise', () => {
    const f = parseFiltry({
      rejon: 'ala-ma-kota', parafia: '-1', formacja: 'ONZ_XVII',
      sort: 'formacja', dir: 'sideways', page: '0',
    });
    expect(f.rejon).toBeNull();
    expect(f.parafia).toBeNull();
    expect(f.formacja).toEqual({ rodzaj: 'dowolna' });
    expect(f.sort).toBe('nazwisko');
    expect(f.dir).toBe('asc');
    expect(f.strona).toBe(1);
  });

  it('rejects a region number outside the range', () => {
    expect(parseFiltry({ rejon: '99' }).rejon).toBeNull();
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseFiltry({ rejon: ['3', '7'] }).rejon).toBe(3);
  });
});

describe('doSearchParams', () => {
  it('round-trips through the query string', () => {
    const f = parseFiltry({ q: 'nowak', rejon: '2', formacja: 'bez:ORD', sort: 'krag', dir: 'desc' });
    const znowu = parseFiltry(Object.fromEntries(doSearchParams(f)));
    expect(znowu).toEqual(f);
  });

  it('omits defaults so a clean list has a clean URL', () => {
    expect(doSearchParams(parseFiltry({})).toString()).toBe('');
  });
});

describe('czyAktywne', () => {
  it('is false for defaults and true for any filter', () => {
    expect(czyAktywne(parseFiltry({}))).toBe(false);
    expect(czyAktywne(parseFiltry({ q: 'a' }))).toBe(true);
    expect(czyAktywne(parseFiltry({ rejon: '3' }))).toBe(true);
    expect(czyAktywne(parseFiltry({ formacja: 'brak' }))).toBe(true);
  });

  it('does not count sorting or paging as a filter', () => {
    expect(czyAktywne(parseFiltry({ sort: 'email', dir: 'desc', page: '3' }))).toBe(false);
  });
});

describe('KLUCZE_SORTOWANIA', () => {
  it('covers seven columns and excludes formation', () => {
    expect(KLUCZE_SORTOWANIA).toHaveLength(7);
    expect(KLUCZE_SORTOWANIA).not.toContain('formacja');
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- filtry`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/pary/filtry.ts`:

```ts
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { RODZAJE_REKOLEKCJI, STOPNIE, opisRodzaju } from '@/lib/domena/rekolekcje';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';

export const ROZMIAR_STRONY = 50;

export type Formacja =
  | { rodzaj: 'dowolna' }
  | { rodzaj: 'ma'; stopien: RodzajRekolekcji }
  | { rodzaj: 'bez'; stopien: RodzajRekolekcji }
  | { rodzaj: 'inne' }
  | { rodzaj: 'brak' };

export type KluczSortowania =
  | 'nazwisko' | 'imiona' | 'email' | 'telefon' | 'rejon' | 'parafia' | 'krag';

// Seven sortable columns. "Formacja" is deliberately absent: it is a computed
// badge, not a column the database can order by meaningfully.
export const KLUCZE_SORTOWANIA: readonly KluczSortowania[] = [
  'nazwisko', 'imiona', 'email', 'telefon', 'rejon', 'parafia', 'krag',
];

export type Filtry = {
  q: string;
  rejon: number | null;
  parafia: bigint | null;
  krag: bigint | null;
  formacja: Formacja;
  sort: KluczSortowania;
  dir: 'asc' | 'desc';
  strona: number;
};

export const OPCJE_FORMACJI: readonly { wartosc: string; etykieta: string }[] = [
  { wartosc: 'all', etykieta: 'Formacja — dowolna' },
  ...STOPNIE.map((s) => ({ wartosc: s, etykieta: `Ma ${opisRodzaju(s).kod}` })),
  ...STOPNIE.map((s) => ({ wartosc: `bez:${s}`, etykieta: `Bez ${opisRodzaju(s).kod}` })),
  { wartosc: 'INNE', etykieta: 'Ma inne rekolekcje' },
  { wartosc: 'brak', etykieta: 'Bez żadnych rekolekcji' },
];

function pierwsza(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function liczba(v: string | string[] | undefined, min: number, max: number): number | null {
  const s = pierwsza(v);
  if (s === undefined) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function bigintDodatni(v: string | string[] | undefined): bigint | null {
  const s = pierwsza(v);
  if (s === undefined || !/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  return n > 0n ? n : null;
}

function parseFormacja(v: string | string[] | undefined): Formacja {
  const s = pierwsza(v);
  if (!s || s === 'all') return { rodzaj: 'dowolna' };
  if (s === 'brak') return { rodzaj: 'brak' };
  if (s === 'INNE') return { rodzaj: 'inne' };

  const zaprzeczony = s.startsWith('bez:');
  const kod = zaprzeczony ? s.slice(4) : s;
  const stopien = STOPNIE.find((x) => x === kod);
  if (!stopien) return { rodzaj: 'dowolna' };
  return zaprzeczony ? { rodzaj: 'bez', stopien } : { rodzaj: 'ma', stopien };
}

/**
 * Never throws. A hand-edited or stale bookmark is ordinary traffic, and an
 * unrecognised value must degrade to the default rather than 500 the page.
 */
export function parseFiltry(params: Record<string, string | string[] | undefined>): Filtry {
  const sortKandydat = pierwsza(params['sort']);
  const sort = KLUCZE_SORTOWANIA.find((k) => k === sortKandydat) ?? 'nazwisko';

  return {
    q: (pierwsza(params['q']) ?? '').trim(),
    rejon: liczba(params['rejon'], 1, LICZBA_REJONOW),
    parafia: bigintDodatni(params['parafia']),
    krag: bigintDodatni(params['krag']),
    formacja: parseFormacja(params['formacja']),
    sort,
    dir: pierwsza(params['dir']) === 'desc' ? 'desc' : 'asc',
    strona: liczba(params['page'], 1, 10_000) ?? 1,
  };
}

function formacjaDoTekstu(f: Formacja): string | null {
  switch (f.rodzaj) {
    case 'dowolna': return null;
    case 'ma': return f.stopien;
    case 'bez': return `bez:${f.stopien}`;
    case 'inne': return 'INNE';
    case 'brak': return 'brak';
  }
}

/**
 * Ids arrive as bigint on the server and as string in the client component —
 * bigint does not cross the server/client boundary. Both are accepted here so
 * there is one serialiser rather than two that can drift apart.
 */
export type FiltryDoUrl = Omit<Filtry, 'parafia' | 'krag'> & {
  parafia: bigint | string | null;
  krag: bigint | string | null;
};

export type FiltryKlienta = Omit<Filtry, 'parafia' | 'krag'> & {
  parafia: string | null;
  krag: string | null;
};

/** Emits only non-default values, so an unfiltered list has a bare URL. */
export function doSearchParams(f: FiltryDoUrl): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.rejon !== null) p.set('rejon', String(f.rejon));
  if (f.parafia !== null) p.set('parafia', String(f.parafia));
  if (f.krag !== null) p.set('krag', String(f.krag));

  const formacja = formacjaDoTekstu(f.formacja);
  if (formacja) p.set('formacja', formacja);

  if (f.sort !== 'nazwisko') p.set('sort', f.sort);
  if (f.dir !== 'asc') p.set('dir', f.dir);
  if (f.strona !== 1) p.set('page', String(f.strona));
  return p;
}

/** Sorting and paging are not filters — the counter suffix must not react to them. */
export function czyAktywne(f: FiltryDoUrl): boolean {
  return (
    f.q !== '' ||
    f.rejon !== null ||
    f.parafia !== null ||
    f.krag !== null ||
    f.formacja.rodzaj !== 'dowolna'
  );
}

export { RODZAJE_REKOLEKCJI };
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- filtry`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add filter and sort parsing with URL round-trip"
```

---

### Task 5: Plakietka formacji

**Files:**
- Create: `src/lib/pary/formacja.ts`
- Test: `src/lib/pary/formacja.test.ts`

**Interfaces:**
- Produces: `opisFormacji(rodzaje: RodzajRekolekcji[]): { tekst: string; maRekolekcje: boolean }`

- [ ] **Step 1: Napisz test**

`src/lib/pary/formacja.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { opisFormacji } from './formacja';

describe('opisFormacji', () => {
  it('shows an em dash when there are no entries', () => {
    expect(opisFormacji([])).toEqual({ tekst: '—', maRekolekcje: false });
  });

  it('shows the highest degree alone when it is the only one', () => {
    expect(opisFormacji(['ONZ_I'])).toEqual({ tekst: 'ONŻ I', maRekolekcje: true });
  });

  it('appends the count of the remaining degrees', () => {
    // ORAR II is the furthest along; four other degrees are present.
    expect(opisFormacji(['ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II']))
      .toEqual({ tekst: 'ORAR II +4', maRekolekcje: true });
  });

  it('ignores gaps when counting', () => {
    expect(opisFormacji(['ONZ_I', 'ORAR_I']).tekst).toBe('ORAR I +1');
  });

  it('counts INNE as having entries but never as the highest degree', () => {
    expect(opisFormacji(['INNE'])).toEqual({ tekst: 'Inne', maRekolekcje: true });
    expect(opisFormacji(['ONZ_I', 'INNE']).tekst).toBe('ONŻ I');
  });

  it('ignores duplicate entries of the same degree', () => {
    expect(opisFormacji(['ONZ_I', 'ONZ_I']).tekst).toBe('ONŻ I');
  });
});
```

- [ ] **Step 2: Uruchom test — musi się wywalić**

Run: `npm test -- formacja`
Expected: FAIL — brak modułu

- [ ] **Step 3: Zaimplementuj**

`src/lib/pary/formacja.ts`:

```ts
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { STOPNIE, najwyzszyStopien, opisRodzaju } from '@/lib/domena/rekolekcje';

/**
 * The badge from the handoff: furthest degree plus how many other degrees the
 * couple has, e.g. "ORAR II +4". INNE counts as having entries but is never
 * the headline — it is not a step on the formation path.
 */
export function opisFormacji(rodzaje: RodzajRekolekcji[]): { tekst: string; maRekolekcje: boolean } {
  if (rodzaje.length === 0) return { tekst: '—', maRekolekcje: false };

  const najwyzszy = najwyzszyStopien(rodzaje);
  if (najwyzszy === null) {
    // Only INNE entries.
    return { tekst: opisRodzaju('INNE').kod, maRekolekcje: true };
  }

  const posiadaneStopnie = new Set(STOPNIE.filter((s) => rodzaje.includes(s)));
  const pozostale = posiadaneStopnie.size - 1;
  const kod = opisRodzaju(najwyzszy).kod;

  return {
    tekst: pozostale > 0 ? `${kod} +${pozostale}` : kod,
    maRekolekcje: true,
  };
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npm test -- formacja`
Expected: PASS, 6 testów

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add formation badge text"
```

---

### Task 6: Warstwa zapytań

Najtrudniejsze zadanie planu. Tu mieszka pułapka z parafią efektywną (spec §4.2) i tu
zawężenie do rejonu musi być strukturalne.

**Files:**
- Create: `prisma/migrations/*_szukajka/migration.sql`, `src/lib/pary/szukanie.ts`, `src/lib/pary/zapytania.ts`
- Modify: `prisma/schema.prisma`
- Test: `src/lib/pary/szukanie.test.ts`, `src/lib/pary/zapytania.int.test.ts`

**Interfaces:**
- Consumes: `zakresListy` z `@/lib/auth/permissions`, `Filtry` (Task 4), `prisma`
- Produces:
  - `type WierszPary = { id: bigint; nazwisko: string; imieZony: string; imieMeza: string; email: string | null; telefon: string | null; rejonId: number; parafia: string | null; krag: string | null; rodzaje: RodzajRekolekcji[] }`
  - `queryPary(u, f): Promise<{ wiersze: WierszPary[]; znalezione: number; wszystkie: number }>`
  - `opcjeFiltrow(u, f): Promise<{ parafie: { id: bigint; etykieta: string }[]; kregi: { id: bigint; etykieta: string }[] }>`

- [ ] **Step 1: Dodaj kolumny wyszukiwania**

`mode: 'insensitive'` w Prismie to `ILIKE` — ignoruje wielkosc liter, ale **nie znaki
diakrytyczne**. „baginscy" nie znajdzie „Baginscy" z ogonkami, a uzytkownicy beda
wpisywac nazwiska bez nich. Spec §8 wymaga tego wprost.

Rozwiazanie: kolumna generowana z tekstem pozbawionym ogonkow, po jednej na tabele,
ktorej pola przeszukujemy. Kolumna generowana wymaga funkcji `IMMUTABLE`, a `unaccent`
taka nie jest — stad opakowanie. To znany haczyk Postgresa, nie nasz wymysl.

```bash
npx prisma migrate dev --create-only --name szukajka
```

Wypelnij `migration.sql`:

```sql
-- unaccent() is declared STABLE because it depends on a dictionary that could
-- in principle be changed. Generated columns require IMMUTABLE, so we pin the
-- dictionary and wrap it. This is the standard Postgres workaround.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

ALTER TABLE "para" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce("nazwisko", '') || ' ' ||
      coalesce("imie_zony", '') || ' ' ||
      coalesce("imie_meza", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("telefon", '')
    ))
  ) STORED;

ALTER TABLE "parafia" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (
    immutable_unaccent(lower(coalesce("nazwa", '') || ' ' || coalesce("miasto", '')))
  ) STORED;

ALTER TABLE "krag" ADD COLUMN "szukajka" text
  GENERATED ALWAYS AS (immutable_unaccent(lower(coalesce("patron", '')))) STORED;

-- Substring search cannot use a plain btree index; trigram can.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "para_szukajka_idx" ON "para" USING gin ("szukajka" gin_trgm_ops);
```

Dopisz kolumny do `prisma/schema.prisma` — Prisma nie tworzy kolumn wyliczanych,
ale musi o nich wiedziec, zeby dalo sie po nich filtrowac:

```prisma
model Para {
  // …
  /// Generated column: lower-case, unaccented text of the searchable fields.
  /// Written by Postgres, never by the application.
  szukajka String?
}
```

To samo w `Parafia` i `Krag`. Zastosuj:

```bash
npx prisma migrate dev
npx prisma generate
```

**Uwaga:** kolumna jest `GENERATED ALWAYS` — proba zapisu do niej konczy sie bledem
bazy. Warstwa zapisu z Planu 3 nie moze jej dotykac, wiec pomijaj ja w `select`
i `data` przy tworzeniu i edycji pary.

- [ ] **Step 2: Napisz i przetestuj normalizacje zapytania**

Zapytanie uzytkownika trzeba pozbawic ogonkow dokladnie tak samo jak kolumne.

`src/lib/pary/szukanie.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bezOgonkow } from './szukanie';

describe('bezOgonkow', () => {
  it('strips Polish diacritics and lowercases', () => {
    expect(bezOgonkow('Bagińscy')).toBe('baginscy');
    expect(bezOgonkow('ŻÓŁĆ')).toBe('zolc');
  });

  it('handles every Polish diacritic', () => {
    expect(bezOgonkow('ąćęłńóśźż')).toBe('acelnoszz');
  });

  it('leaves plain text alone', () => {
    expect(bezOgonkow('Kowalscy')).toBe('kowalscy');
  });

  it('handles the empty string', () => {
    expect(bezOgonkow('')).toBe('');
  });
});
```

`src/lib/pary/szukanie.ts`:

```ts
/**
 * Mirrors the `szukajka` generated column: lower case, no diacritics. Must stay
 * in step with immutable_unaccent(lower(…)) in the migration, or a query will
 * never match the column it is compared against.
 */
export function bezOgonkow(tekst: string): string {
  return tekst
    .toLowerCase()
    // l-stroke has no Unicode decomposition, so it must go before NFD.
    .replace(/\u0142/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
```

Run: `npm test -- szukanie`
Expected: PASS

- [ ] **Step 3: Napisz test integracyjny warstwy zapytan**

`src/lib/pary/zapytania.int.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { parseFiltry } from './filtry';
import { opcjeFiltrow, queryPary } from './zapytania';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonIII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 3 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

describe('queryPary — zakres', () => {
  it('gives admin the whole community', async () => {
    const { wszystkie } = await queryPary(admin, parseFiltry({}));
    expect(wszystkie).toBe(300);
  });

  it('narrows a region account to its own region', async () => {
    const { wiersze, wszystkie } = await queryPary(rejonIII, parseFiltry({}));
    expect(wszystkie).toBeLessThan(300);
    expect(wszystkie).toBeGreaterThan(0);
    expect(wiersze.every((w) => w.rejonId === 3)).toBe(true);
  });

  // Scope must not be overridable through the query string.
  it('ignores a region filter pointing outside the account scope', async () => {
    const { wiersze } = await queryPary(rejonIII, parseFiltry({ rejon: '7' }));
    expect(wiersze.every((w) => w.rejonId === 3)).toBe(true);
  });

  it('lets the viewer read the whole community', async () => {
    const { wszystkie } = await queryPary(moderator, parseFiltry({}));
    expect(wszystkie).toBe(300);
  });
});

describe('queryPary — szukanie', () => {
  it('matches on surname regardless of case', async () => {
    const { wiersze } = await queryPary(admin, parseFiltry({ q: 'kowalscy' }));
    expect(wiersze.length).toBeGreaterThan(0);
    expect(wiersze.every((w) => w.nazwisko.toLowerCase().includes('kowalscy'))).toBe(true);
  });

  it('matches without Polish diacritics', async () => {
    const zOgonkami = await queryPary(admin, parseFiltry({ q: 'Bagińscy' }));
    const bezOgonkow = await queryPary(admin, parseFiltry({ q: 'baginscy' }));
    expect(bezOgonkow.znalezione).toBe(zOgonkami.znalezione);
    expect(bezOgonkow.znalezione).toBeGreaterThan(0);
  });

  it('searches first names, e-mail and phone too', async () => {
    for (const q of ['anna', '@example.pl', '+48']) {
      const { znalezione } = await queryPary(admin, parseFiltry({ q }));
      expect(znalezione, `nothing found for ${q}`).toBeGreaterThan(0);
    }
  });
});

describe('queryPary — filtr formacji', () => {
  it('returns a non-empty result for every one of the seventeen options', async () => {
    const { OPCJE_FORMACJI } = await import('./filtry');
    for (const opcja of OPCJE_FORMACJI) {
      const { znalezione } = await queryPary(admin, parseFiltry({ formacja: opcja.wartosc }));
      expect(znalezione, `empty for ${opcja.wartosc}`).toBeGreaterThan(0);
    }
  });

  it('"ma" and "bez" partition the community', async () => {
    const ma = await queryPary(admin, parseFiltry({ formacja: 'ORAR_I' }));
    const bez = await queryPary(admin, parseFiltry({ formacja: 'bez:ORAR_I' }));
    expect(ma.znalezione + bez.znalezione).toBe(300);
  });
});

describe('queryPary — parafia efektywna', () => {
  // A couple with its own parafia_id must be found by that parish, and a couple
  // without one must be found by its circle's parish. Filtering on
  // para.parafia_id alone would silently drop the majority.
  it('finds couples through both their own and their circle parish', async () => {
    const wlasna = await prisma.para.findFirstOrThrow({
      where: { parafiaId: { not: null } },
      select: { parafiaId: true },
    });
    const przezWlasna = await queryPary(admin, parseFiltry({ parafia: String(wlasna.parafiaId) }));
    expect(przezWlasna.znalezione).toBeGreaterThan(0);

    const zKregu = await prisma.para.findFirstOrThrow({
      where: { parafiaId: null, kragId: { not: null } },
      select: { krag: { select: { parafiaId: true } } },
    });
    const przezKrag = await queryPary(
      admin,
      parseFiltry({ parafia: String(zKregu.krag!.parafiaId) }),
    );
    expect(przezKrag.znalezione).toBeGreaterThan(0);
  });
});

describe('queryPary — sortowanie i paginacja', () => {
  it('sorts by surname using Polish collation by default', async () => {
    const { wiersze } = await queryPary(admin, parseFiltry({}));
    const nazwiska = wiersze.map((w) => w.nazwisko);
    expect([...nazwiska].sort((a, b) => a.localeCompare(b, 'pl'))).toEqual(nazwiska);
  });

  it('reverses on dir=desc', async () => {
    const rosnaco = await queryPary(admin, parseFiltry({}));
    const malejaco = await queryPary(admin, parseFiltry({ dir: 'desc' }));
    expect(malejaco.wiersze[0]!.nazwisko >= rosnaco.wiersze[0]!.nazwisko).toBe(true);
  });

  it('pages fifty at a time without overlapping', async () => {
    const pierwsza = await queryPary(admin, parseFiltry({}));
    const druga = await queryPary(admin, parseFiltry({ page: '2' }));
    expect(pierwsza.wiersze).toHaveLength(50);
    const idPierwszej = new Set(pierwsza.wiersze.map((w) => String(w.id)));
    expect(druga.wiersze.some((w) => idPierwszej.has(String(w.id)))).toBe(false);
  });

  it('returns an empty page rather than failing past the end', async () => {
    const { wiersze, znalezione } = await queryPary(admin, parseFiltry({ page: '999' }));
    expect(wiersze).toHaveLength(0);
    expect(znalezione).toBe(300);
  });
});

describe('opcjeFiltrow', () => {
  it('narrows parishes to the chosen region', async () => {
    const wszystkie = await opcjeFiltrow(admin, parseFiltry({}));
    const wRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(wRejonie.parafie.length).toBeGreaterThan(0);
    expect(wRejonie.parafie.length).toBeLessThanOrEqual(wszystkie.parafie.length);
  });

  it('narrows circles to the chosen region and parish', async () => {
    const wRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(wRejonie.kregi.length).toBeGreaterThan(0);
    expect(wRejonie.kregi.every((k) => k.etykieta.length > 0)).toBe(true);
  });

  it('offers a region account only its own region options', async () => {
    const { parafie } = await opcjeFiltrow(rejonIII, parseFiltry({}));
    const adminaWRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(parafie.length).toBe(adminaWRejonie.parafie.length);
  });
});
```

- [ ] **Step 4: Uruchom test — musi sie wywalic**

Run: `npm run test:int -- zapytania`
Expected: FAIL — brak modułu

- [ ] **Step 5: Zaimplementuj**

`src/lib/pary/zapytania.ts`:

```ts
import type { Prisma } from '@/generated/prisma/client';
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { type Uzytkownik, zakresListy } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { type Filtry, ROZMIAR_STRONY } from './filtry';
import { bezOgonkow } from './szukanie';

export type WierszPary = {
  id: bigint;
  nazwisko: string;
  imieZony: string;
  imieMeza: string;
  email: string | null;
  telefon: string | null;
  rejonId: number;
  parafia: string | null;
  krag: string | null;
  rodzaje: RodzajRekolekcji[];
};

/**
 * A couple's parish is its own when set, otherwise its circle's (spec 4.2).
 * Filtering on para.parafia_id alone would drop every couple that simply
 * inherits its circle's parish — which is most of them.
 */
function warunekParafii(parafiaId: bigint): Prisma.ParaWhereInput {
  return {
    OR: [
      { parafiaId },
      { parafiaId: null, krag: { parafiaId } },
    ],
  };
}

function warunekFormacji(f: Filtry['formacja']): Prisma.ParaWhereInput {
  switch (f.rodzaj) {
    case 'dowolna': return {};
    case 'ma': return { rekolekcje: { some: { rodzaj: f.stopien } } };
    case 'bez': return { rekolekcje: { none: { rodzaj: f.stopien } } };
    case 'inne': return { rekolekcje: { some: { rodzaj: 'INNE' } } };
    case 'brak': return { rekolekcje: { none: {} } };
  }
}

function warunekSzukania(q: string): Prisma.ParaWhereInput {
  if (!q) return {};
  // Compared against the generated `szukajka` columns, which Postgres keeps
  // lower-cased and unaccented. Plain `contains` suffices: both sides of the
  // comparison have already been normalised the same way.
  const zawiera = { contains: bezOgonkow(q) };
  return {
    OR: [
      { szukajka: zawiera },
      { parafia: { szukajka: zawiera } },
      { krag: { szukajka: zawiera } },
      // A couple with no parish of its own is searchable through its circle's.
      { parafiaId: null, krag: { parafia: { szukajka: zawiera } } },
    ],
  };
}

function where(u: Uzytkownik, f: Filtry): Prisma.ParaWhereInput {
  const warunki: Prisma.ParaWhereInput[] = [
    // Always first and never optional: this is what keeps a region account
    // inside its region and soft-deleted couples out of every list.
    zakresListy(u),
    warunekSzukania(f.q),
    warunekFormacji(f.formacja),
  ];

  // A region account's own scope already pins the region; an explicit filter
  // may only narrow further, never widen.
  if (f.rejon !== null) warunki.push({ rejonId: f.rejon });
  if (f.parafia !== null) warunki.push(warunekParafii(f.parafia));
  if (f.krag !== null) warunki.push({ kragId: f.krag });

  return { AND: warunki };
}

function orderBy(f: Filtry): Prisma.ParaOrderByWithRelationInput[] {
  const kierunek = f.dir;
  switch (f.sort) {
    case 'imiona': return [{ imieZony: kierunek }, { nazwisko: 'asc' }];
    case 'email': return [{ email: kierunek }, { nazwisko: 'asc' }];
    case 'telefon': return [{ telefon: kierunek }, { nazwisko: 'asc' }];
    case 'rejon': return [{ rejonId: kierunek }, { nazwisko: 'asc' }];
    case 'parafia': return [{ parafia: { nazwa: kierunek } }, { nazwisko: 'asc' }];
    case 'krag': return [{ krag: { numer: kierunek } }, { nazwisko: 'asc' }];
    case 'nazwisko':
    default: return [{ nazwisko: kierunek }, { imieZony: 'asc' }];
  }
}

function etykietaKregu(numer: number, patron: string | null): string {
  return patron ? `${numer} · ${patron}` : String(numer);
}

export async function queryPary(
  u: Uzytkownik,
  f: Filtry,
): Promise<{ wiersze: WierszPary[]; znalezione: number; wszystkie: number }> {
  const warunek = where(u, f);

  const [rekordy, znalezione, wszystkie] = await Promise.all([
    prisma.para.findMany({
      where: warunek,
      orderBy: orderBy(f),
      skip: (f.strona - 1) * ROZMIAR_STRONY,
      take: ROZMIAR_STRONY,
      select: {
        id: true, nazwisko: true, imieZony: true, imieMeza: true,
        email: true, telefon: true, rejonId: true,
        parafia: { select: { nazwa: true, miasto: true } },
        krag: {
          select: {
            numer: true, patron: true,
            parafia: { select: { nazwa: true, miasto: true } },
          },
        },
        rekolekcje: { select: { rodzaj: true } },
      },
    }),
    prisma.para.count({ where: warunek }),
    prisma.para.count({ where: zakresListy(u) }),
  ]);

  const wiersze: WierszPary[] = rekordy.map((r) => {
    const parafia = r.parafia ?? r.krag?.parafia ?? null;
    return {
      id: r.id,
      nazwisko: r.nazwisko,
      imieZony: r.imieZony,
      imieMeza: r.imieMeza,
      email: r.email,
      telefon: r.telefon,
      rejonId: r.rejonId,
      parafia: parafia ? `${parafia.nazwa}, ${parafia.miasto}` : null,
      krag: r.krag ? etykietaKregu(r.krag.numer, r.krag.patron) : null,
      rodzaje: r.rekolekcje.map((x) => x.rodzaj),
    };
  });

  return { wiersze, znalezione, wszystkie };
}

/**
 * Options for the cascading selects. Both lists are derived from the couples
 * the user may actually see, so a region account never learns which parishes
 * exist elsewhere.
 */
export async function opcjeFiltrow(
  u: Uzytkownik,
  f: Filtry,
): Promise<{
  parafie: { id: bigint; etykieta: string }[];
  kregi: { id: bigint; etykieta: string }[];
}> {
  const zakres: Prisma.ParaWhereInput = {
    AND: [zakresListy(u), f.rejon !== null ? { rejonId: f.rejon } : {}],
  };

  const pary = await prisma.para.findMany({
    where: zakres,
    select: {
      parafia: { select: { id: true, nazwa: true, miasto: true } },
      krag: {
        select: {
          id: true, numer: true, patron: true,
          parafia: { select: { id: true, nazwa: true, miasto: true } },
        },
      },
    },
  });

  const parafie = new Map<string, { id: bigint; etykieta: string }>();
  const kregi = new Map<string, { id: bigint; etykieta: string }>();

  for (const p of pary) {
    const parafia = p.parafia ?? p.krag?.parafia ?? null;
    if (parafia) {
      parafie.set(String(parafia.id), {
        id: parafia.id,
        etykieta: `${parafia.nazwa}, ${parafia.miasto}`,
      });
    }
    // Circles are narrowed by the chosen parish as well as the region.
    if (p.krag && (f.parafia === null || parafia?.id === f.parafia)) {
      kregi.set(String(p.krag.id), {
        id: p.krag.id,
        etykieta: `Krąg ${etykietaKregu(p.krag.numer, p.krag.patron)}`,
      });
    }
  }

  const wgEtykiety = (a: { etykieta: string }, b: { etykieta: string }) =>
    a.etykieta.localeCompare(b.etykieta, 'pl', { numeric: true });

  return {
    parafie: [...parafie.values()].sort(wgEtykiety),
    kregi: [...kregi.values()].sort(wgEtykiety),
  };
}
```

- [ ] **Step 6: Uruchom test — musi przejsc**

Run: `npm run test:int -- zapytania`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add couple list queries with scoped filtering"
```

---

### Task 7: Plakietki

**Files:**
- Create: `src/components/PlakietkaRejonu.tsx`, `src/components/PlakietkaFormacji.tsx`, `src/components/plakietki.module.css`

**Interfaces:**
- Consumes: `kolorRejonu`, `numerRzymski` (`@/lib/domena/rejony`), `opisFormacji` (Task 5)
- Produces: `<PlakietkaRejonu rejon={7} />`, `<PlakietkaRejonu rejon={7} sufiks="krąg 3 · św. Rity" />`, `<PlakietkaFormacji rodzaje={[…]} />`

- [ ] **Step 1: Napisz style**

`src/components/plakietki.module.css`:

```css
.plakietka {
  display: inline-block;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  border-radius: var(--r-5);
  padding: 3px 8px;
  white-space: nowrap;
}

/* The region colour arrives as a custom property so the palette stays in
   tokens.css; `color-mix` produces the 1a alpha the handoff specifies. */
.rejon {
  color: var(--kolor-rejonu);
  background: color-mix(in srgb, var(--kolor-rejonu) 10%, transparent);
}

.formacjaMa {
  background: var(--success-bg);
  color: var(--success-fg);
}

.formacjaBrak {
  background: var(--bg-row);
  color: var(--placeholder);
}
```

- [ ] **Step 2: Napisz komponenty**

`src/components/PlakietkaRejonu.tsx`:

```tsx
import { kolorRejonu, numerRzymski } from '@/lib/domena/rejony';
import style from './plakietki.module.css';

export function PlakietkaRejonu({ rejon, sufiks }: { rejon: number; sufiks?: string }) {
  return (
    <span
      className={`${style.plakietka} ${style.rejon}`}
      style={{ '--kolor-rejonu': kolorRejonu(rejon) } as React.CSSProperties}
    >
      {numerRzymski(rejon)}
      {sufiks ? ` · ${sufiks}` : ''}
    </span>
  );
}
```

`src/components/PlakietkaFormacji.tsx`:

```tsx
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { opisFormacji } from '@/lib/pary/formacja';
import style from './plakietki.module.css';

export function PlakietkaFormacji({ rodzaje }: { rodzaje: RodzajRekolekcji[] }) {
  const { tekst, maRekolekcje } = opisFormacji(rodzaje);
  return (
    <span
      className={`${style.plakietka} ${maRekolekcje ? style.formacjaMa : style.formacjaBrak}`}
    >
      {tekst}
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add region and formation badges"
```

---

### Task 8: Tabela i karty

Jeden zestaw danych, dwie prezentacje, przełączane **CSS-em**. Nie `window.innerWidth`:
komponent czytający szerokość okna renderuje na serwerze inaczej niż w przeglądarce
i widok przeskakuje przy hydratacji.

**Files:**
- Create: `src/app/(app)/pary/TabelaPar.tsx`, `src/app/(app)/pary/KartyPar.tsx`, `src/app/(app)/pary/pary.module.css`

**Interfaces:**
- Consumes: `WierszPary` (Task 6), `Filtry`, `doSearchParams`, plakietki (Task 7), `mozeEdytowac`
- Produces: `<TabelaPar wiersze={…} filtry={…} uzytkownik={…} />`, `<KartyPar wiersze={…} />` — karty nie rozróżniają edycji od podglądu, bo cała karta jest jednym linkiem

- [ ] **Step 1: Napisz style listy**

`src/app/(app)/pary/pary.module.css`:

```css
/* --- przełącznik tabela/karty --- */
.tylkoDesktop { display: block; }
.tylkoMobile { display: none; }

@media (max-width: 860px) {
  .tylkoDesktop { display: none; }
  .tylkoMobile { display: block; }
}

/* --- tabela --- */
.kontener {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-12);
  overflow: hidden;
  box-shadow: var(--cien-tabela);
}

.przewijanie { overflow-x: auto; }

.tabela {
  width: 100%;
  min-width: 1060px;
  border-collapse: collapse;
  font-size: 14px;
}

.tabela thead {
  background: var(--bg-row);
  border-bottom: 1px solid var(--border);
}

.tabela th {
  padding: 0;
  text-align: left;
  white-space: nowrap;
}

.naglowekSortowania {
  display: block;
  width: 100%;
  padding: 11px 15px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--text-muted);
  text-decoration: none;
}

.naglowekSortowania:hover { color: var(--navy-700); }

.naglowekAktywny { color: var(--navy-700); }

.naglowekZwykly {
  display: block;
  padding: 11px 15px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tabela tbody tr { border-bottom: 1px solid var(--divider); }
.tabela tbody tr:hover { background: #f7f9fc; }

.tabela td {
  padding: 12px 15px;
  color: var(--text-body);
}

.nazwisko { font-weight: 600; color: var(--text); }
.mono { font-family: var(--font-mono), monospace; font-size: 13px; }

.akcja {
  text-align: right;
}

.linkAkcji {
  color: var(--text-faint);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}

.linkAkcji:hover { color: var(--navy-700); }

.pusty {
  padding: 46px;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}

/* --- karty --- */
.karty {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.karta {
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-11);
  padding: 14px;
  text-decoration: none;
  color: inherit;
}

.karta:active { background: #f7f9fc; }

.kartaWiersz {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.kartaNazwisko { font-size: 16px; font-weight: 700; color: var(--text); }
.kartaImiona { font-size: 14px; color: var(--text-body); }

.kartaMeta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-top: 1px solid var(--divider);
  padding-top: 9px;
  font-size: 13px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
```

`#f7f9fc` to `--bg-row-alt` — użyj tokena, nie literału. Powyższy blok pokazuje go
dosłownie tylko dla czytelności; w pliku ma być `var(--bg-row-alt)`.

- [ ] **Step 2: Napisz tabelę**

`src/app/(app)/pary/TabelaPar.tsx`:

```tsx
import Link from 'next/link';
import { PlakietkaFormacji } from '@/components/PlakietkaFormacji';
import { PlakietkaRejonu } from '@/components/PlakietkaRejonu';
import { type Uzytkownik, mozeEdytowac } from '@/lib/auth/permissions';
import { type Filtry, type KluczSortowania, doSearchParams } from '@/lib/pary/filtry';
import type { WierszPary } from '@/lib/pary/zapytania';
import style from './pary.module.css';

const KOLUMNY: { klucz: KluczSortowania; etykieta: string }[] = [
  { klucz: 'nazwisko', etykieta: 'Nazwisko' },
  { klucz: 'imiona', etykieta: 'Imiona' },
  { klucz: 'email', etykieta: 'E-mail' },
  { klucz: 'telefon', etykieta: 'Telefon' },
  { klucz: 'rejon', etykieta: 'Rejon' },
  { klucz: 'parafia', etykieta: 'Parafia' },
  { klucz: 'krag', etykieta: 'Krąg' },
];

function linkSortowania(f: Filtry, klucz: KluczSortowania): string {
  // Clicking the active column flips direction; any other column starts ascending.
  const dir = f.sort === klucz && f.dir === 'asc' ? 'desc' : 'asc';
  const params = doSearchParams({ ...f, sort: klucz, dir, strona: 1 });
  const qs = params.toString();
  return qs ? `/pary?${qs}` : '/pary';
}

function ariaSort(f: Filtry, klucz: KluczSortowania): 'ascending' | 'descending' | 'none' {
  if (f.sort !== klucz) return 'none';
  return f.dir === 'asc' ? 'ascending' : 'descending';
}

export function TabelaPar({
  wiersze,
  filtry,
  uzytkownik,
}: {
  wiersze: WierszPary[];
  filtry: Filtry;
  uzytkownik: Uzytkownik;
}) {
  if (wiersze.length === 0) {
    return (
      <div className={style.kontener}>
        <p className={style.pusty}>Brak wyników dla podanych kryteriów.</p>
      </div>
    );
  }

  return (
    <div className={style.kontener}>
      <div className={style.przewijanie}>
        <table className={style.tabela}>
          <thead>
            <tr>
              {KOLUMNY.map((k) => (
                <th key={k.klucz} scope="col" aria-sort={ariaSort(filtry, k.klucz)}>
                  <Link
                    href={linkSortowania(filtry, k.klucz)}
                    className={`${style.naglowekSortowania} ${
                      filtry.sort === k.klucz ? style.naglowekAktywny : ''
                    }`}
                  >
                    {k.etykieta}
                    {filtry.sort === k.klucz && (filtry.dir === 'asc' ? ' ↑' : ' ↓')}
                  </Link>
                </th>
              ))}
              {/* Formation is a computed badge, so it is not sortable. */}
              <th scope="col"><span className={style.naglowekZwykly}>Formacja</span></th>
              <th scope="col"><span className={style.naglowekZwykly}>&nbsp;</span></th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => {
              const edytowalna = mozeEdytowac(uzytkownik, { rejonId: w.rejonId });
              return (
                <tr key={String(w.id)}>
                  <td className={style.nazwisko}>{w.nazwisko}</td>
                  <td>{`${w.imieZony} i ${w.imieMeza}`}</td>
                  <td>{w.email ?? '—'}</td>
                  <td className={style.mono}>{w.telefon ?? '—'}</td>
                  <td><PlakietkaRejonu rejon={w.rejonId} /></td>
                  <td>{w.parafia ?? '—'}</td>
                  <td className={style.mono}>{w.krag ?? '—'}</td>
                  <td><PlakietkaFormacji rodzaje={w.rodzaje} /></td>
                  <td className={style.akcja}>
                    {/* The interactive element is a real link, so keyboard
                        navigation works without tabindex on the row. */}
                    <Link href={`/pary?karta=${w.id}`} className={style.linkAkcji}>
                      {edytowalna ? 'Edytuj →' : 'Podgląd →'}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Napisz karty**

`src/app/(app)/pary/KartyPar.tsx`:

```tsx
import Link from 'next/link';
import { PlakietkaFormacji } from '@/components/PlakietkaFormacji';
import { PlakietkaRejonu } from '@/components/PlakietkaRejonu';
import type { WierszPary } from '@/lib/pary/zapytania';
import style from './pary.module.css';

export function KartyPar({ wiersze }: { wiersze: WierszPary[] }) {
  if (wiersze.length === 0) {
    return <p className={style.pusty}>Brak wyników dla podanych kryteriów.</p>;
  }

  return (
    <div className={style.karty}>
      {wiersze.map((w) => (
        <Link key={String(w.id)} href={`/pary?karta=${w.id}`} className={style.karta}>
          <div className={style.kartaWiersz}>
            <span className={style.kartaNazwisko}>{w.nazwisko}</span>
            <PlakietkaRejonu rejon={w.rejonId} sufiks={w.krag ? `krąg ${w.krag}` : undefined} />
          </div>
          <div className={style.kartaWiersz}>
            <span className={style.kartaImiona}>{`${w.imieZony} i ${w.imieMeza}`}</span>
            <PlakietkaFormacji rodzaje={w.rodzaje} />
          </div>
          <div className={style.kartaMeta}>
            <span>{w.telefon ?? '—'}</span>
            <span>{w.email ?? '—'}</span>
            <span>{w.parafia ?? '—'}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add couple table and mobile cards"
```

---

### Task 9: Pasek filtrów

Jedyny komponent kliencki w tym planie. **Nie trzyma stanu** — czyta go z URL i do URL
zapisuje.

**Files:**
- Create: `src/app/(app)/pary/PasekFiltrow.tsx`, `src/app/(app)/pary/filtry.module.css`

**Interfaces:**
- Consumes: `Filtry`, `OPCJE_FORMACJI`, `doSearchParams`, opcje z `opcjeFiltrow`
- Produces: `<PasekFiltrow filtry={…} opcje={…} liczniki={…} pokazRejon={…} />`

- [ ] **Step 1: Napisz style**

`src/app/(app)/pary/filtry.module.css`:

```css
.pasek {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.kontrolka {
  min-height: 44px;
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  padding: 12px;
  font-size: 14px;
  color: var(--text);
}

.kontrolka:focus {
  border-color: var(--blue-500);
  box-shadow: 0 0 0 3px rgba(28, 95, 150, .12);
  outline: none;
}

.szukaj {
  min-width: 100%;
  font-size: 15px;
}

.rejon { flex: 1; min-width: 130px; }
.parafia { flex: 2; min-width: 190px; }
.krag { flex: 2; min-width: 180px; }
.formacja { flex: 1; min-width: 165px; }

.licznik {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
```

Wartość `rgba(28, 95, 150, .12)` powtarza się z ekranu logowania — wynieś ją do
`tokens.css` jako `--focus-obwodka` i użyj w obu miejscach.

- [ ] **Step 2: Napisz komponent**

`src/app/(app)/pary/PasekFiltrow.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LICZBA_REJONOW, numerRzymski } from '@/lib/domena/rejony';
import { KREGI, PARAFIE, odmiana } from '@/lib/pl';
import { type FiltryKlienta, OPCJE_FORMACJI, doSearchParams } from '@/lib/pary/filtry';
import style from './filtry.module.css';

type Opcje = {
  parafie: { id: string; etykieta: string }[];
  kregi: { id: string; etykieta: string }[];
};

export function PasekFiltrow({
  filtry,
  opcje,
  znalezione,
  wszystkie,
  aktywne,
  pokazRejon,
}: {
  // FiltryKlienta, not Filtry: bigint does not survive the server/client
  // boundary, so parish and circle ids travel as strings.
  filtry: FiltryKlienta;
  opcje: Opcje;
  znalezione: number;
  wszystkie: number;
  aktywne: boolean;
  pokazRejon: boolean;
}) {
  const router = useRouter();
  const [wTrakcie, startTransition] = useTransition();

  function zastosuj(zmiana: Partial<FiltryKlienta>) {
    // Any filter change returns to page one; a filtered result set has no
    // page 4 to stay on.
    const nowe = { ...filtry, ...zmiana, strona: 1 };
    const qs = doSearchParams(nowe).toString();
    startTransition(() => router.replace(qs ? `/pary?${qs}` : '/pary', { scroll: false }));
  }

  return (
    <div className={style.pasek} aria-busy={wTrakcie}>
      <input
        className={`${style.kontrolka} ${style.szukaj}`}
        type="search"
        defaultValue={filtry.q}
        placeholder="Szukaj: nazwisko, imię, e-mail…"
        aria-label="Szukaj"
        onChange={(e) => zastosuj({ q: e.currentTarget.value })}
      />

      {pokazRejon && (
        <select
          className={`${style.kontrolka} ${style.rejon}`}
          value={filtry.rejon ?? 'all'}
          aria-label="Rejon"
          // Changing the region invalidates both narrower choices.
          onChange={(e) => zastosuj({
            rejon: e.currentTarget.value === 'all' ? null : Number(e.currentTarget.value),
            parafia: null,
            krag: null,
          })}
        >
          <option value="all">Wszystkie rejony</option>
          {Array.from({ length: LICZBA_REJONOW }, (_, i) => i + 1).map((r) => (
            <option key={r} value={r}>{`Rejon ${numerRzymski(r)}`}</option>
          ))}
        </select>
      )}

      <select
        className={`${style.kontrolka} ${style.parafia}`}
        value={filtry.parafia ?? 'all'}
        aria-label="Parafia"
        onChange={(e) => zastosuj({
          parafia: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
          krag: null,
        })}
      >
        <option value="all">{`Wszystkie — ${odmiana(opcje.parafie.length, PARAFIE)}`}</option>
        {opcje.parafie.map((p) => (
          <option key={p.id} value={p.id}>{p.etykieta}</option>
        ))}
      </select>

      <select
        className={`${style.kontrolka} ${style.krag}`}
        value={filtry.krag ?? 'all'}
        aria-label="Krąg"
        onChange={(e) => zastosuj({
          krag: e.currentTarget.value === 'all' ? null : e.currentTarget.value,
        })}
      >
        <option value="all">{`Wszystkie — ${odmiana(opcje.kregi.length, KREGI)}`}</option>
        {opcje.kregi.map((k) => (
          <option key={k.id} value={k.id}>{k.etykieta}</option>
        ))}
      </select>

      <select
        className={`${style.kontrolka} ${style.formacja}`}
        value={
          filtry.formacja.rodzaj === 'dowolna' ? 'all'
          : filtry.formacja.rodzaj === 'ma' ? filtry.formacja.stopien
          : filtry.formacja.rodzaj === 'bez' ? `bez:${filtry.formacja.stopien}`
          : filtry.formacja.rodzaj === 'inne' ? 'INNE'
          : 'brak'
        }
        aria-label="Formacja"
        onChange={(e) => {
          const params = new URLSearchParams(doSearchParams(filtry));
          params.set('formacja', e.currentTarget.value);
          params.delete('page');
          startTransition(() => router.replace(`/pary?${params.toString()}`, { scroll: false }));
        }}
      >
        {OPCJE_FORMACJI.map((o) => (
          <option key={o.wartosc} value={o.wartosc}>{o.etykieta}</option>
        ))}
      </select>

      <span className={style.licznik} role="status">
        {znalezione} / {wszystkie}{aktywne ? ' (filtr)' : ''}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add filter bar writing state to the URL"
```

---

### Task 10: Strona listy

Spina wszystko. Tu rozstrzyga się problem `bigint` przez granicę serwer–klient.

**Files:**
- Modify: `src/app/(app)/pary/page.tsx`
- Create: `src/app/(app)/pary/Paginacja.tsx`

**Interfaces:**
- Consumes: wszystko z Zadań 1–9

- [ ] **Step 1: Napisz paginację**

`src/app/(app)/pary/Paginacja.tsx`:

```tsx
import Link from 'next/link';
import { type Filtry, ROZMIAR_STRONY, doSearchParams } from '@/lib/pary/filtry';
import style from './pary.module.css';

function link(f: Filtry, strona: number): string {
  const qs = doSearchParams({ ...f, strona }).toString();
  return qs ? `/pary?${qs}` : '/pary';
}

export function Paginacja({ filtry, znalezione }: { filtry: Filtry; znalezione: number }) {
  const stron = Math.ceil(znalezione / ROZMIAR_STRONY);
  if (stron <= 1) return null;

  return (
    <nav className={style.paginacja} aria-label="Strony wyników">
      {filtry.strona > 1 && (
        <Link href={link(filtry, filtry.strona - 1)} className={style.stronaLink}>
          ← Poprzednia
        </Link>
      )}
      <span className={style.stronaLicznik}>
        Strona {filtry.strona} z {stron}
      </span>
      {filtry.strona < stron && (
        <Link href={link(filtry, filtry.strona + 1)} className={style.stronaLink}>
          Następna →
        </Link>
      )}
    </nav>
  );
}
```

Dopisz do `pary.module.css`:

```css
.paginacja {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding-top: 4px;
}

.stronaLink {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 15px;
  background: var(--surface);
  border: 1px solid var(--border-input);
  border-radius: var(--r-8);
  font-size: 14px;
  color: var(--navy-700);
  text-decoration: none;
}

.stronaLink:hover { border-color: var(--navy-700); }

.stronaLicznik {
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Napisz stronę**

`src/app/(app)/pary/page.tsx`:

```tsx
import { NaglowekWidoku } from '../NaglowekWidoku';
import { KartyPar } from './KartyPar';
import { Paginacja } from './Paginacja';
import { PasekFiltrow } from './PasekFiltrow';
import { TabelaPar } from './TabelaPar';
import { requireUser } from '@/lib/auth/requireUser';
import { tytulListy } from '@/lib/nawigacja';
import { type FiltryKlienta, czyAktywne, parseFiltry } from '@/lib/pary/filtry';
import { opcjeFiltrow, queryPary } from '@/lib/pary/zapytania';
import style from './pary.module.css';

export default async function StronaPar({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. Synchronous access was removed.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await requireUser();
  const filtry = parseFiltry(await searchParams);

  const [{ wiersze, znalezione, wszystkie }, opcje] = await Promise.all([
    queryPary(u, filtry),
    opcjeFiltrow(u, filtry),
  ]);

  const { tytul, podtytul } = tytulListy(u, wszystkie);

  // bigint does not cross the server/client boundary — the filter bar is a
  // client component, so ids travel as strings.
  const filtryDlaKlienta: FiltryKlienta = {
    ...filtry,
    parafia: filtry.parafia === null ? null : String(filtry.parafia),
    krag: filtry.krag === null ? null : String(filtry.krag),
  };
  const opcjeDlaKlienta = {
    parafie: opcje.parafie.map((p) => ({ id: String(p.id), etykieta: p.etykieta })),
    kregi: opcje.kregi.map((k) => ({ id: String(k.id), etykieta: k.etykieta })),
  };

  return (
    <>
      <NaglowekWidoku tytul={tytul} podtytul={podtytul} />

      <PasekFiltrow
        filtry={filtryDlaKlienta}
        opcje={opcjeDlaKlienta}
        znalezione={znalezione}
        wszystkie={wszystkie}
        aktywne={czyAktywne(filtry)}
        // A region account has exactly one region; the selector would be a
        // single-option control that cannot change anything.
        pokazRejon={u.rola !== 'rejon'}
      />

      <div className={style.tylkoDesktop}>
        <TabelaPar wiersze={wiersze} filtry={filtry} uzytkownik={u} />
      </div>
      <div className={style.tylkoMobile}>
        <KartyPar wiersze={wiersze} />
      </div>

      <Paginacja filtry={filtry} znalezione={znalezione} />
    </>
  );
}
```

- [ ] **Step 3: Sprawdź w przeglądarce**

```bash
npm run dev
```

Zaloguj się jako admin. Expected: nagłówek „Pary wspólnoty / Cała wspólnota — 300 par
w 11 rejonach", pasek filtrów, tabela z 50 wierszami, paginacja „Strona 1 z 6".

Przeklikaj: sortowanie po każdej z 7 kolumn (strzałka w nagłówku, odwrócenie przy
drugim kliknięciu), wybór rejonu (parafia i krąg się zerują), wpisanie tekstu w szukaj,
każdą z 17 opcji formacji. Po każdej zmianie **odśwież stronę** — stan musi przetrwać.

Zaloguj się jako `rejon7@example.pl`. Expected: nagłówek „Rejon VII", **brak** selektora
rejonu, tylko pary z rejonu VII, akcja „Edytuj →". Jako `moderator@example.pl` — akcja
„Podgląd →" we wszystkich wierszach.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace the couples placeholder with the real list view"
```

---

### Task 11: Testy end-to-end listy

**Files:**
- Create: `e2e/lista.spec.ts`

**Interfaces:**
- Consumes: całość planu

- [ ] **Step 1: Napisz testy**

`e2e/lista.spec.ts`:

```ts
import { type Page, expect, test } from '@playwright/test';

const HASLO = 'kartoteka123';

async function zaloguj(page: Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/pary/);
}

test('admin sees the whole community with the shell', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
  await expect(page.getByText('Cała wspólnota — 300 par w 11 rejonach')).toBeVisible();
});

test('navigation has four entries for admin, one for a region account', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  const nawigacja = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await expect(nawigacja.getByRole('link')).toHaveCount(4);

  await page.goto('/wyloguj');
  await zaloguj(page, 'rejon7@example.pl');
  await expect(nawigacja.getByRole('link')).toHaveCount(1);
  await expect(nawigacja.getByRole('link', { name: 'Mój rejon' })).toBeVisible();
});

test('a region account sees only its own region', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await expect(page.getByRole('heading', { name: 'Rejon VII' })).toBeVisible();
  // The region selector is pointless when the account has exactly one region.
  await expect(page.getByLabel('Rejon')).toHaveCount(0);
  const plakietki = page.locator('table').getByText(/^VII/);
  expect(await plakietki.count()).toBeGreaterThan(0);
});

test('the viewer can only view', async ({ page }) => {
  await zaloguj(page, 'moderator@example.pl');
  await expect(page.getByRole('link', { name: 'Podgląd →' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edytuj →' })).toHaveCount(0);
});

test('sorting is reflected in the URL and survives a reload', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByRole('link', { name: /^E-mail/ }).click();
  await expect(page).toHaveURL(/sort=email/);
  await page.reload();
  await expect(page).toHaveURL(/sort=email/);

  await page.getByRole('link', { name: /^E-mail/ }).click();
  await expect(page).toHaveURL(/dir=desc/);
});

test('the region filter cascades and clears the narrower choices', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByLabel('Parafia').selectOption({ index: 1 });
  await expect(page).toHaveURL(/parafia=/);

  await page.getByLabel('Rejon').selectOption('3');
  await expect(page).toHaveURL(/rejon=3/);
  // Changing the region invalidates the parish.
  await expect(page).not.toHaveURL(/parafia=/);
});

test('the counter shows the filter suffix only when a filter is active', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page.getByText('300 / 300')).toBeVisible();

  await page.getByLabel('Formacja').selectOption('brak');
  await expect(page.getByText(/\(filtr\)/)).toBeVisible();
});

test('an impossible filter shows the empty-state message', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?q=nieistniejacenazwisko123');
  await expect(page.getByText('Brak wyników dla podanych kryteriów.')).toBeVisible();
});

test('a hand-edited query string degrades instead of failing', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?rejon=999&sort=cokolwiek&page=0&formacja=ONZ_XVII');
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
  await expect(page.getByText('300 / 300')).toBeVisible();
});

test('below 860px the table gives way to cards', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.setViewportSize({ width: 412, height: 900 });
  await expect(page.locator('table')).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('table')).toBeVisible();
});

test('paging moves through the results without repeating them', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  const pierwsze = await page.locator('tbody tr td:first-child').first().textContent();
  await page.getByRole('link', { name: 'Następna →' }).click();
  await expect(page).toHaveURL(/page=2/);
  const drugie = await page.locator('tbody tr td:first-child').first().textContent();
  expect(drugie).not.toBe(pierwsze);
});
```

- [ ] **Step 2: Uruchom**

Run: `npm run e2e`
Expected: PASS — 7 testów logowania z Planu 1 + 11 nowych

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add end-to-end coverage for the list view"
```

---

## Stan po Planie 2

- Powłoka z nawigacją zależną od roli, breakpoint 860 px
- Lista par: tabela na desktopie, karty na mobile, 7 sortowalnych kolumn, paginacja po 50
- Kaskada filtrów rejon → parafia → krąg plus szukanie i 17 opcji formacji
- Cały stan w URL — odświeżenie i link zachowują widok
- Zawężenie do rejonu wymuszone po stronie serwera, nie do obejścia parametrem

**Poza zakresem, wchodzi w Planie 3:** karta pary (drawer `?karta=<id>`). Do tego czasu
link „Edytuj →" prowadzi pod adres, który jeszcze nic nie otwiera — to celowe, żeby
kontrakt URL powstał raz.

**Punkty listy odbioru, które ten plan zamyka:** nawigacja 4/1/2 pozycje · zawężenie
pary rejonowej · „Edytuj →" vs „Podgląd →" · szukanie po siedmiu polach · kaskada
filtrów · 17 opcji formacji · licznik „N / M" z „(filtr)" · sortowanie 7 kolumn
dwukierunkowo · stan w URL · tabela↔karty poniżej 860 px · komunikat o pustym wyniku.
