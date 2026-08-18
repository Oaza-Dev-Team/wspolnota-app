# Kartoteka Domowego Kościoła — projekt techniczny

**Data:** 2026-08-18
**Status:** zatwierdzony do planu implementacji
**Źródło wymagań:** `docs/handoff/`
(`README.md` — specyfikacja wizualna, `IMPLEMENTATION.md` — plan i lista odbioru,
`screenshots/` — 9 zrzutów widoków, `Wspolnota.dc.html` — prototyp referencyjny)

Ten dokument opisuje **jak** zbudować aplikację. Wygląd i zachowanie definiuje
`README.md` z handoffu i pozostaje nadrzędny — tutaj zapisane są wyłącznie decyzje
techniczne i odstępstwa.

---

## 1. Cel i zakres

Kartoteka ~300 małżeństw wspólnoty Domowego Kościoła (Ruch Światło-Życie, archidiecezja
gdańska), podzielonych na 12 rejonów. Siedem widoków: logowanie, lista par, karta pary
(drawer), rejony, konta rejonów, historia zmian, plus import danych.

**Skala:** ~300 rekordów rosnących powoli, ~15 kont edytujących, 3 role.
Wydajność nie jest czynnikiem projektowym — poprawność uprawnień i wierność
projektu graficznego są.

**Poza zakresem v1:** kapłani-moderatorzy kręgów jako osobne rekordy, eksport
w wariancie „lista kontaktowa", powiązanie z systemem rejestracji na rekolekcje
(`EventsRegistration.Api`).

---

## 2. Stos

```
Next.js 16.3 (App Router) · React 19.2 · TypeScript (strict)
PostgreSQL 16 · Prisma 7.9
Zod 4 — jeden schemat walidacji dla formularza, server action i importu
CSS Modules + tokens.css (custom properties)
next/font — Source Sans 3 · Source Serif 4 · IBM Plex Mono
exceljs 4.4 — XLSX (odczyt i zapis) · CSV pisany ręcznie
@node-rs/argon2 — hashowanie haseł
Vitest 4 — testy jednostkowe · Playwright — e2e wg listy odbioru
Docker Compose — aplikacja + Postgres + reverse proxy z TLS
```

**Dlaczego Next.js, a nie SPA + osobne API.** Trzy najtrudniejsze punkty listy odbioru
są w App Routerze ścieżką domyślną, a nie pracą do wykonania:

| Wymaganie z §9 | Realizacja |
|---|---|
| „Stan filtrów i sortowania jest w URL" | `searchParams` **jest** wejściem server componentu |
| „Autoryzacja serwerowa, nie ukrywanie przycisków" | zapytanie wykonuje się na serwerze z sesją w zasięgu; klient nigdy go nie wysyła |
| „Uprawnienia przetestowane na poziomie API" | powierzchnia to server actions + jeden route eksportu, nie 11 endpointów × 3 role |

**Znane ryzyko:** server actions to publiczne endpointy POST — każda musi samodzielnie
zweryfikować sesję. Neutralizuje je obowiązkowy wrapper (§5). Reguła bez wyjątków:
**żadna server action nie dotyka Prismy przed `requireUser()`**.

**Dlaczego bez Auth.js.** `next-auth@latest` to wciąż 4.24 (nie zna dobrze App Routera),
a v5 jest w becie (`5.0.0-beta.32`) od lat. Przy danych kategorii szczególnej i jednym
providerze (e-mail + hasło, 15 kont) własna warstwa to ~150 linii bez zależności
o niepewnym cyklu życia.

**Dlaczego bez MUI i bez Tailwinda.** Projekt jest autorski i podany co do piksela,
a skala odstępów (`2·3·5·7·9·10·11·13·15·16·18·20·22·24·26·32·44·46·52·60·64 px`)
nie mapuje się na skalę żadnego z nich. Tokeny z sekcji „Design Tokens" README idą
do jednego `tokens.css` jako custom properties i przepisują się 1:1.

---

## 3. Konwencja nazewnicza

- **Identyfikatory domenowe po polsku** — `para`, `rejon`, `krag`, `rekolekcje`,
  `audyt`, `nazwisko`. Schemat w handoffie jest polski; tłumaczenie wprowadzałoby
  warstwę pomyłek, a `rejon` i `krąg` nie mają sensownych odpowiedników.
- **Identyfikatory techniczne po angielsku** — `requireUser`, `SessionStore`,
  `parseFilters`, `withTransaction`.
- **Komentarze, nazwy testów i commity po angielsku.**
- **Cały interfejs po polsku.** `lang="pl"` na `<html>`.

---

## 4. Model danych

Punkt wyjścia: DDL z `IMPLEMENTATION.md` §4. Poniżej **wyłącznie zmiany** względem niego.

### 4.1 Dodane

```sql
-- soft-delete
ALTER TABLE para ADD COLUMN usuniete_at timestamptz;
CREATE INDEX ON para (rejon_id) WHERE usuniete_at IS NULL;

-- sesje w bazie (nie JWT)
CREATE TABLE sesja (
  id                  bigserial PRIMARY KEY,
  konto_id            bigint NOT NULL REFERENCES konto(id) ON DELETE CASCADE,
  token_hash          text UNIQUE NOT NULL,   -- SHA-256 z tokena; token nigdy w bazie
  utworzono           timestamptz NOT NULL DEFAULT now(),
  wygasa              timestamptz NOT NULL,
  ostatnia_aktywnosc  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sesja (konto_id);

-- zaproszenia (akcja „Zaproś" w widoku kont)
ALTER TABLE konto ADD COLUMN zaproszenie_token_hash text;
ALTER TABLE konto ADD COLUMN zaproszenie_wygasa     timestamptz;

-- ograniczenie prób logowania (§6)
CREATE TABLE proba_logowania (
  id       bigserial PRIMARY KEY,
  klucz    text NOT NULL,          -- 'email:<adres>' albo 'ip:<adres>'
  kiedy    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON proba_logowania (klucz, kiedy);

-- polska kolacja dla sortowania
ALTER TABLE para ALTER COLUMN nazwisko TYPE text COLLATE "pl-PL-x-icu";

-- wyszukiwanie nieczułe na znaki diakrytyczne (§8)
CREATE EXTENSION IF NOT EXISTS unaccent;
```

**Sesje w bazie zamiast JWT** — bo lista odbioru wymaga: *„Wyłączone konto faktycznie
nie może się zalogować"*. Przy JWT wyłączone konto działa aż do wygaśnięcia tokena,
co jest cichym niespełnieniem tego punktu. Wyłączenie konta kasuje jego sesje.

**Kolacja `pl-PL-x-icu`** — bez niej `ORDER BY nazwisko` w Postgresie daje inny wynik
niż `localeCompare(…, 'pl')` w przeglądarce (Ł trafia na koniec alfabetu). Sortowanie
serwerowe i etykiety klienckie muszą się zgadzać.

### 4.2 Parafia efektywna — pułapka w DDL

`para.parafia_id` jest wypełniane tylko wtedy, gdy para należy do innej parafii niż jej
krąg. Filtr „parafia" musi więc działać na wartości wyliczonej:

```
parafia_efektywna(para) = COALESCE(para.parafia_id, krag.parafia_id)
```

Filtrowanie po samym `para.parafia_id` gubi wszystkie pary korzystające z parafii kręgu
(czyli większość). Wyrażenie żyje w jednym miejscu — `lib/pary/zapytania.ts` — i jest
używane przez listę, eksport i statystyki rejonów.

### 4.3 Encje `krag` i `parafia` zamiast pól tekstowych

`README.md` pokazuje „Krąg" i „Parafia" jako pola tekstowe, ale DDL z tego samego
handoffu definiuje dla nich tabele. Wolny tekst rozjeżdża kaskadę filtrów po kilku
literówkach („św. Rity" / „Św. Rity" / „sw. Rity" = trzy różne kręgi).

**Rozstrzygnięcie:** encje, a w formularzu combobox — lista istniejących pozycji
zawężona do wybranego rejonu, plus opcja „+ nowy krąg" / „+ nowa parafia", która
odsłania pola (`numer`, `patron`, `parafia`) / (`nazwa`, `miasto`). Wygląd kontrolki
zgodny z tokenami inputa.

### 4.4 Usuwanie — dwie ścieżki

| Akcja | Kto | Efekt |
|---|---|---|
| „Usuń parę" | admin, para rejonowa (własny rejon) | `usuniete_at = now()`; rekord znika z list i eksportów; wpis audytu `usuniecie` |
| „Trwale usuń (żądanie RODO)" | wyłącznie admin, z potwierdzeniem | `DELETE` rekordu i rekolekcji; wpisy audytu **anonimizowane**, nie kasowane |

Anonimizacja audytu: `para_id → NULL`, `opis` zastąpiony przez
`„Rekord usunięty na żądanie (RODO), <data>"`. Rejestr eksportów i zmian musi przetrwać
usunięcie osoby — inaczej traci sens jako dowód rozliczalności.

**Retencja audytu:** 24 miesiące. Czyszczenie wykonuje skrypt `npm run retencja`
uruchamiany cronem hosta raz na dobę (ten sam mechanizm co `pg_dump` z §18) — bez
schedulera wewnątrz aplikacji, który przy wielu instancjach kontenera odpalałby się
równolegle. Skrypt kasuje wpisy audytu starsze niż 24 miesiące i wygasłe sesje.

---

## 5. Uprawnienia — jedno źródło prawdy

`src/lib/auth/permissions.ts` — moduł bez zależności od Prismy poza typami:

```ts
type Uzytkownik = { id: bigint; rola: 'admin' | 'rejon' | 'podglad'; rejonId: number | null }

zakresListy(u): Prisma.ParaWhereInput      // fragment `where` — sedno mechanizmu
mozeEdytowac(u, para): boolean
mozeUsuwac(u, para): boolean
mozeUsunacTrwale(u): boolean
mozeZarzadzacKontami(u): boolean
mozeCzytacAudyt(u): boolean
mozeImportowac(u): boolean                 // wyłącznie admin
mozeZmienicRejon(u): boolean               // false dla roli `rejon`
```

**Mechanizm zawężania.** `zakresListy()` zwraca fragment `where` wstrzykiwany w *każde*
zapytanie listy, eksportu i statystyk:

```ts
// rola 'rejon'  → { usuniete_at: null, rejon_id: u.rejonId }
// pozostałe     → { usuniete_at: null }
```

Dzięki temu zawężenie do rejonu nie jest czymś, o czym trzeba pamiętać przy każdym
zapytaniu — jest strukturalne. Ten sam moduł zasila UI (ukrywanie przycisków, banner
„Tylko podgląd"), więc interfejs i serwer nie mogą się rozjechać.

**Macierz testowa** (Vitest, wyczerpująca): 3 role × {własny rejon, obcy rejon} ×
{lista, odczyt, dodanie, edycja, usunięcie, zmiana rejonu, konta, audyt, eksport}.

---

## 6. Uwierzytelnianie

- **Hasła:** argon2id (`@node-rs/argon2`), parametry domyślne biblioteki.
- **Token sesji:** 32 bajty z `crypto.randomBytes`, base64url. W bazie tylko SHA-256 —
  wyciek dumpu bazy nie daje sesji.
- **Cookie:** `httpOnly`, `secure`, `sameSite=lax`, `path=/`, czas życia 30 dni,
  odświeżane przy aktywności.
- **`requireUser()`** — czyta cookie, waliduje sesję, sprawdza `konto.status = 'aktywne'`,
  zwraca `Uzytkownik` albo przekierowuje na `/logowanie`. Wywoływana w layoucie
  chronionej grupy tras **oraz** na wejściu każdej server action (layout nie chroni akcji).
- **Ograniczenie prób logowania:** 10 prób / 15 min na adres e-mail i na IP,
  licznik w Postgresie.
- **Zaproszenia:** token jednorazowy, ważny 7 dni, ustawia hasło i przełącza konto
  z `oczekuje` na `aktywne`. **Budowane dopiero w Planie 5** — patrz §6.1.
- **Wylogowanie** kasuje wiersz sesji. **Wyłączenie konta** kasuje wszystkie jego sesje.

### 6.1 Logowanie kontem Google — decyzja odłożona do Planu 5

Rozważane jako zamiennik hasła. Zalety: dziedziczenie 2FA z konta Google oraz
zniknięcie całego przepływu zaproszeń — admin dopisuje adres do tabeli `konto`,
osoba loguje się przyciskiem. Wada: część par rejonowych to użytkownicy `wp.pl`
i `o2.pl`, dla których założenie konta Google jest realnym tarciem wdrożeniowym.

**Odłożenie nic nie kosztuje, bo szew jest już we właściwym miejscu.** Obie metody
schodzą się w `utworzSesje(kontoId)`; wszystko za tym punktem — sesje, `requireUser()`,
uprawnienia, widoki — jest wspólne. Dodanie Google to dopisanie pary tras
(`/logowanie/google` + callback) kończących się wywołaniem tej samej funkcji,
plus jedna przyrostowa migracja z kolumną `konto.google_sub` (unikalna, nullable).
`konto.hash_hasla` jest już nullable, więc nie wymaga zmiany.

Gdyby decyzja wypadła na Google, do wyrzucenia idzie około stu linii: hashowanie
argon2id i ograniczenie prób logowania. **Kosztowny jest wyłącznie przepływ zaproszeń** —
i właśnie dlatego nie powstaje w Planie 1. Konto w statusie `oczekuje` po prostu się
nie loguje.

Warunek nienegocjowalny przy wariancie Google: **tabela `konto` działa jako twarda lista
dostępu.** Logowanie kończy się sukcesem tylko dla adresu już obecnego w tabeli ze
statusem `aktywne` — inaczej dowolny posiadacz konta Google wchodzi do kartoteki.
Wiązanie tożsamości po `sub` z tokenu (stabilny), dopasowanie po adresie e-mail wyłącznie
przy pierwszym logowaniu.

Sesje pozostają w bazie niezależnie od wybranej metody: Google nie wie o wyłączeniu
konta, więc wymóg natychmiastowej utraty dostępu i tak wymaga tabeli `sesja`.

---

## 7. Warstwa danych i przepływ

### Odczyt

```
page.tsx (server)
  → searchParams
  → parseFilters()            Zod: nieznane/błędne wartości → domyślne, nie 500
  → queryPary(user, filtry)   Prisma + zakresListy(user)
  → render
```

### Zapis

```
<form action={zapiszPare}>
  → requireUser()
  → Zod parse
  → assertMozeEdytowac(user, para)      rzuca → 403
  → prisma.$transaction([ zmiana, wpis audytu ])
  → revalidatePath()
```

**Audyt w tej samej transakcji co zmiana.** Osobny zapis pozwala na stan „zmiana bez
wpisu w historii" przy błędzie między nimi, a lista odbioru wymaga, żeby każdy zapis,
dodanie, usunięcie i eksport miały wpis.

### Zapis pary poza server action

`lib/pary/zapisz.ts` zawiera walidację i zapis. Server action jest cienkim adapterem.
Powód: **import z Excela musi przejść przez dokładnie tę samą walidację i ten sam
zapis** — inaczej stanie się drugą, słabiej strzeżoną drogą do bazy.

---

## 8. Lista, filtry, sortowanie

Wszystko po stronie serwera, wszystko w URL.

```
/pary?q=&rejon=&parafia=&krag=&formacja=&sort=&dir=&page=&karta=
```

- **Szukanie** obejmuje: nazwisko, imię żony, imię męża, e-mail, telefon, parafię, krąg.
  `ILIKE` z `unaccent` — „Baginscy" znajduje „Bagińscy".
- **Kaskada:** zmiana rejonu zeruje parafię i krąg; zmiana parafii zeruje krąg.
  Listy opcji zawężane zapytaniem, nie filtrowane na kliencie.
- **Filtr formacji**, 17 opcji: `dowolna` · `<KOD>` ×7 · `bez:<KOD>` ×7 · `INNE` · `brak`.
  Realizowany przez `EXISTS` / `NOT EXISTS` na `rekolekcje`.
- **Sortowanie:** 7 kolumn, dwukierunkowe, `nazwisko` rosnąco domyślnie. Kolumna
  „Formacja" nie jest sortowalna (zgodnie z README).
- **Paginacja:** 50 na stronę. Handoff dopuszcza paginację albo wirtualizację;
  paginacja jest linkowalna, więc trzyma się reguły „stan w URL".
- **Licznik** „N / M" z dopiskiem „(filtr)", gdy którykolwiek filtr aktywny.

Poniżej 860 px tabela zamienia się w karty — jeden komponent danych, dwie prezentacje,
przełączane CSS-em (nie `window.innerWidth`), żeby uniknąć skoku przy hydratacji.

---

## 9. Karta pary (drawer)

- **Natywny `<dialog showModal>`** pozycjonowany CSS-em jako panel z prawej.
  Daje z pudełka: focus trap, zamykanie `Esc`, `aria-modal`, blokadę tła, powrót
  fokusu do elementu wywołującego — pięć punktów sekcji „Dostępność", których
  prototyp nie ma.
- **Stan w URL:** `?karta=<id>` oraz `?karta=nowa`. Działa przycisk „wstecz",
  kartę da się wysłać linkiem, rekord renderuje się na serwerze, filtry zostają
  w tym samym adresie.
- **Edycja na kopii** — „Anuluj" porzuca zmiany bez dotykania listy.
- **Wiersz tabeli:** nośnikiem interakcji jest prawdziwy link „Edytuj →" / „Podgląd →"
  w ostatniej kolumnie. Klik w wiersz zostaje jako udogodnienie, ale dostępność
  klawiaturowa nie opiera się na `tabindex` na `<tr>`.
- **Walidacja:** nazwisko wymagane („Podaj nazwisko"); e-mail — format; telefon —
  format PL; rok rekolekcji 1970–bieżący; `nazwa` wymagana dla rodzaju `Inne`.
  Ten sam schemat Zod na kliencie i serwerze.
- **Pole „Rejon"** zablokowane dla roli `rejon` i w trybie read-only. Serwer odrzuca
  zmianę `rejon_id` przez rolę `rejon` niezależnie od stanu kontrolki.

---

## 10. Eksport

Route handler `GET /eksport?format=csv|xlsx&<te same parametry co lista>`.

Używa **tego samego** `parseFilters()` i tego samego `zakresListy(user)` co lista.
Dzięki temu „eksportuje aktualnie przefiltrowaną listę" jest prawdziwe z konstrukcji,
a nie z pamiętania o tym w dwóch miejscach.

**CSV:** separator `;`, BOM `﻿`, `\r\n`, cudzysłowy podwajane. Testowane
bajtowo w Vitest — Excel PL psuje ogonki przy każdym odstępstwie.

**XLSX:** `exceljs`, prawdziwy plik (nie CSV z rozszerzeniem), nagłówki pogrubione,
kolumny o sensownej szerokości.

**Kolumny** (kolejność wiążąca — to również układ szablonu importu):

```
Nazwisko · Imię żony · Imię męża · E-mail · Telefon · Rejon · Parafia · Krąg
ONŻ I (rok / miejsce) … ORD (rok / miejsce)      ← 7 kolumn stopni
Inne rekolekcje · Dzieci · Notatki
```

Wartość kolumny stopnia: `„2014 / Krościenko n. Dunajcem"`.
Wiele wpisów `Inne` sklejonych znakiem `|`.
Każdy eksport dopisuje wpis do audytu (kto, ile rekordów, jaki format, jakie filtry).

---

## 11. Import

Format definiuje aplikacja; dane źródłowe zostaną do niego przekształcone po stronie
zamawiającego. Odpada więc UI mapowania kolumn — zostaje stały szablon i twarda walidacja.

**Szablon = układ eksportu** (§10) plus jedna opcjonalna kolumna `ID` na początku.
Aplikacja udostępnia pusty szablon `.xlsx` do pobrania. Konsekwencja: eksport →
poprawki w Excelu → import działa jako pełna pętla.

### Reguły parsowania

| Kolumna | Format | Uwagi |
|---|---|---|
| `ID` | liczba lub puste | wypełnione → aktualizacja wskazanego rekordu; puste → nowy |
| `Nazwisko` | tekst, **wymagane** | forma mnoga, bez przekształceń |
| `Rejon` | `I`–`XII` albo `1`–`12` | oba akceptowane |
| `Parafia` | `nazwa, miasto` | rozdzielane po **ostatnim** przecinku |
| `Krąg` | `numer · patron` albo `numer` | patron opcjonalny; separator `·` lub `-` |
| `<stopień> (rok / miejsce)` | `rok / miejsce` albo sam `rok` | puste = brak wpisu |
| `Inne rekolekcje` | `nazwa; rok; miejsce` sklejone `\|` | |

Brakujące parafie i kręgi są zakładane w trakcie importu.
Rozpoznawanie duplikatów bez kolumny `ID`: `(nazwisko, imię żony, imię męża, rejon)`.

### Przebieg

1. Wgranie `.xlsx` lub `.csv` (oba czyta `exceljs`).
2. Walidacja wiersz po wierszu przez **ten sam schemat Zod** co formularz.
3. **Podgląd przed zapisem:** ile rekordów nowych, ile do aktualizacji, ile błędnych —
   z numerem wiersza i treścią błędu. Nic nie trafia do bazy przed potwierdzeniem.
4. Zapis w jednej transakcji przez `lib/pary/zapisz.ts`.
5. Zbiorczy wpis do audytu.

Import dostępny **wyłącznie dla roli `admin`**.

---

## 12. RODO

Dane obejmują przekonania religijne i dane dzieci — kategoria szczególna, art. 9.

- Hosting: VPS w UE, Docker, TLS wymuszony, umowa powierzenia z dostawcą.
- Hasła: argon2id. Tokeny sesji i zaproszeń: w bazie wyłącznie skróty.
- Dostęp ograniczony rolą **po stronie serwera** (§5).
- Rejestr eksportów i zmian w `audyt`, retencja 24 miesiące.
- Trwałe usunięcie na żądanie osoby (§4.4) z anonimizacją audytu.
- **`next/font` self-hostuje fonty w buildzie** — przeglądarka nigdy nie łączy się
  z `fonts.gstatic.com`, więc adresy IP członków wspólnoty nie trafiają do Google.
  Przy danych o przekonaniach religijnych to nie jest kosmetyka.
- Kopie zapasowe bazy szyfrowane, przechowywane w UE.
- Klauzula informacyjna dla członków wspólnoty — treść po stronie zamawiającego,
  aplikacja udostępnia dla niej stronę.

---

## 13. Dostępność

Poza tym, co daje `<dialog>` (§9):

- `aria-sort` na `<th>` sortowanej kolumny.
- Każde pole formularza z `<label for>`; komunikaty walidacji przez `aria-describedby`.
- Toast: `role="status"`, `aria-live="polite"`, auto-hide 2600 ms.
- Widoczny `:focus-visible` — obrys, nie sama zmiana koloru obramowania
  (prototyp ma tylko `border-color`, co przy nawigacji klawiaturą jest za słabe).
- Na mobile żaden element interaktywny poniżej 44 px.
- Kontrast: paleta 12 rejonów na tłach z alfą `1a` przechodzi AA dla 12 px —
  proporcji alfy nie zmieniamy bez ponownego pomiaru.

---

## 14. Polonizacja

`src/lib/pl/` — moduł czysto funkcyjny, w całości pokryty testami:

- **`odmiana(n, [poj, mn, dop])`** — `1 para` / `2–4 pary` / `5+ par`;
  końcówka mnoga dla 2–4 poza 12–14, dopełniacz dla reszty.
  Używane dla: par, kręgów, parafii, wpisów, rekordów.
- **Sortowanie:** `localeCompare(…, 'pl')` z `numeric: true` dla numerów kręgów;
  w bazie odpowiadająca mu kolacja `pl-PL-x-icu` (§4.1).
- **Daty:** `13.08.2026 21:12`. **Telefon:** `+48 XXX XXX XXX`.
- **Liczby rzymskie:** `ROMAN[rejon-1]`, jedno miejsce w kodzie.
- **Etykiety rodzajów rekolekcji:** jedna mapa `enum → { kod, pełna nazwa }`,
  kolejność wiążąca (to ścieżka formacji).

---

## 15. Design system

`src/styles/tokens.css` — wszystkie tokeny z sekcji „Design Tokens" README jako custom
properties: kolory, paleta 12 rejonów, skala typograficzna, odstępy, promienie, cienie,
animacje. Komponenty korzystają wyłącznie z tokenów; wartości literalne w CSS Modules
są błędem do wyłapania w review.

Trzy rodziny fontów przez `next/font/google` z `display: swap` i podzbiorem
`latin-ext` (polskie znaki).

---

## 16. Testy

**Vitest** — logika bez UI:
- macierz uprawnień (§5), wyczerpująca
- `odmiana()` — przypadki 1, 2, 4, 5, 11, 12, 14, 22, 112
- CSV — porównanie bajtowe: BOM, CRLF, separator, podwajanie cudzysłowów
- plakietka formacji — najwyższy stopień + `+N`, brak wpisów → `—`
- 17 opcji filtra formacji — każda zwraca niepusty wynik na danych seed
- parser importu — każda reguła z §11

**Playwright** — lista odbioru z `IMPLEMENTATION.md` §9 przepisana na scenariusze.
Każdy punkt listy = jeden test, nazwany tak, żeby raport z przebiegu dało się
zestawić z listą pozycja po pozycji.

**Uprawnienia testowane na poziomie serwera, nie UI:** wywołanie server action jako
`podglad` → odmowa; `GET /eksport?rejon=<obcy>` jako para rejonowa → dane zawężone
do własnego rejonu mimo parametru.

---

## 17. Seed

12 rejonów (I–XII), ~30 parafii, kręgi, **~300 par** z realistycznym rozkładem formacji:
część bez żadnych wpisów, część z lukami w stopniach, wszystkie 7 rodzajów obecne,
kilka wpisów `Inne`. Konta: admin, moderator, 12 par rejonowych (jedno w statusie
`oczekuje`). Dane generowane — nie są danymi rzeczywistych osób.

Rozkład musi gwarantować niepusty wynik dla każdej z 17 opcji filtra formacji
(punkt listy odbioru).

---

## 18. Deployment

`docker-compose.yml`: aplikacja (standalone build Next.js) + Postgres 16 + reverse
proxy z automatycznym TLS. Migracje Prismy uruchamiane przy starcie kontenera.
Zmienne: `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, konfiguracja SMTP dla zaproszeń.
Kopie zapasowe: `pg_dump` z crona, szyfrowane, retencja 30 dni.

---

## 19. Odstępstwa od handoffu → `DECISIONS.md`

| # | Odstępstwo | Uzasadnienie |
|---|---|---|
| 1 | Brak osobnego REST API (§5 handoffu) | Server Components + Server Actions zastępują 11 endpointów; zostaje jeden route eksportu. Mniejsza powierzchnia ataku i mniej kodu do strzeżenia |
| 2 | Sesje w bazie zamiast JWT | Lista odbioru wymaga natychmiastowej skuteczności wyłączenia konta |
| 3 | Bez Auth.js | v5 w becie od lat, v4 nie zna App Routera; własna warstwa ~150 linii |
| 4 | „Krąg" i „Parafia" jako combobox, nie input | DDL handoffu definiuje dla nich encje; wolny tekst rozjeżdża kaskadę filtrów |
| 5 | Drawer jako natywny `<dialog>` | Focus trap, `Esc`, `aria-modal`, powrót fokusu — bez własnego kodu |
| 6 | Wiersz tabeli: link zamiast klikalnego `<tr>` | Dostępność klawiaturowa bez `tabindex` na wierszach |
| 7 | Soft-delete + osobna trwała purga | Ochrona przed omyłką pary rejonowej **i** realizacja art. 17 |
| 8 | Import na stałym szablonie zamiast mapowania kolumn | Format definiuje aplikacja, dane źródłowe są do niego przekształcane |
| 9 | Szablon importu = układ eksportu + opcjonalne `ID` | Pełna pętla eksport → edycja → import; eksport pozostaje zgodny z listą odbioru |

---

## 20. Fazy

Każda kończy się stanem, który da się uruchomić i obejrzeć.

| # | Faza | Zawartość |
|---|---|---|
| 1 | Fundament | repo, Docker Compose + Postgres, Prisma schema, migracje, seed, `tokens.css`, fonty |
| 2 | Uwierzytelnianie | hasła, sesje, logowanie, wylogowanie, `requireUser()`, `permissions.ts` + testy jednostkowe |
| 3 | Powłoka | layout, sidebar/topbar, nawigacja zależna od roli, breakpointy 860 / 1120 |
| 4 | Lista par | tabela + karty, sortowanie, paginacja, stan w URL |
| 5 | Filtry | szukanie, kaskada rejon → parafia → krąg, 17 opcji formacji |
| 6 | Karta pary | `<dialog>`, formularz, walidacja, zapis, soft-delete, audyt |
| 7 | Formacja | wpisy, rodzaj `Inne`, podpowiadanie kolejnego stopnia |
| 8 | Eksport | CSV bajtowo poprawny + XLSX, wpis do audytu |
| 9 | Rejony · Konta · Historia | 12 kafelków, statusy kont, zaproszenia, paginowany audyt |
| 10 | Import | szablon do pobrania, walidacja, podgląd, zapis transakcyjny |
| 11 | RODO | trwała purga, retencja audytu, strona klauzuli informacyjnej |
| 12 | Odbiór | dostępność, e2e wg §9, `DECISIONS.md` |
