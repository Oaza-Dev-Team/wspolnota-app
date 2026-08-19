# Odstępstwa od specyfikacji i wynik odbioru

Stan na 19.08.2026. Handoff projektowy (`docs/handoff/`) jest nadrzędny dla wyglądu
i zachowań; ten dokument spisuje miejsca, w których świadomie od niego odeszliśmy,
oraz wynik przejścia listy kontrolnej z `docs/handoff/IMPLEMENTATION.md` §9.

## 1. Odstępstwa

### 1.1 Rejonów jest 11, nie 12

Handoff i wszystkie zrzuty ekranu pokazują 12 rejonów. Zweryfikowane u zamawiającego:
jest ich **11 (I–XI)**. Teksty poprawiliśmy, zrzutów i prototypu nie — zostają jako
materiał historyczny. Liczba nigdy nie jest w kodzie literałem: wynika z `REGION_COUNT`
w `src/lib/domain/regions.ts`, więc kolejna korekta to jedna linia.

### 1.2 Eksport i import wyłącznie XLSX, bez CSV

Zakres zawężony 19.08.2026 na prośbę zamawiającego. Punkty listy odbioru mówiące
o CSV (separator `;`, BOM, CRLF, podwajanie cudzysłowów) są **nieaktualne** i nie
były realizowane. XLSX to prawdziwy plik ZIP-owy, co sprawdza asercja na sygnaturze
`PK` w `src/lib/couples/export.int.test.ts` — nie da się przypadkiem podać CSV-a
z podmienionym rozszerzeniem.

### 1.3 Zaproszenia bez SMTP

Handoff mówi „wysyłka zaproszenia e-mail". Poczta nie jest w tym projekcie
skonfigurowana, a dołożenie jej oznaczałoby serwer SMTP do wdrożenia i utrzymania.
Zamiast tego „Zaproś" generuje **jednorazowy link ważny 7 dni**, który administrator
kopiuje i przekazuje sam. Przy piętnastu kontach zakładanych raz to tańsze, a przy
okazji nie zostawia zaproszeń w cudzych skrzynkach.

**Odwracalne:** gdy SMTP się pojawi, wysyłka to jedno wywołanie w tej samej akcji.

### 1.4 Logowanie Google odłożone

Spec §6.1 wyznaczał Plan 5 jako moment decyzji. Decyzja wymaga wiedzy, której nie
mamy: czy te konkretne piętnaście osób ma konta Google. Wariant z linkiem zaproszenia
jest neutralny — działa tak samo przy haśle i przy Google — więc odłożenie nic nie
kosztuje. **Pytanie otwarte do zamawiającego.**

### 1.5 Usuwanie dwustopniowe

Handoff pytał: soft-delete czy trwałe usunięcie? Odpowiedź: **oba**, bo służą różnym
rzeczom.

| Akcja | Kto | Efekt |
|---|---|---|
| „Usuń parę" | admin, para rejonowa we własnym rejonie | `deletedAt = now()`, rekord znika z list i eksportów |
| „Trwale usuń (żądanie RODO)" | wyłącznie admin | `DELETE` rekordu i rekolekcji, wpisy audytu **anonimizowane** |

Miękkie usunięcie chroni przed pomyłką; trwałe realizuje żądanie osoby. Wpisy audytu
przeżywają trwałe usunięcie z `coupleId = NULL` i podmienionym opisem — rejestr
rozliczalności, który da się skasować razem z rekordem, nie jest rejestrem.

**Dodatek poza handoffem:** lista ma przełącznik „Usunięte". Bez niego miękko usunięty
rekord byłby nieosiągalny, a **nie da się usunąć na żądanie czegoś, czego nie da się
znaleźć** — ani przywrócić. Kto go widzi, opisuje §1.16.

### 1.6 Potwierdzenie trwałego usunięcia przez przepisanie nazwiska

Zwykłe „na pewno?" przy operacji nieodwracalnej klika się odruchowo. Administrator
przepisuje nazwisko pary — ta sama technika, co przy kasowaniu repozytorium na
GitHubie, i z tego samego powodu.

### 1.7 Retencja jako zadanie crona hosta

`npm run retention` kasuje wpisy audytu starsze niż 24 miesiące i wygasłe sesje.
Świadomie **nie** jest to scheduler wewnątrz aplikacji: przy kilku instancjach
kontenera każda odpalałaby własny timer i ścigałyby się o te same wiersze. Host
uruchamia to raz na dobę, obok `pg_dump`.

### 1.8 Klauzula informacyjna z widocznymi lukami

`/privacy` to rusztowanie z jawnie oznaczonymi miejscami do uzupełnienia
(administrator danych, podstawa prawna, dostawca hostingu, okres przechowywania po
odejściu ze wspólnoty). Treść wiążąca należy do zamawiającego. Zmyślona klauzula,
która wygląda na gotową, jest gorsza niż taka, po której widać, że gotowa nie jest.

### 1.9 Nawigacja ma pięć pozycji dla admina, nie cztery

Lista odbioru mówi „admin widzi 4 pozycje". Doszedł **Import**, którego handoff nie
przewidywał jako osobnego widoku. Para rejonowa nadal widzi 1, moderator 2.

### 1.10 Ścieżki tras po angielsku — decyzja odwrócona 19.08.2026

Pierwotnie trasy były po polsku (`/pary`, `/logowanie`), z uzasadnieniem „to adres,
który widzi użytkownik". Po przejrzeniu tego uzasadnienia zamawiający zmienił zdanie
i zdecydował o przejściu na angielski. Powody:

**Korzyść się nie materializowała.** Aplikacja jest za logowaniem, nawigacja odbywa się
przez klikanie, nikt nie wpisuje `/rejony` ręcznie. Jedyny link, który ktokolwiek komuś
wysyła, to zaproszenie — a ono i tak niesie nieczytelny token.

**Koszty wracały przy każdej trasie.** Polski rzeczownik się odmienia, a REST chce
jednego rdzenia dla kolekcji i elementu: `/pary/1` czyta się jak „pary/1", a `/para/1`
rozjeżdża się z listą. Znaków diakrytycznych nie mieliśmy przez przypadek, nie przez
projekt — pierwsze `/kręgi` zamieniłoby się przy kopiowaniu w `/kr%C4%99gi`. I każdy
plik dotyczący par nosił dwie nazwy na jedno pojęcie: katalog `pary/` obok modułu
`couples/`.

**Reguła się upraszcza.** Nie ma już granicy do rozstrzygania przy każdej nowej trasie —
to właśnie na niej potknął się endpoint zdrowia, który powstał jako `/zdrowie`, choć
czyta go wyłącznie Docker.

Mapowanie: `/pary`→`/couples`, `/logowanie`→`/login`, `/wyloguj`→`/logout`,
`/rejony`→`/regions`, `/konta`→`/accounts`, `/historia`→`/history`,
`/eksport`→`/export`, `/eksport/szablon`→`/export/template`,
`/zaproszenie`→`/invite`, `/informacja-o-danych`→`/privacy`, `/zdrowie`→`/health`.
`/import` był już angielski.

**Plany wykonawcze w `docs/superpowers/plans/` pokazują stare ścieżki i tak zostaje** —
są zapisem tego, co robiliśmy wtedy, nie dokumentacją stanu obecnego. Tak samo jak
handoff, którego nie poprawiamy.

### 1.11 Poprawka językowa: „Bez pilotowania"

Filtr formacji budował etykiety jako `Bez ${kod}`, co dawało „Bez Pilotowanie".
Skróty (ONŻ I, ORAR II, ORD) się nie odmieniają, ale „pilotowanie" to polski
rzeczownik. Kody zostały nietknięte, bo trafiają do nagłówków kolumn eksportu —
forma dopełniacza to osobne pole `genitive`.

---

### 1.12 Czwarta rola: konto techniczne (`superadmin`)

Handoff zna trzy role. Doszła czwarta, na Twoją prośbę z 19.08.2026, bo `admin` u nas
znaczy „para odpowiedzialna za wspólnotę" — urząd we wspólnocie, który zmienia się co
kilka lat. Opiekun techniczny instalacji to ktoś inny i musi trwać ponad tymi zmianami:
powołuje parę odpowiedzialną i jest drogą powrotną, gdy coś pójdzie źle.

`superadmin` ma **wszystkie uprawnienia admina** (Twój wybór; wariant bez dostępu do
kartoteki był rozważany pod kątem minimalizacji z art. 5 RODO i odpadł) oraz jedno
więcej: zarządzanie kontami technicznymi. Cała granica między rolami to jedno zdanie
w `canManageRole` — **admin nie może dotknąć konta technicznego**. Nie chodzi o
podgląd, tylko o przejęcie: zmiana adresu albo wygenerowanie zaproszenia to
w praktyce zmiana hasła, więc kto może je wystawić, ten może wejść na to konto.

Admin↔admin jest świadomie **dozwolone**. Obie role trzymają już całą kartotekę, więc
nie ma między nimi czego chronić, a zakaz zablokowałby parze odpowiedzialnej
poprawienie własnej nazwy i adresu.

Dwie blokady chronią przed zamknięciem się na zewnątrz: nikt nie wyłączy własnego
konta, a ostatniego **aktywnego** konta technicznego nie wyłączy nikt.

Pochodne zmiany: `npm run create-admin` → `npm run create-superadmin` (zakłada teraz
konto techniczne, nie admina), a pozycja nawigacji „Konta rejonów" nazywa się **„Konta"**
— widok trzyma już nie tylko rejony.

### 1.13 Tworzenie kont z interfejsu

Do 19.08.2026 konta powstawały wyłącznie z seeda i skryptu bootstrap; interfejs umiał
je włączać, wyłączać, zapraszać i przekazywać, ale nie utworzyć. Widok **Konta** ma
teraz formularz „+ Dodaj konto". Konto powstaje tam, gdzie zaczyna każde: bez hasła,
w stanie `pending`, z jednorazowym zaproszeniem — ta sama ścieżka, co „Zaproś".

Kto jaką rolę może założyć, rozstrzyga `canManageRole`, więc admin nie zobaczy w liście
„Konto techniczne".

**Rejon, który ma już konto, nie jest oferowany.** `regionStats` sięga po parę
odpowiedzialną przez mapę kluczowaną numerem rejonu, więc drugie aktywne konto po cichu
przesłoniłoby pierwsze. Zmiana pary rejonowej to „Przekaż rejon…", które przy okazji
odbiera dostęp ustępującej parze — i formularz tam odsyła.

**Usuwanie kont dołożone 19.08.2026 — poprzednie zdanie w tym miejscu było błędne.**
Napisałem, że usuwania nie planujemy, bo wpisy audytu wskazują na konto. Sprawdzenie
kodu pokazało coś innego: `audit.account_id` ma od początku `ON DELETE SET NULL`,
a `src/lib/audit/list.ts` renderuje wpis bez konta jako „konto usunięte" i ma na to
test. Projekt przewidywał usuwanie kont od pierwszej migracji; brakowało tylko
przycisku. Patrz §1.14.

### 1.14 Usuwanie kont

Wyłączenie zostaje jako opcja odwracalna. Usunięcie jest dla konta, które nie powinno
było powstać, i dla kogoś, kto odszedł na dobre.

Znika konto i jego sesje (klucz obcy `session` ma `ON DELETE CASCADE`). **Wpisy
w historii zostają**, bez nazwy — rejestr odpowiedzialności, który da się skasować
razem z tym, za co odpowiada, nie jest rejestrem. Odchodzi natomiast to, co
identyfikuje osobę: nazwa i adres. Sam fakt usunięcia trafia do historii z nazwą
usuniętego konta, żeby dało się odtworzyć, komu odebrano dostęp; retencja przycina
ten wpis razem z resztą.

Dwie blokady, te same co przy wyłączaniu: nie usuniesz własnego konta ani ostatniego
**aktywnego** konta technicznego. Potwierdzenie jest dwustopniowe — panel mówi, co
zniknie, a co zostanie, zanim cokolwiek się stanie.

### 1.15 Kilka kont na rejon: para odpowiedzialna i pomocnicy

Handoff zakłada jedno konto na rejon. Na Twoją prośbę z 19.08.2026 rejon może mieć
ich kilka: parę odpowiedzialną i dowolną liczbę pomocników do utrzymywania kartoteki.

**Uprawnienia ich nie rozróżniają** — pomocnik edytuje dokładnie te pary co para
odpowiedzialna, bo `listScope` i `canEdit` patrzą na rolę i rejon, a te są takie same.
Różnica jest w dwóch miejscach: kafelek rejonu nazywa parę odpowiedzialną, i tylko jej
konto da się „Przekazać". Pomocnika się nie przekazuje — usuwa się go i zakłada nowego.

Rozróżnia je kolumna `account.region_lead`. **Jedna para odpowiedzialna na rejon**
pilnuje częściowy indeks unikalny (`WHERE region_lead`), a nie tylko kod: `regionStats`
sięga po nią przez mapę kluczowaną numerem rejonu, więc druga po cichu przesłoniłaby
pierwszą. Indeks liczy również konta **wyłączone** — para na chwilę odsunięta wciąż
zajmuje urząd — i tak samo liczy je sprawdzenie w aplikacji, żeby użytkownik dostał
zdanie po polsku zamiast surowego błędu bazy.

Formularz zakładania konta operuje więc pięcioma pozycjami, nie czterema rolami:
konto techniczne, para odpowiedzialna za wspólnotę, para odpowiedzialna za rejon,
pomocnik rejonu, moderator. Dwie środkowe to ta sama rola `region`.

### 1.16 Przywracanie usuniętej pary

Miękkie usuwanie od początku miało uzasadnienie „chroni przed pomyłką" (§1.5, a w
kodzie komentarz przy `deleteCouple`: *a region account can misclick*). Cofnięcia
jednak nie było — usunięta karta miała jedną drogę naprzód, trwałe skasowanie.
Dołożone 19.08.2026, gdy zapytałeś, czy da się przywrócić wiersz.

Przywrócenie nic nie odtwarza: miękkie usunięcie ustawiało wyłącznie znacznik czasu,
więc jego wyzerowanie oddaje rekord w całości, razem z formacją. Trafia do historii
jak każda inna zmiana, więc obie połowy pomyłki są widoczne obok siebie.

**Kto przywraca — zmiana reguły widoczności.** `canRestore` jest symetryczne
z `canDelete`: cofnięcie to ta sama władza, obrócona. Żeby para rejonowa mogła z niej
skorzystać, musi zobaczyć własny usunięty rekord, więc przełącznik „Usunięte" przestał
być wyłącznie admina — `listScope` wpuszcza teraz rolę `region`, **nadal zawężoną do
własnego rejonu**. Moderator nie widzi nic: nie usuwa i nie przywraca.

Bez tego osoba, która pomyliła się przy trzystu rekordach, musiałaby dzwonić do
admina — a to ona jest tu główną wprowadzającą dane.

Trwałe usunięcie zostaje wyłącznie przy adminie i bez zmian.

### 1.17 Błąd znaleziony przy okazji: konto rejonowe nie mogło zapisać pary

Test e2e do §1.16 odsłonił usterkę, która była w kodzie od Planu 3 i nie miała pokrycia:
**żadne konto rejonowe nie mogło utworzyć ani zapisać pary z karty.**

Wybór rejonu jest dla nich wyłączony (`canChangeRegion` = false), a wyłączona kontrolka
nie jest wysyłana z formularzem. Wartość rezerwowa w akcji nigdy nie działała, bo
`Number(null)` to `0`, a `0` przechodzi `Number.isFinite` — Zod dostawał więc rejon `0`
i odrzucał zapis komunikatem „Too small: expected number to be >=1".

Naprawione dwustronnie: brak wartości znaczy teraz brak (a nie zero), a karta niesie
rejon w ukrytym polu, więc formularz podaje własną wartość, zamiast liczyć na rezerwę.
Pokryte testem e2e, w którym konto rejonowe zakłada parę, usuwa ją i przywraca.

Warto zapamiętać: **jedenaście z piętnastu kont to konta rejonowe** i to one wprowadzają
dane. Każda ścieżka ma być sprawdzana także z ich uprawnieniami, nie tylko adminem.

### 1.18 Parafia: select z wyszukiwaniem, nie pole tekstowe

19.08.2026 zamieniłem select parafii na pole tekstowe z `<datalist>`, licząc na to,
że przeglądarka da filtrowanie za darmo. **Cofnięte następnego dnia**, bo pole tekstowe
nie umie powiedzieć jednej rzeczy, którą select mówi bez otwierania: **co jest wybrane**.

**262 z 300 par nie ma własnej parafii** — dziedziczą ją z kręgu, czyli `couple.parish_id`
jest `NULL`. Dla nich pole tekstowe rysowało się puste, z podpowiedzią „np. św. Brygidy,
Gdańsk", co czyta się jak „wpisz coś tutaj", a nie „bierze parafię z kręgu". Select miał
na to jawną pozycję „— jak w kręgu —" i dlatego był lepszy.

Zostaje więc select z pozycjami „— jak w kręgu —" i „+ nowa parafia…", a nad nim
**pole wyszukiwania**, które zawęża listę. Znaki diakrytyczne składane po obu stronach,
tak jak robi to wyszukiwarka listy przez `immutable_unaccent`, więc „gdansk" znajduje
„Gdańsk".

Jedna rzecz jest tu nieoczywista i ma własny test: **wybrana parafia zostaje na liście
niezależnie od wyszukiwania**. Gdyby filtr ją usunął, select pokazałby pierwszą pozycję,
a zapis przeniósłby parę do parafii, której nikt nie wskazał.

Pole to `<div>`, nie `<label>` — etykieta wiąże się z pierwszą kontrolką w środku,
a te są dwie, więc select zostałby bez nazwy. Każda kontrolka ma własny `aria-label`.

Wniosek na przyszłość: zanim uznam kontrolkę za zbędną, sprawdzam, **jaki stan pokazuje
w danych, które faktycznie są w bazie** — nie w tych, które mam w głowie.

## 2. Lista odbioru — wynik

Legenda: ✅ spełnione i pokryte testem · ☑️ spełnione, sprawdzone ręcznie ·
⛔ nieaktualne wskutek zmiany zakresu.

### Uprawnienia

| Punkt | Stan | Dowód |
|---|---|---|
| Para rejonowa widzi tylko swój rejon — także w eksporcie i API | ✅ | `permissions.test.ts`, `queries.int.test.ts`, `export.int.test.ts`, `list.spec.ts` |
| Para rejonowa nie zmieni rejonu pary (pole i walidacja serwera) | ✅ | `save.int.test.ts`, `card.spec.ts` |
| Moderator widzi całość, każdy zapis odmawiany (UI + API) | ✅ | `save.int.test.ts`, `card.spec.ts` |
| Liczba pozycji nawigacji | ✅ | `navigation.test.ts`, `list.spec.ts` — **5 / 1 / 2**, patrz §1.9 |
| Baner „Tylko podgląd" w karcie bez prawa edycji | ✅ | `card.spec.ts` |
| „Edytuj →" albo „Podgląd →" zależnie od uprawnień | ✅ | `list.spec.ts` |

### Lista i filtry

| Punkt | Stan | Dowód |
|---|---|---|
| Szukanie po nazwisku, imionach, e-mailu, telefonie, parafii i kręgu | ✅ | `queries.int.test.ts` |
| Rejon zawęża parafie, parafia zawęża kręgi | ✅ | `queries.int.test.ts`, `list.spec.ts` |
| Zmiana rejonu zeruje parafię i krąg | ✅ | `list.spec.ts` |
| 17 opcji formacji, każda z niepustym wynikiem na seedzie | ✅ | `filters.test.ts`, `list.spec.ts` |
| Licznik „N / M" z dopiskiem „(filtr)" | ✅ | `list.spec.ts` |
| Sortowanie 7 kolumn, dwukierunkowo, ze strzałką | ✅ | `list.spec.ts` |
| Stan filtrów i sortowania w URL | ✅ | `filters.test.ts`, `list.spec.ts` |
| Poniżej 860 px karty zamiast tabeli | ✅ | `list.spec.ts` |
| „Brak wyników dla podanych kryteriów." | ✅ | `list.spec.ts` |

### Karta pary

| Punkt | Stan | Dowód |
|---|---|---|
| Wszystkie pola modelu edytowalne (bez daty ślubu i roku wstąpienia) | ☑️ | pola nie zostały dodane |
| Nazwisko wymagane, „Podaj nazwisko" | ✅ | `schema.test.ts`, `card.spec.ts` |
| Formacja: dodawanie, usuwanie, licznik z odmianą | ✅ | `card.spec.ts` |
| „Nazwa rekolekcji" tylko dla „Inne", wtedy wymagana | ✅ | `schema.test.ts`, `card.spec.ts` |
| „+ Dodaj rekolekcje" podpowiada pierwszy brakujący stopień | ✅ | `retreats.test.ts`, `card.spec.ts` |
| Anulowanie porzuca zmiany | ✅ | `card.spec.ts` |
| Zapis, dodanie i usunięcie trafiają do historii z autorem i datą | ✅ | `save.int.test.ts` |
| Drawer: tło, ✕, `Esc`, powrót focusu | ✅ | `card.spec.ts` |

### Eksport i import

| Punkt | Stan | Dowód |
|---|---|---|
| Eksportuje aktualnie przefiltrowaną listę | ✅ | `export.int.test.ts`, `export-import.spec.ts` |
| CSV: separator, BOM, CRLF, cudzysłowy | ⛔ | zakres zawężony, patrz §1.2 |
| XLSX to prawdziwy plik XLSX | ✅ | `export.int.test.ts` — sygnatura `PK` |
| Komplet kolumn: 8 + 7 stopni + Inne + Dzieci + Notatki | ✅ | `columns.test.ts` — 19 kolumn |
| Eksport dopisuje wpis do historii | ✅ | `export-import.spec.ts` — pobranie, potem sprawdzenie wpisu |
| Import z podglądem przed zapisem (**poza handoffem**) | ✅ | `import.int.test.ts`, `export-import.spec.ts` |

### Rejony, konta, audyt

| Punkt | Stan | Dowód |
|---|---|---|
| 11 kafelków, kolor z palety, liczba par, para odpowiedzialna, „N kręgów · M parafii" | ✅ | `stats.int.test.ts`, `admin-views.spec.ts` |
| „Do obsadzenia" na nieobsadzonym rejonie | ✅ | `admin-views.spec.ts` |
| Klik w kafelek ustawia filtr rejonu | ✅ | `admin-views.spec.ts` |
| Konta: 11 rejonów + moderator, trzy statusy, akcje działają | ✅ | `accounts/list.int.test.ts`, `accounts/manage.int.test.ts`, `admin-views.spec.ts` |
| Wyłączone konto nie zaloguje się | ✅ | `session.int.test.ts`; akcja logowania odrzuca każdy status inny niż `active` jedną gałęzią, e2e sprawdza `pending` |
| „Ostatnie logowanie" chowa się poniżej 1120 px | ☑️ | `accounts.module.css` |
| Historia: 5 rodzajów z odrębnymi kolorami, paginacja | ✅ | `audit/list.int.test.ts`, `admin-views.spec.ts` |

### Wygląd

| Punkt | Stan | Dowód |
|---|---|---|
| Zgodność z „Design Tokens" | ✅ | `tokens.test.ts`; literał koloru w `.module.css` jest błędem review |
| Trzy rodziny fontów, self-hostowane | ✅ | `tokens.test.ts`, `layout.tsx` — `next/font`, zero żądań do Google |
| Aktywna pozycja: `--gold-500` na `--nav-active-bg` | ☑️ | `shell.module.css` |
| Plakietka i kafelek rejonu z 11-barwnej palety | ✅ | `regions.test.ts` |
| Plakietka formacji: najwyższy stopień + `+N`, przy braku `—` | ✅ | `formation.test.ts` |
| Animacje 220 / 150 / 2600 ms | ☑️ | `tokens.css`, `Toast.tsx` |
| Na mobile nic interaktywnego poniżej 44 px | ✅ | `accessibility.spec.ts` — mierzone, nie oglądane |

### Jakość

| Punkt | Stan | Dowód |
|---|---|---|
| Brak błędów w konsoli | ✅ | `accessibility.spec.ts` |
| Uprawnienia testowane na poziomie API, nie tylko UI | ✅ | cała warstwa `*.int.test.ts` woła funkcje domenowe wprost |
| Walidacja serwerowa wszystkich pól | ✅ | `schema.test.ts`, `save.int.test.ts` |
| `DECISIONS.md` | ✅ | ten dokument |

---

## 3. Czego jeszcze nie ma

- **Wdrożenie.** Docker Compose produkcyjny, TLS, kopie zapasowe i umowa powierzenia
  czekają na decyzję o hostingu. To osobny plan.
- **Treść klauzuli informacyjnej.** Rusztowanie stoi, luki są oznaczone.
- **Logowanie Google.** Patrz §1.4.

## 4. Weryfikacja

```
npm test          121 testów jednostkowych
npm run test:int  141 integracyjnych (wymagają bazy)
npm run e2e       61 testów Playwright, na buildzie produkcyjnym
npm run lint
npm run build
```
