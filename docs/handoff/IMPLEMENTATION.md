# IMPLEMENTATION.md — instrukcja wykonawcza

> **Korekta z 18.08.2026: rejonów jest 11, nie 12.**
> Ten dokument opisywał pierwotnie dwanaście rejonów — tyle wynikało z założeń przed
> weryfikacją u zamawiającego. Wspólnota ma **jedenaście** rejonów, I–XI. Tekst poniżej
> został poprawiony.
>
> **Czego nie dało się poprawić:** `screenshots/05-rejony.png` i `screenshots/06-konta-rejonow.png`
> nadal pokazują dwanaście kafelków, a prototyp `Wspolnota.dc.html` nadal generuje
> dwanaście rejonów. Zrzuty są renderowane, nie rysowane, więc nie da się ich edytować
> bez ponownego uruchomienia narzędzia; prototyp jest materiałem do wyrzucenia i nie
> warto go migrować. **Przy rozbieżności obowiązuje tekst, nie obrazek.**
>
> W kodzie liczba rejonów nie jest literałem — wynika ze stałej `LICZBA_REJONOW`
> w `src/lib/domena/rejony.ts`.

Dokument dla agenta/dewelopera implementującego kartotekę. `README.md` opisuje **jak to
wygląda i jak się zachowuje** (specyfikacja wizualna). Ten plik mówi **co dokładnie
zbudować, w jakiej kolejności i kiedy zadanie jest skończone**.

Zasada nadrzędna: **nie pomijaj żadnego punktu z listy kontrolnej w sekcji 9.**
Jeśli czegoś nie da się zrobić w wybranym stosie, zaimplementuj najbliższy odpowiednik
i zapisz odstępstwo w `DECISIONS.md`.

---

## 1. Co jest w paczce

| Plik | Rola |
|---|---|
| `README.md` | Pełna specyfikacja: role, model danych, 7 widoków, tokeny, zachowania |
| `IMPLEMENTATION.md` | Ten plik — plan pracy i kryteria odbioru |
| `Wspolnota.dc.html` | Działający prototyp HTML — **referencja, nie kod produkcyjny** |
| `support.js` | Runtime prototypu. **Nie przenoś do produkcji.** Nie czytaj go jako wzorca architektury |
| `screenshots/*.png` | Zrzuty wszystkich widoków (spis w sekcji 8) |

Prototyp otwierasz w przeglądarce (`Wspolnota.dc.html`) — **zrób to na początku** i
przeklikaj wszystkie ekrany. Zaloguj się kolejno jako **ADM**, **III** i **MOD**, żeby
zobaczyć różnice uprawnień. To najszybszy sposób zrozumienia zakresu.

Logika prototypu (generator danych, filtry, eksport CSV, reguły uprawnień) siedzi
w bloku `<script data-dc-script>` w `Wspolnota.dc.html` — czytaj ją jako **opis
zamierzonych reguł**, nie jako kod do przepisania.

## 2. Czego NIE przenosić z prototypu

- `support.js` i cały mechanizm `<x-dc>`, `sc-for`, `sc-if`, `renderVals()` — to
  narzędzie prototypowania.
- **Style inline.** W prototypie każdy element ma `style="…"` (wymóg narzędzia).
  W produkcji użyj systemu stylów docelowego codebase'u (CSS Modules, Tailwind,
  styled-components, cokolwiek jest już używane) i wyciągnij tokeny z sekcji
  „Design Tokens" w `README.md` do jednego miejsca.
- `makeData()` — generator danych demonstracyjnych. Wykorzystaj go **wyłącznie** do
  wygenerowania seeda dla środowiska deweloperskiego, jeśli to przydatne.
- Trzymanie 302 rekordów w stanie komponentu.

## 3. Stos i architektura

Jeśli codebase już istnieje — trzymaj się jego wzorców (routing, warstwa danych,
komponenty, testy) i pomiń tę sekcję.

Jeśli budujesz od zera, domyślna rekomendacja: **Next.js (App Router) + TypeScript +
PostgreSQL (Prisma) + Auth.js**. Uzasadnienie: aplikacja jest CRUD-em z rolami i
eksportem, ~15 użytkowników edytujących i ~300 rekordów; SSR upraszcza kontrolę
uprawnień po stronie serwera, a hosting jest tani.

Wymagania niezależne od stosu:

- **Autoryzacja po stronie serwera.** Każdy endpoint/akcja waliduje rolę i przynależność
  rejonową. Ukrycie przycisku w UI to nie zabezpieczenie.
- **Jedno źródło reguł uprawnień** — funkcja typu `canEdit(user, para)` używana zarówno
  w UI, jak i w warstwie API.
- **Walidacja wejścia** po stronie serwera (Zod/klasa DTO), nie tylko w formularzu.
- Filtry, sortowanie i paginacja realizowane zapytaniem do bazy (query params
  w URL, żeby dały się linkować i odświeżać).

## 4. Model danych (DDL — punkt wyjścia)

```sql
CREATE TYPE rola AS ENUM ('admin', 'rejon', 'podglad');
CREATE TYPE rodzaj_rekolekcji AS ENUM
  ('ONZ_I','ONZ_II','ONZ_III','ORAR_I','ORAR_II','PILOTOWANIE','ORD','INNE');
CREATE TYPE status_konta AS ENUM ('aktywne','wylaczone','oczekuje');

CREATE TABLE rejon (
  id          smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 11),
  numer_rzym  text NOT NULL          -- 'I'…'XI'
);

CREATE TABLE parafia (
  id        bigserial PRIMARY KEY,
  nazwa     text NOT NULL,           -- 'św. Brygidy'
  miasto    text NOT NULL,           -- 'Gdańsk'
  UNIQUE (nazwa, miasto)
);

CREATE TABLE krag (
  id          bigserial PRIMARY KEY,
  rejon_id    smallint NOT NULL REFERENCES rejon(id),
  numer       smallint NOT NULL,     -- numer w obrębie rejonu
  patron      text,                  -- 'św. Rity' (opcjonalny)
  parafia_id  bigint NOT NULL REFERENCES parafia(id),
  UNIQUE (rejon_id, numer)
);

CREATE TABLE para (
  id            bigserial PRIMARY KEY,
  imie_zony     text NOT NULL,
  imie_meza     text NOT NULL,
  nazwisko      text NOT NULL,
  email         text,
  telefon       text,
  rejon_id      smallint NOT NULL REFERENCES rejon(id),
  krag_id       bigint REFERENCES krag(id),
  parafia_id    bigint REFERENCES parafia(id),  -- gdy różna od parafii kręgu
  dzieci        text,
  notatki       text,
  utworzono     timestamptz NOT NULL DEFAULT now(),
  zmieniono     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON para (rejon_id);
CREATE INDEX ON para (nazwisko);

CREATE TABLE rekolekcje (
  id        bigserial PRIMARY KEY,
  para_id   bigint NOT NULL REFERENCES para(id) ON DELETE CASCADE,
  rodzaj    rodzaj_rekolekcji NOT NULL,
  rok       smallint NOT NULL CHECK (rok BETWEEN 1970 AND 2100),
  miejsce   text,
  nazwa     text,                    -- wymagane gdy rodzaj = 'INNE'
  CHECK (rodzaj <> 'INNE' OR nazwa IS NOT NULL)
);
CREATE INDEX ON rekolekcje (para_id);
CREATE INDEX ON rekolekcje (rodzaj);

CREATE TABLE konto (
  id            bigserial PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  hash_hasla    text,
  nazwa         text NOT NULL,       -- 'Anna i Marek Sowa'
  rola          rola NOT NULL,
  rejon_id      smallint REFERENCES rejon(id),  -- NULL dla admin/podglad
  status        status_konta NOT NULL DEFAULT 'oczekuje',
  ostatnie_logowanie timestamptz,
  CHECK ((rola = 'rejon') = (rejon_id IS NOT NULL))
);

CREATE TABLE audyt (
  id         bigserial PRIMARY KEY,
  kiedy      timestamptz NOT NULL DEFAULT now(),
  rodzaj     text NOT NULL,          -- 'edycja'|'dodanie'|'usuniecie'|'eksport'|'konto'
  opis       text NOT NULL,
  konto_id   bigint REFERENCES konto(id),
  para_id    bigint                  -- bez FK: rekord może już nie istnieć
);
```

Mapowanie enuma na etykiety UI (jedno miejsce w kodzie, kolejność ma znaczenie —
to ścieżka formacji):

| enum | kod w UI | pełna nazwa w select |
|---|---|---|
| `ONZ_I` | ONŻ I | Oaza Nowego Życia I stopnia |
| `ONZ_II` | ONŻ II | Oaza Nowego Życia II stopnia |
| `ONZ_III` | ONŻ III | Oaza Nowego Życia III stopnia |
| `ORAR_I` | ORAR I | Oaza Rekolekcyjna Animatorów Rodzin I stopnia |
| `ORAR_II` | ORAR II | Oaza Rekolekcyjna Animatorów Rodzin II stopnia |
| `PILOTOWANIE` | Pilotowanie | Sesja o pilotowaniu kręgów |
| `ORD` | ORD | Oaza Rekolekcyjna Diakonii |
| `INNE` | Inne | Inne rekolekcje |

Seed: 11 rejonów z numerami rzymskimi + konta 11 par rejonowych (jedno `oczekuje`) +
konto admina + konto moderatora.

## 5. API (jeśli budujesz warstwę serwerową)

```
GET    /api/pary?q=&rejon=&parafia=&krag=&formacja=&sort=&dir=&page=
POST   /api/pary
GET    /api/pary/:id
PATCH  /api/pary/:id
DELETE /api/pary/:id
GET    /api/pary/export?format=csv|xlsx&<te same filtry>
GET    /api/rejony                  -- statystyki: liczba par, kręgów, parafii, para odp.
GET    /api/konta                   -- tylko admin
PATCH  /api/konta/:id               -- status; tylko admin
POST   /api/konta/:id/zaproszenie   -- tylko admin
GET    /api/audyt?page=             -- tylko admin
```

Parametr `formacja` przyjmuje: `<KOD>` (ma), `bez:<KOD>` (nie ma), `INNE`, `brak`.

Reguły serwerowe:
- rola `rejon` — lista i eksport **zawężone** do własnego rejonu; POST/PATCH/DELETE tylko
  dla par ze swojego rejonu; próba zmiany `rejon_id` → 403
- rola `podglad` — tylko GET; każdy zapis → 403
- rola `admin` — pełny dostęp
- każdy POST/PATCH/DELETE i każdy eksport dopisuje wpis do `audyt`

## 6. Kolejność pracy

1. **Schemat i seed** — DDL z sekcji 4, 11 rejonów, konta, ~30 parafii, kręgi, ~300 par
   z realistycznym rozkładem formacji (część par bez wpisów, część z lukami w stopniach,
   wszystkie 7 rodzajów obecne w danych).
2. **Auth i role** — logowanie, sesja, `canEdit(user, para)`, guard na endpointach.
3. **Powłoka** — sidebar/topbar, nawigacja zależna od roli, breakpointy 860 i 1120 px.
4. **Lista par** — tabela (desktop) + karty (mobile), sortowanie, paginacja.
5. **Filtry** — szukaj, rejon → parafia → krąg (kaskada), formacja; stan w URL.
6. **Karta pary** — drawer, formularz, tryb read-only, walidacja, zapis/usuwanie.
7. **Sekcja formacji** — lista wpisów, dodawanie/usuwanie, pole `nazwa` dla `INNE`,
   podpowiadanie kolejnego stopnia.
8. **Eksport** — CSV (`;`, BOM, CRLF) i XLSX (prawdziwy generator) z aktualnych filtrów.
9. **Rejony** — 11 kafelków z paletą kolorów, statystyki, przejście do listy z filtrem.
10. **Konta rejonów** — statusy, włączanie/wyłączanie, zaproszenia.
11. **Historia zmian** — lista z paginacją, plakietki rodzajów.
12. **Dostępność i RODO** — sekcja 7 poniżej.

## 7. Wymagania, o których łatwo zapomnieć

**Język i odmiana.** Cały interfejs po polsku. Liczebniki wymagają odmiany przez
przypadki: `1 para` / `2–4 pary` / `5+ par`, `1 krąg` / `2 kręgi` / `5 kręgów`,
`1 parafia` / `2 parafie` / `5 parafii`, `1 wpis` / `2 wpisy` / `5 wpisów`.
Reguła: końcówka „mnoga" dla 2–4 (poza 12–14), „dopełniacz" dla pozostałych.
Prototyp ma to w funkcji `odmiana(n, [poj, mn, dop])` — przenieś ten helper.

**Nazwiska w formie mnogiej.** Kartoteka opisuje małżeństwa, więc nazwisko jest w
liczbie mnogiej: „Kowalscy", „Nowakowie", „Formela". Nie próbuj tego generować
z formy pojedynczej przy wpisach od użytkownika — pole jest wolnym tekstem, użytkownik
wpisuje gotową formę.

**Polskie znaki wszędzie**: sortowanie z `localeCompare(…, 'pl')` (Ł po L, nie na końcu),
`numeric: true` dla numerów kręgów, wyszukiwanie nieczułe na wielkość liter,
CSV z BOM (inaczej Excel PL zepsuje ogonki), `lang="pl"` na `<html>`.

**Dostępność** (prototyp jest tu niekompletny — dokończ):
- drawer: focus trap, zamykanie klawiszem `Esc`, `role="dialog"` + `aria-modal`,
  zwrot focusu do wiersza po zamknięciu
- klikalne wiersze tabeli: obsługa klawiatury (`tabindex`, `Enter`) albo przycisk
  „Edytuj/Podgląd" jako właściwy element interaktywny
- sortowanie: `aria-sort` na `th`
- każde pole formularza z `<label for>`; komunikaty walidacji powiązane
  przez `aria-describedby`
- kontrast: paleta rejonów na tłach z alfą `1a` przechodzi AA dla tekstu 12 px —
  nie zmieniaj proporcji alfy bez ponownego sprawdzenia
- toast: `role="status"`, `aria-live="polite"`
- widoczny stan focus na wszystkich kontrolkach (prototyp ma `border-color: #1c5f96`;
  dodaj obrys, żeby był widoczny też przy nawigacji klawiaturą)

**RODO.** Dane obejmują przekonania religijne i dane dzieci — kategoria szczególna
(art. 9 RODO). Minimum: HTTPS, hasła hashowane (argon2/bcrypt), dostęp ograniczony rolą
**po stronie serwera**, rejestr eksportów (jest w audycie), procedura trwałego usunięcia
danych po odejściu ze wspólnoty, polityka retencji audytu, umowa powierzenia z hostingiem,
klauzula informacyjna dla członków. Rozstrzygnij świadomie: soft-delete vs trwałe
usunięcie (prototyp usuwa rekord z listy — produkcyjnie musi istnieć droga do trwałego
usunięcia na żądanie osoby).

**Wydajność.** 302 pary dziś, ale kartoteka rośnie. Paginacja lub wirtualizacja listy
(prototyp renderuje tylko pierwsze 60 wierszy — to zaślepka, nie wzorzec).

## 8. Zrzuty ekranów

| Plik | Co pokazuje |
|---|---|
| `screenshots/01-logowanie.png` | Ekran logowania (w prototypie: wybór jednego z 4 kont demo) |
| `screenshots/02-lista-par-admin.png` | Lista par jako admin — powłoka, header, filtry, tabela |
| `screenshots/03-karta-pary-pelna.png` | Karta pary w całości: formularz + sekcja formacji + stopka akcji |
| `screenshots/04-formacja-rekolekcje.png` | Zbliżenie na sekcję formacji (wiersze wpisów) |
| `screenshots/05-rejony.png` | Rejony — kafelki, paleta kolorów, statystyki (zrzut pokazuje 12, jest 11) |
| `screenshots/06-konta-rejonow.png` | Konta rejonów — statusy i akcje |
| `screenshots/07-historia-zmian.png` | Historia zmian — plakietki rodzajów wpisów |
| `screenshots/08-mobile-lista.png` | Widok mobilny (412 px): topbar, przewijana nawigacja, karty par |
| `screenshots/09-tabela-kolumny.png` | Tabela w pełnej szerokości — wszystkie 9 kolumn |

Uwagi do czytania zrzutów:
- Silnik zrzutów renderuje `<select>` **zwinięty do pierwszej opcji**, więc np. pole
  „Rejon" na zrzucie karty pary pokazuje „Rejon I", choć rekord należy do rejonu V
  (kicker nad tytułem podaje prawdziwą wartość). Wartości pól opisuje `README.md`.
- Zrzut mobilny to wymuszone 412 px w oknie przeglądarki — proporcje tekstu są
  poprawne, ale sprawdź układ na prawdziwym urządzeniu.
- Kolory na zrzutach są wierne; typografia zależy od dostępności fontów Google —
  w razie różnic prawdą jest specyfikacja z `README.md`.

## 9. Lista kontrolna odbioru

Zadanie jest skończone, gdy **każdy** punkt jest spełniony i sprawdzony ręcznie.

**Uprawnienia**
- [ ] Para rejonowa widzi **tylko** pary ze swojego rejonu — także w eksporcie i w API
- [ ] Para rejonowa nie może zmienić rejonu pary (pole zablokowane **i** walidacja serwera)
- [ ] Moderator widzi całość, ale każda próba zapisu kończy się odmową (UI + API)
- [ ] Admin widzi 4 pozycje nawigacji; para rejonowa 1; moderator 2
- [ ] Baner „Tylko podgląd" pojawia się w karcie pary bez prawa edycji
- [ ] Przycisk akcji w wierszu to „Edytuj →" albo „Podgląd →" zależnie od uprawnień

**Lista i filtry**
- [ ] Szukanie obejmuje nazwisko, oba imiona, e-mail, telefon, parafię i krąg
- [ ] Wybór rejonu zawęża listę parafii; wybór parafii zawęża listę kręgów
- [ ] Zmiana rejonu zeruje parafię i krąg; zmiana parafii zeruje krąg
- [ ] Filtr formacji ma 17 opcji: dowolna, 7× „Ma …", 7× „Bez …", „Ma inne rekolekcje",
      „Bez żadnych rekolekcji" — i **każda** zwraca niepusty wynik na danych seed
- [ ] Licznik pokazuje „N / M" i dopisek „(filtr)" gdy jakikolwiek filtr aktywny
- [ ] Sortowanie działa na 7 kolumnach, dwukierunkowo, ze strzałką w nagłówku
- [ ] Stan filtrów i sortowania jest w URL (odświeżenie strony go zachowuje)
- [ ] Poniżej 860 px tabela zamienia się w karty; powyżej wraca tabela
- [ ] Pusty wynik pokazuje komunikat „Brak wyników dla podanych kryteriów."

**Karta pary**
- [ ] Wszystkie pola z modelu są edytowalne (bez daty ślubu i roku wstąpienia — **usunięte
      świadomie**, nie dodawaj ich)
- [ ] Nazwisko wymagane; puste blokuje zapis z komunikatem „Podaj nazwisko"
- [ ] Sekcja formacji: dodawanie i usuwanie wpisów, licznik wpisów z poprawną odmianą
- [ ] Pole „nazwa rekolekcji" pojawia się **tylko** dla rodzaju `Inne` i jest wtedy wymagane
- [ ] „+ Dodaj rekolekcje" podpowiada pierwszy stopień, którego para jeszcze nie ma
- [ ] Anulowanie porzuca zmiany (edycja pracuje na kopii rekordu)
- [ ] Zapis, dodanie i usunięcie dopisują wpis do historii zmian z autorem i datą
- [ ] Drawer zamyka się klikiem w tło, przyciskiem ✕ i klawiszem `Esc`; focus wraca na miejsce

**Eksport**
- [ ] Eksportuje **aktualnie przefiltrowaną** listę, nie całość
- [ ] CSV: separator `;`, BOM, CRLF, cudzysłowy podwajane — otwiera się poprawnie
      w Excelu PL z polskimi znakami
- [ ] XLSX to prawdziwy plik XLSX (nie CSV z rozszerzeniem), otwiera się bez ostrzeżeń
- [ ] Kolumny: 8 podstawowych + 7 kolumn stopni („rok / miejsce") + „Inne rekolekcje"
      + Dzieci + Notatki
- [ ] Eksport dopisuje wpis do historii zmian

**Rejony / konta / audyt**
- [ ] 11 kafelków, każdy z własnym kolorem z palety, liczbą par, parą odpowiedzialną
      i statystyką „N kręgów · M parafii" (odmiana!)
- [ ] Rejon bez obsadzonej pary pokazuje „Do obsadzenia"
- [ ] Klik w kafelek przenosi do listy z ustawionym filtrem rejonu
- [ ] Konta: 11 rejonów + moderator; statusy aktywne/wyłączone/oczekuje z właściwymi
      kolorami; akcje Wyłącz/Włącz/Zaproś działają
- [ ] Wyłączone konto faktycznie nie może się zalogować
- [ ] Kolumna „ostatnie logowanie" chowa się poniżej 1120 px
- [ ] Historia zmian: 5 rodzajów wpisów z odrębnymi kolorami plakietek, paginacja

**Wygląd**
- [ ] Kolory, typografia, promienie, cienie i odstępy zgodne z sekcją „Design Tokens"
- [ ] Trzy rodziny fontów: Source Sans 3 (UI), Source Serif 4 (nagłówki),
      IBM Plex Mono (dane techniczne — telefony, kody, liczniki, daty)
- [ ] Aktywna pozycja nawigacji: złote `#e2b04a` na tle `rgba(226,176,74,.16)`
- [ ] Plakietka rejonu i kafelek rejonu używają koloru z 11-barwnej palety
- [ ] Plakietka formacji pokazuje najwyższy stopień + `+N`, a przy braku wpisów `—`
- [ ] Animacje: drawer 220 ms `slidein`, overlay 150 ms `fadein`, toast auto-hide 2600 ms
- [ ] Na mobile żaden element interaktywny nie jest niższy niż 44 px

**Jakość**
- [ ] Brak błędów w konsoli
- [ ] Uprawnienia przetestowane **na poziomie API** (nie tylko UI)
- [ ] Walidacja po stronie serwera dla wszystkich pól
- [ ] `DECISIONS.md` z odstępstwami od specyfikacji i ich uzasadnieniem

## 10. Pytania do zamawiającego (rozstrzygnij, nie zgaduj)

1. Czy krąg może liczyć więcej niż jedną parafię, czy zawsze jedna parafia na krąg?
2. Czy para rejonowa ma widzieć dane par z innych rejonów w trybie podglądu
   (dziś: nie widzi ich wcale)?
3. Czy potrzebna jest historia zmian widoczna dla par rejonowych (dziś: tylko admin)?
4. Soft-delete czy trwałe usunięcie pary? Jaka retencja audytu?
5. Czy oprócz małżeństw kartoteka ma obejmować kapłanów-moderatorów kręgów jako rekordy?
6. Czy potrzebny jest import z istniejącego arkusza (jeśli kartoteka jest dziś w Excelu)?
7. Czy eksport ma mieć wariant „lista kontaktowa" (tylko imiona, nazwisko, telefon, e-mail)?
