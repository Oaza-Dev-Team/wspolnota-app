# Handoff: Kartoteka Domowego Kościoła — zarządzanie danymi członków wspólnoty

## Start tutaj

1. Otwórz `Wspolnota.dc.html` w przeglądarce i przeklikaj prototyp — zaloguj się kolejno
   jako **ADM**, **III** i **MOD**, żeby zobaczyć różnice uprawnień.
2. Przeczytaj **`IMPLEMENTATION.md`** — plan pracy, schemat bazy, API i **lista kontrolna
   odbioru**. Ten plik (`README.md`) jest specyfikacją wizualną i referencją zachowań.
3. Zrzuty wszystkich widoków: `screenshots/` (spis w `IMPLEMENTATION.md`, sekcja 8).

## Overview

Aplikacja do prowadzenia kartoteki małżeństw należących do wspólnoty Domowego Kościoła
(Ruch Światło-Życie, archidiecezja gdańska). Wspólnota liczy ~300 par podzielonych na
**12 rejonów** (numeracja rzymska I–XII). W każdym rejonie działa **para rejonowa**
(jedno konto), która prowadzi dane swojego rejonu. Nad nimi stoi **para odpowiedzialna
za wspólnotę** z uprawnieniami administratora. Osobna rola: **moderator** (kapłan) —
podgląd całości bez prawa edycji.

Kluczowe funkcje: przeszukiwanie i filtrowanie listy par, edycja danych, ewidencja
formacji (przebyte rekolekcje), eksport do CSV/XLSX, przegląd rejonów, zarządzanie
kontami rejonów, historia zmian.

## About the Design Files

Pliki w tej paczce są **referencją projektową wykonaną w HTML** — prototypem
pokazującym zamierzony wygląd i zachowanie, a nie kodem produkcyjnym do skopiowania.
Zadaniem jest **odtworzenie tych ekranów w docelowym środowisku** (React/Next.js, Vue,
Laravel + Blade, itp.) zgodnie z jego istniejącymi wzorcami i biblioteką komponentów.
Jeśli projekt jeszcze nie ma środowiska — wybierz stos odpowiedni dla tego zadania.

Prototyp trzyma wszystkie dane w pamięci (generator `makeData()`); produkcyjnie
potrzebna jest baza danych i API. Sekcja **Data model** poniżej opisuje schemat.

## Fidelity

**High-fidelity.** Kolory, typografia, odstępy, promienie, stany hover i zachowanie
responsywne są docelowe — odtwórz je 1:1, o ile docelowy codebase nie ma własnego
systemu projektowego, który powinien wygrać.

---

## Roles & permissions

| Rola | Widzi | Może |
|---|---|---|
| `admin` — para odpowiedzialna za wspólnotę | wszystkie pary, wszystkie rejony | dodawać/edytować/usuwać pary w każdym rejonie; zarządzać kontami rejonów; czytać historię zmian; eksport |
| `rejon` — para rejonowa | tylko pary ze swojego rejonu | dodawać/edytować/usuwać pary w swoim rejonie; eksport swojego rejonu. Pole „Rejon" w formularzu jest zablokowane |
| `podglad` — moderator (kapłan) | wszystkie pary, wszystkie rejony | tylko podgląd; formularz w trybie read-only; eksport dozwolony |

Reguła w prototypie (`canEditRejon`): admin → zawsze `true`; rejon → `true` gdy
`rekord.rejon === user.rejon`; podglad → zawsze `false`.

Nawigacja zależy od roli:
- `rejon`: tylko „Mój rejon"
- `podglad`: „Wszystkie pary", „Rejony"
- `admin`: „Wszystkie pary", „Rejony", „Konta rejonów", „Historia zmian"

**Produkcyjnie**: logowanie e-mail + hasło, role nadaje admin. Prototyp ma zamiast tego
ekran wyboru konta demonstracyjnego (4 konta).

---

## Data model

### `Para` (małżeństwo — podstawowa jednostka kartoteki)

| Pole | Typ | Uwagi |
|---|---|---|
| `id` | string/uuid | |
| `imieZ` | string | imię żony |
| `imieM` | string | imię męża |
| `nazwisko` | string | w formie mnogiej, np. „Kowalscy", „Formela" |
| `email` | string | jeden adres na parę |
| `telefon` | string | format `+48 XXX XXX XXX` |
| `rejon` | int 1–12 | wyświetlany rzymsko: `ROMAN[rejon-1]` |
| `parafia` | string | nazwa + miasto, np. „św. Brygidy, Gdańsk" |
| `krag` | string | numer w rejonie + patron, np. `3 · św. Rity` |
| `rekolekcje` | `Rekolekcje[]` | patrz niżej |
| `dzieci` | string | imiona i roczniki, np. „Marysia 2014, Antek 2017"; puste dopuszczalne |
| `notatki` | string | wolny tekst |

**Uwaga o kręgu**: krąg to mała grupa 4–7 małżeństw w obrębie rejonu, przypisana do
jednej parafii. W prototypie `krag` jest stringiem `"<numer> · <patron>"`. Produkcyjnie
lepiej wydzielić encję `Krag { id, rejon_id, numer, patron, parafia_id }` i trzymać
`para.krag_id` — filtry (rejon → parafia → krąg) są wtedy naturalnymi joinami.

### `Rekolekcje` (wpis formacji)

| Pole | Typ | Uwagi |
|---|---|---|
| `typ` | enum | patrz lista poniżej |
| `rok` | string (4 cyfry) | |
| `miejsce` | string | np. „Krościenko n. Dunajcem" |
| `nazwa` | string | wypełniane **tylko** dla `typ === 'Inne'` |

Enum typów (kolejność ma znaczenie — to ścieżka formacji; kod → pełna nazwa w select):

1. `ONŻ I` — Oaza Nowego Życia I stopnia
2. `ONŻ II` — Oaza Nowego Życia II stopnia
3. `ONŻ III` — Oaza Nowego Życia III stopnia
4. `ORAR I` — Oaza Rekolekcyjna Animatorów Rodzin I stopnia
5. `ORAR II` — Oaza Rekolekcyjna Animatorów Rodzin II stopnia
6. `Pilotowanie` — Sesja o pilotowaniu kręgów
7. `ORD` — Oaza Rekolekcyjna Diakonii
8. `Inne` — inne rekolekcje (wymaga pola `nazwa`)

Para może mieć wiele wpisów, także luki w stopniach, także zero wpisów. Wpisów `Inne`
może być kilka.

### `KontoRejonu`

`{ rejon: 1–12, nazwaPary: string|null, email: string, status: 'aktywne'|'wyłączone'|'oczekuje', ostatnieLogowanie: date|null }`

`status: 'oczekuje'` = rejon bez obsadzonej pary; akcja to „Zaproś" (wysyłka
zaproszenia e-mail). Dla obsadzonych: „Wyłącz" / „Włącz".

### `WpisAudytu`

`{ data: datetime, rodzaj: 'edycja'|'dodanie'|'usunięcie'|'eksport'|'konto', opis: string, autor: string }`

Zapisywany przy każdym zapisie, usunięciu, eksporcie i zmianie konta.

---

## Screens / Views

### 1. Logowanie (ekran wyboru konta w prototypie)

**Purpose**: wejście do aplikacji.

**Layout**: pełna wysokość, `display: grid`.
- Desktop (≥860px): `grid-template-columns: 1.05fr 1fr`
- Mobile (<860px): `grid-template-rows: auto 1fr`

**Lewa kolumna** — tło `#0d2439`, tekst `#e7edf4`, `padding: 64px 60px`
(mobile `26px 22px 30px`), `flex-direction: column`, `justify-content: space-between`:
- Góra: monogram „ŚŻ" — kwadrat 46×46, `border-radius: 9px`, tło `#fff`, tekst
  `#10365c`, Source Serif 4 19px, `letter-spacing: -0.02em`; obok dwuwierszowy podpis
  IBM Plex Mono 11px, `letter-spacing: 0.16em`, uppercase, `#9dbdd8`:
  „Ruch Światło-Życie / Archidiecezja Gdańska"
- Środek: H1 Source Serif 4 400, **62px** desktop / **38px** mobile,
  `line-height: 1.05`, `letter-spacing: -0.015em`: „Kartoteka" + `<br>` +
  `<em>` „Domowego Kościoła" w kolorze `#e2b04a`. Pod nim akapit 17px/1.55,
  `#b8cbdc`, `max-width: 45ch`: „Dwanaście rejonów, jedna wspólna baza. Pary rejonowe
  prowadzą swoją część kartoteki, para odpowiedzialna za wspólnotę widzi całość."
- Dół: 13px `#7d97ad`: „Prototyp — dane przykładowe, wygenerowane"

**Prawa kolumna** — tło `#f7f9fb`, `padding: 64px 52px` (mobile `26px 20px 40px`),
`justify-content: center`, `gap: 10px`:
- Nagłówek 12px 700, `letter-spacing: 0.09em`, uppercase, `#6c7d8f`: „Zaloguj się jako"
- 4 przyciski-karty: `display: flex`, `gap: 15px`, tło `#fff`, `border: 1px solid #d5dde6`,
  `border-radius: 10px`, `padding: 15px 17px`, `transition: all .15s`.
  Hover: `border-color: #10365c`, `box-shadow: 0 4px 14px rgba(16,54,92,.1)`,
  `transform: translateY(-1px)`.
  W środku kwadrat 42×42 `border-radius: 8px` z kodem (IBM Plex Mono 13px) —
  admin ma tło `#10365c` + tekst `#e2b04a`, pozostali `#eaf0f6` + `#10365c`.
  Obok: nazwa pary 15px 600 i rola 13px `#6c7d8f`.
  Konta demo: `ADM` Maria i Piotr Lewandowscy (admin) · `III` Anna i Marek Sowa
  (para rejonowa III) · `VII` Ewa i Jan Cichy (para rejonowa VII) ·
  `MOD` ks. Marek Górzyński (moderator, podgląd).
- Stopka 12px `#8b99a8`: „W wersji docelowej: logowanie e-mailem i hasłem. Role nadaje
  para odpowiedzialna za wspólnotę."

### 2. Powłoka aplikacji (shell)

Tło aplikacji `#eef1f5`.

**Desktop (≥860px)** — sidebar `width: 244px`, tło `#0d2439`, `padding: 20px 14px`,
`position: sticky; top: 0; height: 100vh`, kolumna z `gap: 24px`:
- Brand: monogram „ŚŻ" 34×34 (`border-radius: 7px`, tło `#fff`, tekst `#10365c`,
  Source Serif 15px) + „Kartoteka DK" (Source Serif 18px) + „Archidiec. Gdańska"
  (IBM Plex Mono 9px, `letter-spacing: .14em`, uppercase, `#7d97ad`)
- Nawigacja: kolumna, `gap: 2px`. Element: `padding: 10px 13px`, `border-radius: 8px`,
  14px, `justify-content: space-between` (label + badge z liczbą, IBM Plex Mono 11px,
  `opacity: .65`). Nieaktywny: `color: #c3d3e1`, tło przezroczyste.
  **Aktywny**: tło `rgba(226,176,74,.16)`, `color: #e2b04a`, `font-weight: 600`.
  Hover: `rgba(255,255,255,.08)`.
- Stopka (pchnięta `margin-top: auto`, `border-top: 1px solid rgba(255,255,255,.13)`,
  `padding-top: 15px`): kwadrat 32×32 z kodem konta (tło `rgba(226,176,74,.18)`,
  tekst `#e2b04a`), nazwa 13px 600, rola 11px `#7d97ad`; pod tym przycisk „Wyloguj"
  (`border: 1px solid rgba(255,255,255,.2)`, `color: #c3d3e1`, 12px).

**Mobile (<860px)** — sidebar zamienia się w przyklejony pasek u góry:
`display: grid`, `grid-template-columns: 1fr auto`,
`grid-template-areas: "brand user" "nav nav"`, `gap: 10px`,
`padding: 11px 14px 9px`, `position: sticky; top: 0; z-index: 40`.
Nawigacja: `overflow-x: auto`, `gap: 6px`, elementy `flex: none`, `white-space: nowrap`,
`min-height: 44px`. Blok użytkownika: tylko kod konta + „Wyloguj" (nazwa i rola ukryte).

**Main**: `flex: 1`, `padding: 26px 32px 64px` (mobile `18px 16px 56px`),
kolumna `gap: 18px`.

**Header widoku**: `display: flex`, `align-items: flex-end`,
`justify-content: space-between`, `gap: 16px`, `flex-wrap: wrap`.
H1 Source Serif 4 400, **36px** desktop / **27px** mobile, `letter-spacing: -.01em`;
pod nim podtytuł 14px `#6c7d8f`.

Tytuły / podtytuły:
- `lista` (rola rejon): „Rejon VII" / „Twoje pary — możesz dodawać i edytować dane"
- `lista` (admin, moderator): „Pary wspólnoty" / „Cała wspólnota — 302 pary w 12 rejonach"
- `rejony`: „Rejony I–XII" / „Kliknij rejon, aby przejść do jego listy par"
- `konta`: „Konta rejonów" / „Dostępy par rejonowych i moderatora"
- `audyt`: „Historia zmian" / „Kto, co i kiedy zmienił"

**Akcje w headerze** (tylko widok listy): „Eksport CSV" i „XLSX" — tło `#fff`,
`border: 1px solid #d5dde6`, `border-radius: 8px`, `padding: 12px 15px`, 14px 500,
`min-height: 44px`, hover `border-color: #10365c`. Primary „+ Dodaj parę" — tło
`#10365c`, tekst `#fff`, 14px 600, `padding: 12px 17px`, hover `#0d2439`.
Mobile: `flex-wrap: wrap; width: 100%`, CSV i „+ Dodaj parę" mają `flex: 1`.

### 3. Lista par (widok główny)

**Purpose**: znaleźć parę, sprawdzić dane, wejść w edycję, wyeksportować podzbiór.

**Pasek filtrów** — `display: flex`, `gap: 9px`, `flex-wrap: wrap`,
`align-items: center`. Wszystkie kontrolki `min-height: 44px`, tło `#fff`,
`border: 1px solid #d5dde6`, `border-radius: 8px`, `padding: 12px`, 14px.
Focus na input: `border-color: #1c5f96`, `box-shadow: 0 0 0 3px rgba(28,95,150,.12)`.

1. **Szukaj** — `min-width: 100%` (własny wiersz), 15px, placeholder
   „Szukaj: nazwisko, imię, e-mail…". Przeszukuje: nazwisko, imię żony, imię męża,
   e-mail, telefon, parafia, krąg — case-insensitive `includes`.
2. **Rejon** — `flex: 1; min-width: 130px`. Opcje: „Wszystkie rejony" + Rejon I…XII.
3. **Parafia** — `flex: 2; min-width: 190px`. Lista parafii **zawężona do wybranego
   rejonu**. Etykieta „all": „Wszystkie — 6 parafii" (poprawna odmiana liczebnika).
4. **Krąg** — `flex: 2; min-width: 180px`. Lista kręgów **zawężona do rejonu i parafii**.
   Etykieta „all": „Wszystkie — 3 kręgi". Opcje: „Krąg 3 · św. Rity".
5. **Formacja** — `flex: 1; min-width: 165px`. Opcje: „Formacja — dowolna",
   „Ma ONŻ I"…„Ma ORD" (7), „Bez ONŻ I"…„Bez ORD" (7), „Ma inne rekolekcje",
   „Bez żadnych rekolekcji".
6. **Licznik** — IBM Plex Mono 12px `#6c7d8f`: `„42 / 302"`, z sufiksem `„ (filtr)"`
   gdy jakikolwiek filtr aktywny.

**Kaskada filtrów**: zmiana rejonu resetuje parafię i krąg; zmiana parafii resetuje
krąg. Filtr formacji jest niezależny.

**Tabela (≥860px)** — kontener tło `#fff`, `border: 1px solid #dfe5ec`,
`border-radius: 12px`, `overflow: hidden`, `box-shadow: 0 1px 2px rgba(16,54,92,.04)`;
wewnątrz `overflow-x: auto`, tabela `min-width: 1060px`, 14px.
- `thead`: tło `#f4f7fa`, `border-bottom: 1px solid #dfe5ec`. Th: `padding: 11px 15px`,
  12px 600, `letter-spacing: .05em`, uppercase, `#6c7d8f`, `cursor: pointer`,
  `white-space: nowrap`. Aktywna kolumna sortowania: `color: #10365c` + strzałka
  `↑`/`↓` w etykiecie.
- Kolumny: Nazwisko (600) · Imiona („Anna i Piotr") · E-mail · Telefon (IBM Plex Mono
  13px) · Rejon (plakietka) · Parafia · Krąg (IBM Plex Mono 13px) · Formacja
  (plakietka) · akcja (prawy, `#8b99a8` 13px: „Edytuj →" gdy ma prawo, inaczej
  „Podgląd →")
- `tr`: `border-bottom: 1px solid #f0f3f7`, `cursor: pointer`, hover `#f7f9fc`;
  klik otwiera panel.
- Td: `padding: 12px 15px`, `color: #3c4b5c`.
- Plakietka rejonu: IBM Plex Mono 12px, `border-radius: 5px`, `padding: 3px 8px`,
  tło = kolor rejonu + `1a` (alfa), tekst = kolor rejonu (paleta niżej).
- Plakietka formacji: IBM Plex Mono 12px, `border-radius: 5px`, `padding: 3px 8px`.
  Ma rekolekcje → tło `#e9f4ec`, tekst `#2c6b41`; brak → `#f4f7fa` / `#9aa6b4`.
  Treść: najwyższy osiągnięty stopień (po kolejności enuma, pomijając `Inne`) plus
  `+N` liczba pozostałych stopni, np. `ORAR II +4`; brak wpisów → `—`.
- Prototyp renderuje pierwsze 60 wierszy (produkcyjnie: paginacja lub wirtualizacja).
- Pusty wynik: `padding: 46px`, wyśrodkowany 14px `#6c7d8f`:
  „Brak wyników dla podanych kryteriów."

**Karty (<860px)** — zamiast tabeli, kolumna `gap: 9px`. Karta: tło `#fff`,
`border: 1px solid #dfe5ec`, `border-radius: 11px`, `padding: 14px`, kolumna `gap: 9px`,
`cursor: pointer`, `:active` tło `#f7f9fc`:
- Wiersz 1: nazwisko 16px 700 + plakietka `VII · krąg 3 · św. Rity`
  (IBM Plex Mono 12px, kolor rejonu)
- Wiersz 2: imiona 14px `#3c4b5c` + plakietka formacji (po prawej)
- Wiersz 3 (nad nim `border-top: 1px solid #f0f3f7`, `padding-top: 9px`): telefon,
  e-mail (`overflow-wrap: anywhere`), parafia — 13px `#6c7d8f`, kolumna `gap: 3px`

### 4. Panel pary (drawer — edycja / dodawanie / podgląd)

**Overlay**: `position: fixed; inset: 0`, tło `rgba(13,36,57,.35)`,
`justify-content: flex-end`, `z-index: 50`, `animation: fadein .15s`.
Klik w obszar poza panelem zamyka.

**Panel**: tło `#fff`, `overflow-y: auto`, `box-shadow: -18px 0 50px rgba(13,36,57,.2)`,
`animation: slidein .22s ease-out` (`translateX(30px)` + `opacity 0` → `none`/`1`),
kolumna `gap: 18px`.
Desktop: `width: 540px; max-width: 94vw; padding: 24px 28px 40px`.
Mobile: `width: 100%; height: 100%; padding: 18px 16px 44px`.

**Nagłówek**: kicker IBM Plex Mono 11px, `letter-spacing: .14em`, uppercase, `#8b99a8`
(„Nowy wpis" albo „Karta pary · rejon VII"); tytuł Source Serif 4 28px
(„Dodaj parę" albo „Anna i Piotr Kowalscy"); przycisk ✕ 32×32,
`border: 1px solid #d5dde6`, `border-radius: 7px`, `color: #6c7d8f`.

**Banner read-only** (gdy brak prawa edycji): tło `#fdf6e6`,
`border: 1px solid #f0dcae`, `border-radius: 8px`, `padding: 11px 13px`, 13px,
`color: #6b5418`: „Tylko podgląd — ta para należy do innego rejonu, edytować może para
rejonowa lub odpowiedzialni za wspólnotę."

**Formularz** — `display: grid`, `gap: 13px`,
`grid-template-columns: 1fr 1fr` (mobile `1fr`). Label: kolumna `gap: 5px`, 13px
`#6c7d8f`. Input: tło `#fff`, `border: 1px solid #d5dde6`, `border-radius: 8px`,
`padding: 10px 12px`, 14px, `color: #101c2b`, `width: 100%`;
focus `border-color: #1c5f96`.

Pola w kolejności: **Imię żony** · **Imię męża** · **Nazwisko** (`span 2`) ·
**E-mail** · **Telefon** · **Rejon** (select I–XII; `disabled` gdy read-only **albo**
rola = `rejon`) · **Krąg — numer i patron** (placeholder „np. 3 · św. Rity") ·
**Parafia** (`span 2`) · **Dzieci — imiona i roczniki** (`span 2`, placeholder
„np. Marysia 2014, Antek 2017") · **Notatki** (`span 2`, `textarea rows=3`).
Na mobile `span 2` nie obowiązuje (jedna kolumna).

**Sekcja Formacja** — `border-top: 1px solid #eef1f5`, `padding-top: 16px`,
kolumna `gap: 11px`:
- Nagłówek: „Formacja — przebyte rekolekcje" (Source Serif 4 20px) + licznik
  IBM Plex Mono 12px `#8b99a8` („5 wpisów", z odmianą)
- Wiersz wpisu: `display: flex`, `gap: 7px`, `flex-wrap: wrap`, tło `#f9fbfc`,
  `border: 1px solid #eef1f5`, `border-radius: 9px`, `padding: 8px`.
  Kontrolki: `border-radius: 7px`, `padding: 8px 10px`, 13px, `min-height: 38px`.
  - select typu — `flex: 1 1 100%` (własny wiersz), etykiety = pełne nazwy rekolekcji
  - rok — `width: 72px`, `flex: none`, IBM Plex Mono, placeholder „rok"
  - miejsce — `flex: 1; min-width: 120px`, placeholder „miejsce"
  - nazwa — **tylko gdy typ = `Inne`**, `flex: 1 1 100%`, placeholder „nazwa rekolekcji"
  - ✕ usuń — 34×38, `border: 1px solid #e6ebf1`, `color: #9aa6b4`,
    hover `border-color: #c98d8d; color: #9c3a3a`. Ukryty w trybie read-only.
- Gdy brak wpisów: 13px `#8b99a8` „Brak wpisów o rekolekcjach."
- „+ Dodaj rekolekcje" — `align-self: flex-start`, tło `#f4f7fa`,
  `border: 1px dashed #c3d0dd`, `border-radius: 8px`, `padding: 10px 15px`, 13px 600,
  `color: #10365c`, `min-height: 42px`, hover `border-color: #10365c; background: #eaf0f6`.
  **Zachowanie**: nowy wiersz dostaje pierwszy typ, którego para jeszcze nie ma
  (idąc kolejnością enuma); gdy wszystkie stopnie są, wpada `Inne`.

**Stopka** (tylko gdy ma prawo edycji) — `border-top: 1px solid #eef1f5`,
`padding-top: 16px`, `flex-wrap: wrap`, `gap: 9px`:
„Zapisz" (primary `#10365c`, `padding: 11px 20px`, 600) · „Anuluj" (`#fff` +
`border: 1px solid #d5dde6`) · „Usuń parę" (`margin-left: auto`,
`border: 1px solid #e3c4c4`, `color: #9c3a3a`, hover tło `#fdf1f1`; tylko przy edycji
istniejącej pary).
Pod stopką 12px `#8b99a8`: „Każdy zapis trafia do historii zmian z Twoim kontem i datą."
(read-only: „Podgląd bez możliwości edycji.").

**Walidacja**: nazwisko wymagane — puste blokuje zapis i pokazuje toast „Podaj nazwisko".
Produkcyjnie dodaj: format e-maila, format telefonu, rok rekolekcji 1970–bieżący,
wymagana nazwa przy typie `Inne`.

### 5. Rejony (admin, moderator)

**Purpose**: przegląd wielkości i obsadzenia 12 rejonów; wejście w listę rejonu.

`display: grid`, `grid-template-columns: repeat(auto-fill, minmax(264px, 1fr))`,
`gap: 13px`.

Kafelek: tło `#fff`, `border: 1px solid #dfe5ec`, **`border-left: 5px solid <kolor
rejonu>`**, `border-radius: 12px`, `padding: 16px 17px`, kolumna `gap: 12px`,
`cursor: pointer`; hover `border-color: #10365c`,
`box-shadow: 0 4px 14px rgba(16,54,92,.08)`.
- Wiersz 1: „Rejon VII" (Source Serif 4 26px, w kolorze rejonu) + licznik par
  (IBM Plex Mono 12px, `border-radius: 20px`, `padding: 3px 9px`,
  tło = kolor rejonu + `18`, tekst = kolor rejonu; treść „27 par" z odmianą)
- Wiersz 2: „PARA ODPOWIEDZIALNA" (12px, uppercase, `letter-spacing: .06em`, `#8b99a8`),
  nazwa pary 14px 600 (albo „Do obsadzenia"), meta 13px `#6c7d8f`:
  „5 kręgów · 4 parafie" (obie liczby z poprawną odmianą)

Klik → widok listy z ustawionym filtrem rejonu (parafia i krąg wyzerowane).

### 6. Konta rejonów (admin)

Kontener tło `#fff`, `border: 1px solid #dfe5ec`, `border-radius: 12px`,
`overflow: hidden`. Wiersz: `display: flex`, `align-items: center`, `gap: 16px`,
`padding: 14px 18px`, `border-bottom: 1px solid #f0f3f7`, `flex-wrap: wrap`.
- Kwadrat 38×38 `border-radius: 8px` z numerem rzymskim (IBM Plex Mono 12px),
  tło = kolor rejonu + `1a`, tekst = kolor rejonu
- Nazwa pary 14px 600 + e-mail 13px `#6c7d8f` (`overflow-wrap: anywhere`),
  `flex: 1; min-width: 140px`
- Zakres 13px `#3c4b5c`, `min-width: 104px`: „Rejon VII · 27 par"
- Ostatnie logowanie IBM Plex Mono 12px `#8b99a8`, `min-width: 128px` —
  **ukryte poniżej 1120px**
- Plakietka statusu: 12px 600, `border-radius: 20px`, `padding: 4px 10px`,
  `min-width: 78px`, `text-align: center`, `flex: none`.
  `aktywne` → `#e9f4ec` / `#2c6b41`; `wyłączone` → `#f4f7fa` / `#8b99a8`;
  `oczekuje` → `#fdf6e6` / `#8a6a1c`
- Przycisk akcji: `#fff`, `border: 1px solid #d5dde6`, `border-radius: 7px`,
  `padding: 9px 14px`, 13px, `min-height: 40px`. „Wyłącz" / „Włącz" / „Zaproś"
- Ostatni wiersz: konto moderatora (kod `MOD`, zakres „Cała wspólnota · podgląd")

### 7. Historia zmian (admin)

Kontener jak wyżej. Wiersz: `display: flex`, `gap: 16px`, `padding: 13px 18px`,
`border-bottom: 1px solid #f0f3f7`, `align-items: baseline`, `flex-wrap: wrap`.
- Data IBM Plex Mono 12px `#8b99a8`, `width: 128px`, `flex: none` („13.08.2026 21:12")
- Plakietka rodzaju: IBM Plex Mono 11px, uppercase, `letter-spacing: .06em`,
  `border-radius: 4px`, `padding: 3px 8px`, `width: 88px`, `text-align: center`,
  `flex: none`. Kolory: `edycja` `#eaf0f6`/`#10365c` · `dodanie` `#e9f4ec`/`#2c6b41` ·
  `usunięcie` `#fdf1f1`/`#9c3a3a` · `eksport` `#fdf6e6`/`#8a6a1c` ·
  `konto` `#f0ecf7`/`#57407a`
- Opis 14px, `flex: 1; min-width: 200px`
- Autor 13px `#6c7d8f`

---

## Interactions & Behavior

- **Sortowanie**: klik w nagłówek kolumny sortuje rosnąco; ponowny klik odwraca.
  Domyślnie `nazwisko` rosnąco. Rejon sortuje się numerycznie, reszta jako lowercase
  string. Kolumna „Formacja" nie jest sortowalna.
- **Otwarcie panelu**: klik w wiersz/kartę. Panel dostaje kopię rekordu (`draft`) —
  edycja nie mutuje listy do momentu „Zapisz".
- **Zapis**: waliduje nazwisko, aktualizuje (lub dodaje) rekord, dopisuje wpis do
  historii zmian, zamyka panel, pokazuje toast „Zapisano zmiany".
- **Usunięcie**: usuwa rekord, dopisuje wpis „usunięcie", toast „Para usunięta z
  kartoteki". Produkcyjnie zalecany soft-delete (RODO: dane byłego członka powinny być
  usuwalne trwale — zrób z tego świadomą decyzję).
- **Eksport**: generuje plik z **aktualnie przefiltrowanej listy** (nie z całości),
  pobiera przez `Blob` + `<a download>`, dopisuje wpis „eksport", toast
  „Wyeksportowano N rekordów do CSV". CSV: separator `;`, cudzysłowy podwajane,
  BOM `\ufeff` na początku (Excel PL), `\r\n`. XLSX w prototypie to `.xls` z
  tabulatorami — **produkcyjnie użyj prawdziwego generatora** (SheetJS, PhpSpreadsheet,
  openpyxl).
- **Kolumny eksportu**: Nazwisko · Imię żony · Imię męża · E-mail · Telefon · Rejon
  (rzymski) · Parafia · Krąg · po jednej kolumnie na każdy z 7 stopni
  („ONŻ I (rok / miejsce)" → wartość „2014 / Krościenko n. Dunajcem") ·
  Inne rekolekcje (kilka wpisów sklejone `|`) · Dzieci · Notatki.
- **Toast**: `position: fixed; bottom: 22px; left: 50%; translateX(-50%)`,
  tło `#0d2439`, `color: #e7edf4`, `padding: 12px 20px`, `border-radius: 9px`, 14px,
  `box-shadow: 0 8px 24px rgba(13,36,57,.28)`, `z-index: 90`. Auto-hide po **2600 ms**.
- **Responsywność**: jeden breakpoint `860px` (tabela↔karty, sidebar↔topbar, siatka
  formularza) i drugi `1120px` (kolumna „ost. logowanie" w kontach). Wszystkie
  interaktywne elementy na mobile mają `min-height: 44px`.
- **Wylogowanie**: czyści użytkownika, zamyka panel, wraca do widoku `lista`.

## State Management

```
user            : { id, name, role, role_: 'admin'|'rejon'|'podglad', rejon: int|null, tag }
view            : 'lista' | 'rejony' | 'konta' | 'audyt'
query           : string
fRejon          : 'all' | '1'…'12'
fParafia        : 'all' | <nazwa parafii>
fKrag           : 'all' | <string kręgu>
fRek            : 'all' | <kod typu> | 'bez:<kod typu>' | 'Inne' | 'brak'
sortKey/sortDir : klucz kolumny + 1|-1
panel           : null | 'new' | <id pary>
draft           : null | kopia rekordu w edycji
toast           : string
people          : Para[]
audyt           : WpisAudytu[]
w               : window.innerWidth (breakpointy; słuchacz `resize`)
```

Produkcyjnie: `people`, `audyt`, konta i sesja idą do API; filtry, sortowanie i
paginacja najlepiej po stronie serwera (query params) — przy 300 parach klient wystarczy,
ale kartoteka będzie rosła.

## Design Tokens

**Kolory**
| Token | Hex | Użycie |
|---|---|---|
| navy-900 | `#0d2439` | sidebar, ekran logowania, toast |
| navy-700 | `#10365c` | przyciski primary, akcenty, aktywne nagłówki |
| blue-500 | `#1c5f96` | focus, linki |
| gold-500 | `#e2b04a` | akcent aktywnej nawigacji, akcent nagłówka |
| bg-app | `#eef1f5` | tło aplikacji |
| bg-panel | `#f7f9fb` | prawa kolumna logowania |
| bg-row | `#f4f7fa` | thead, tła pomocnicze |
| bg-row-alt | `#f9fbfc` | wiersz rekolekcji |
| surface | `#fff` | karty, tabela, inputy |
| border | `#dfe5ec` | obramowania kart/tabel |
| border-input | `#d5dde6` | obramowania kontrolek |
| divider | `#f0f3f7` | linie wierszy |
| text | `#101c2b` | tekst główny |
| text-body | `#3c4b5c` | komórki tabeli |
| text-muted | `#6c7d8f` | podtytuły, etykiety |
| text-faint | `#8b99a8` | metadane |
| placeholder | `#9aa6b4` | placeholdery |
| success-bg / fg | `#e9f4ec` / `#2c6b41` | status aktywny, formacja |
| warn-bg / fg | `#fdf6e6` / `#8a6a1c` | status oczekuje, eksport |
| danger-bg / fg | `#fdf1f1` / `#9c3a3a` | usunięcie |
| purple-bg / fg | `#f0ecf7` / `#57407a` | wpis „konto" w audycie |

**Paleta 12 rejonów** (indeks 0 = rejon I) — jednolita jasność, różne odcienie; używana
na tłach plakietek z alfą `1a`/`18`:
`#1c5f96` `#2f7d6a` `#7a6ca8` `#b07d2b` `#a3524f` `#3f7d3a`
`#4f6fbd` `#96603f` `#2b7f8f` `#8a5b8f` `#6b7d2f` `#b05c7d`

**Typografia** — Google Fonts: `Source Sans 3` (400/500/600/700) UI ·
`Source Serif 4` (400/600) nagłówki · `IBM Plex Mono` (400/500) dane techniczne
(telefony, numery, daty, kody, liczniki).
Skala: 62/38 (hero) · 36/27 (H1) · 28 (tytuł panelu) · 26 (kafelek rejonu) ·
20 (nagłówek sekcji) · 16 (nazwisko na karcie) · 15 (input mobile) · 14 (body) ·
13 (meta, wiersz rekolekcji) · 12 (etykiety, plakietki) · 11 (kicker) · 9 (podpis brandu).

**Odstępy**: 2 · 3 · 5 · 7 · 9 · 10 · 11 · 13 · 15 · 16 · 18 · 20 · 22 · 24 · 26 ·
32 · 44 · 46 · 52 · 60 · 64 px

**Promienie**: 4 (plakietka audytu) · 5 (plakietka rejonu) · 7 (mała kontrolka) ·
8 (input, przycisk) · 9 (wiersz rekolekcji, toast) · 10 (karta logowania) ·
11 (karta pary mobile) · 12 (kontener) · 20 (pill statusu)

**Cienie**: `0 1px 2px rgba(16,54,92,.04)` (tabela) ·
`0 4px 14px rgba(16,54,92,.08)` (hover kafelka) ·
`0 4px 14px rgba(16,54,92,.1)` (hover karty logowania) ·
`-18px 0 50px rgba(13,36,57,.2)` (drawer) ·
`0 8px 24px rgba(13,36,57,.28)` (toast)

**Animacje**: `slidein` 220 ms ease-out (`translateX(30px)`+`opacity 0` → `none`/`1`) ·
`fadein` 150 ms · `transition: all .15s` na kartach logowania

## Assets

Brak plików graficznych. Logo zastąpione **monogramem tekstowym „ŚŻ"** (Source Serif 4,
biały kwadrat, tekst `#10365c`) — w docelowej aplikacji podmień na oficjalne logo
Ruchu Światło-Życie / Domowego Kościoła, jeśli wspólnota ma prawo do jego użycia.

Dane w prototypie są **wygenerowane** (nazwiska, e-maile `@example.pl`, telefony,
parafie, miejsca rekolekcji). Nie są danymi rzeczywistych osób.

## RODO / bezpieczeństwo (do rozstrzygnięcia w implementacji)

Kartoteka zawiera dane osobowe (imiona, nazwisko, kontakt, dane dzieci) oraz dane
o przekonaniach religijnych — w RODO **kategoria szczególna** (art. 9). Minimum:
HTTPS, hasła hashowane, dostęp ograniczony rolą (już w projekcie), rejestr eksportów
(już w audycie), retencja i procedura usunięcia danych po odejściu ze wspólnoty,
umowa powierzenia z hostingiem, informacja o przetwarzaniu dla członków.

## Files

- `IMPLEMENTATION.md` — plan pracy, schemat bazy (DDL), API, lista kontrolna odbioru,
  pytania do rozstrzygnięcia. **Czytaj razem z tym plikiem.**
- `screenshots/` — 9 zrzutów wszystkich widoków (w tym mobilny i pełna karta pary).
- `Wspolnota.dc.html` — kompletny prototyp (wszystkie 7 widoków, logika, dane
  przykładowe). Otwiera się bezpośrednio w przeglądarce.
- `support.js` — runtime prototypu; **nie przenoś do produkcji**.
