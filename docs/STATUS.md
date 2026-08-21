# Stan projektu — 21.08.2026

Dokument do wznowienia pracy po przerwie. Aktualizuj przy każdym zatrzymaniu.

## Gdzie jesteśmy

Kartoteka Domowego Kościoła — aplikacja webowa dla wspólnoty Ruchu Światło-Życie
(archidiecezja gdańska). **11 rejonów**, ~300 par, ~15 kont edytujących, 4 role.

Budowane z handoffu projektowego w `docs/handoff/` (README = wygląd, IMPLEMENTATION =
lista odbioru). Projekt techniczny: `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md`.
Odstępstwa i wynik odbioru: `DECISIONS.md` w katalogu głównym.

## Gałąź i commity

**Plany 1–7 są scalone do `main`.** Logowanie kluczem dostępu (passkey) to osobny
plan, wykonany na gałęzi **`feat/passkey-login`** — 15 zadań, wszystkie skończone,
jeszcze nie scalone do `main` (szybkie przewinięcie: `main` nie ma niczego, czego
brakowałoby tej gałęzi). Projekt: `docs/superpowers/specs/2026-08-21-passkey-login-design.md`;
plan wykonawczy: `docs/superpowers/plans/2026-08-21-passkey-login.md`.

`main` jest **wiele commitów przed `origin/main`** — nic nie wypchnięte na GitHuba
(`github.com/Oaza-Dev-Team/wspolnota-app`). To świadoma decyzja, czeka na Twoją zgodę.
Scalenie `feat/passkey-login` do `main` to osobna decyzja, czeka tak samo.

## Postęp planów

| Plan | Zakres | Stan |
|---|---|---|
| 1 | fundament, uwierzytelnianie, uprawnienia, seed | ✅ scalony do `main` |
| 2 | powłoka, lista par, filtry | ✅ scalony do `main` |
| — | refactor na angielski + squash migracji | ✅ scalony do `main` |
| 3 | karta pary i formacja | ✅ scalony do `main` |
| 4 | eksport i import XLSX | ✅ scalony do `main` |
| 5 | rejony, konta rejonów, historia zmian | ✅ scalony do `main` |
| 6 | RODO, dostępność, lista odbioru | ✅ scalony do `main` |
| 7 | wdrożenie: obraz, compose, TLS, kopie zapasowe | ✅ scalony do `main` |
| passkey | zamiana logowania hasłem na klucz dostępu (WebAuthn) | ✅ skończony na `feat/passkey-login`, czeka na scalenie |

**Wszystkie zaplanowane prace są skończone.** Do postawienia produkcji brakuje już
tylko dwóch Twoich decyzji: dostawcy VPS i domeny — patrz `docs/DEPLOYMENT.md`. Scalenie
gałęzi `feat/passkey-login` jest trzecią, oddzielną decyzją.

### Co działa

- **logowanie kluczem dostępu (passkey)** — hasła nie ma już nigdzie w aplikacji;
  projekt w `docs/superpowers/specs/2026-08-21-passkey-login-design.md`. Sesje
  w bazie, limit prób kluczowany po adresie IP, trzy role
- lista par z filtrami, wyszukiwaniem bez znaków diakrytycznych, paginacją i kartami
  poniżej 860 px
- karta pary w `<dialog>`: edycja danych, sekcja formacji, usunięcie miękkie
  **z przywracaniem**, audyt
  w tej samej transakcji; parafia to **combobox** (`ParishCombobox.tsx`, wariant 1A
  z `docs/handoff/PARISH_COMBOBOX.md`) nad ukrytym `parishId` — kontrakt zapisu
  niezmieniony; `DECISIONS.md` §1.18
- eksport XLSX aktualnie przefiltrowanej listy + wpis do rejestru wydań;
  nazwa pliku niesie rejon, gdy plik zawiera dokładnie jeden
  (`kartoteka-rejon-VII-2026-08-20.xlsx`)
- import XLSX z podglądem przed zapisem i szablonem do pobrania
- kafelki rejonów ze statystykami, konta (utwórz / usuń / włącz / wyłącz / zaproś /
  nowy klucz / zmień nazwę / popraw adres / przekaż rejon), historia zmian z paginacją
- rejon może mieć **parę odpowiedzialną i pomocników** — uprawnienia takie same,
  różnią się tylko kafelkiem rejonu i tym, czyje konto da się przekazać
- **strona rejestracji klucza dostępu pod jednorazowym linkiem zaproszenia** —
  bez pól na hasło; jeden przycisk „Utwórz klucz", ceremonia WebAuthn
  (`@simplewebauthn/browser` + `@simplewebauthn/server`), logowanie od razu po
  rejestracji
- **zarządzanie kluczami pod `/account`** — wejście z karty konta w stopce panelu
  bocznego, dostępne każdej roli: lista kluczy (nazwa, data dodania, ostatnie
  użycie), zmiana nazwy, usunięcie (ostatniego klucza nie da się usunąć — sprawdzane
  na serwerze), „Dodaj urządzenie"; usunięcie klucza nie kończy bieżącej sesji
- **„Nowy klucz…" cudzego konta** na `/accounts` zamiast dawnego resetu hasła: ten
  sam jednorazowy link co zaproszenie. Dotychczasowe klucze działają do chwili
  użycia linku — żeby zabrać dostęp od razu, najpierw „Wyłącz". **Uwaga:**
  zarejestrowanie klucza z takiego linku przełącza konto z powrotem na `active`,
  nawet jeśli było `disabled` — to samo zachowanie, co miały zaproszenia od zawsze,
  ale „Wyłącz" i „Nowy klucz…" stoją teraz obok siebie w interfejsie, więc łatwiej
  o nie potknąć się niż wcześniej
- trwałe usunięcie na żądanie RODO z anonimizacją audytu, przełącznik „Usunięte"
  dla admina, retencja audytu i sesji jako `npm run retention`
- klauzula informacyjna pod `/privacy` — rusztowanie z jawnymi lukami
- `DECISIONS.md` — odstępstwa od handoffu i wynik listy odbioru punkt po punkcie
- obraz produkcyjny, `docker-compose.prod.yml` z Caddy i automatycznym TLS,
  szyfrowane kopie zapasowe, runbook w `docs/DEPLOYMENT.md` — obraz zbudowany
  i sprawdzony na żywej bazie

## Jak wznowić

```bash
cd C:\PrvDevelopment\wspolnota-app
docker compose up -d          # Postgres na porcie 5433
npm run dev                   # http://localhost:3000
```

Baza jest zaseedowana (300 par, 11 rejonów, 15 kont). Jeśli po restarcie okaże się
pusta albo rozjechana: `npm run db:seed`.

**Żadne konto nie ma jeszcze klucza.** Hasła nie ma w aplikacji w ogóle, a klucza
nie da się zaseedować — musi go podpisać prawdziwy uwierzytelniacz. Każde konto
seed zostawia więc w stanie `pending`, z jednorazowym zaproszeniem, i wypisuje
komplet linków na konsolę:

```
Konta czekają na klucz. Otwórz link i utwórz klucz w DevTools →
More tools → WebAuthn → Enable virtual authenticator environment.

  admin@example.pl             http://localhost:3000/invite/<token>
  moderator@example.pl         http://localhost:3000/invite/<token>
  …
```

Żeby się zalogować: w DevTools Chrome włącz wirtualny uwierzytelniacz (**More tools
→ WebAuthn → Enable virtual authenticator environment**), otwórz jeden z wypisanych
linków i kliknij „Utwórz klucz" — kilka kliknięć, nie ceremonia z telefonem. Konto
loguje się od razu po rejestracji.

| E-mail | Rola |
|---|---|
| `admin@example.pl` | para odpowiedzialna za wspólnotę |
| `moderator@example.pl` | moderator, tylko podgląd |
| `rejon1@example.pl` … `rejon10@example.pl` | pary rejonowe |
| `rejon11@example.pl` | nazwa „Do obsadzenia" — rejon celowo bez pary, dla kafelka „Do obsadzenia" |
| `superadmin@example.pl` | konto techniczne — jedyne, którego admin nie tknie |
| `rejon1.pomoc@example.pl` | pomocnik rejonu I — kilka kont na jeden rejon |

## Weryfikacja

```bash
npm test          # 148 testów jednostkowych
npm run test:int  # 229 integracyjnych (wymagają bazy)
npm run lint
npm run build
npm run e2e       # 92 testy Playwright, na buildzie produkcyjnym
npm run retention # czyszczenie audytu, sesji i wygasłych wyzwań logowania kluczem — na produkcji z crona hosta
```

## Decyzje, do których nie wracamy

- **Stos:** Next.js 16 App Router + PostgreSQL + Prisma. Bez MUI, bez Tailwinda —
  projekt jest autorski i podany co do piksela, więc CSS Modules + tokeny.
- **Sesje w bazie, nie JWT.** Lista odbioru wymaga, żeby wyłączenie konta działało
  natychmiast; JWT dawałby dostęp do wygaśnięcia tokena.
- **Bez Auth.js** — v5 od lat w becie, a przy danych art. 9 RODO to zła podstawa.
- **Rejon może mieć kilka kont.** Para odpowiedzialna (`region_lead`) plus dowolna
  liczba pomocników. Uprawnienia identyczne; różnica jest w kafelku rejonu i w tym,
  czyje konto da się przekazać. Jedną parę odpowiedzialną na rejon pilnuje częściowy
  indeks unikalny, nie tylko kod. Rachunek w `DECISIONS.md` §1.15.
- **Usuniętą parę da się przywrócić** i robi to ten, kto mógł ją usunąć —
  para rejonowa widzi przełącznik „Usunięte” zawężony do własnego rejonu.
  Trwałe usunięcie (RODO) zostaje przy adminie. `DECISIONS.md` §1.16.
- **Konta da się usuwać.** Wpisy historii zostają jako „konto usunięte” —
  `audit.account_id` ma `ON DELETE SET NULL` od pierwszej migracji. §1.14.
- **Cztery role, nie trzy.** `superadmin` to konto techniczne opiekuna instalacji:
  ma wszystko, co `admin`, a dodatkowo zarządza kontami technicznymi. Jedyna granica:
  admin nie tknie konta technicznego, bo zmiana adresu albo zaproszenie to w praktyce
  przejęcie konta. Rachunek w `DECISIONS.md` §1.12.
- **11 rejonów, nie 12.** Handoff mówił 12; teksty poprawione, zrzuty ekranu i prototyp
  nadal pokazują 12 i zostają jako materiał historyczny.
- **Nazewnictwo:** po polsku wyłącznie to, co czyta człowiek — interfejs, formy odmiany,
  kody rekolekcji. Reszta po angielsku, łącznie ze schematem bazy i całymi URL-ami.
- **Ścieżki tras po angielsku** — 19.08.2026 odwróciliśmy wcześniejszą decyzję o polskich
  ścieżkach. Nikt tych adresów nie czyta ani nie wpisuje (nawigacja przez klikanie,
  jedyny wysyłany link to zaproszenie z tokenem), a polski kosztował przy każdej trasie:
  odmiana, ryzyko znaków diakrytycznych, dwie nazwy na jedno pojęcie. Rachunek w
  `DECISIONS.md` §1.10. **Plany wykonawcze pokazują stare ścieżki i tak zostaje.**
- **Import tylko XLSX.** CSV wypadł z zakresu 19.08.2026 na Twoją prośbę. Punkty
  listy odbioru mówiące o CSV są nieaktualne.
- **Zaproszenia bez SMTP.** „Zaproś" generuje jednorazowy link ważny 7 dni, który
  administrator kopiuje i przekazuje sam. Poczta nie jest w tym projekcie skonfigurowana,
  a przy piętnastu kontach zakładanych raz serwer poczty kosztowałby więcej, niż daje.
  Odwracalne: gdy SMTP się pojawi, wysyłka to jedno wywołanie w tej samej akcji.
- **Logowanie Google — rozstrzygnięte odmownie, i bezprzedmiotowo.** Spec §6.1
  wyznaczał Plan 5 jako moment decyzji; rozstrzygnęło ją przejście na klucze dostępu
  (21.08.2026, `docs/superpowers/specs/2026-08-21-passkey-login-design.md` §1.1).
  Passkey nie potrzebuje konta u żadnego dostawcy zewnętrznego, więc pytanie „czy te
  piętnaście osób ma konta Google" przestało mieć znaczenie. `DECISIONS.md` §1.4.

## Pułapki tego środowiska

- **Port bazy to 5433**, nie 5432 — 5432 zajmuje `docfields_postgres` z innego projektu.
- **Seed odmawia bez `SEED_ALLOW_WIPE=1` w `.env`.** Kasuje wszystkie tabele, a leży
  w obrazie `migrate` — tym samym, w którym zakłada się pierwsze konto na serwerze.
  `.dockerignore` trzyma `.env` poza obrazami, więc na produkcji nie ma jak go odpalić.
- **Prisma 7 wymaga sterownika** — `new PrismaClient()` bez `adapter` nie kompiluje się.
- **`prisma generate` po każdej zmianie schematu** — `migrate` tego nie robi.
- **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Sprawdź
  `prisma migrate status` zanim uznasz, że padła; wiszący proces trzyma blokadę advisory.
- **`tsx` nie ładuje `.env`** — skrypty zaczynają się od `import 'dotenv/config'`.
- **Kolumny `search_text` są `GENERATED ALWAYS`** — nigdy nie wymieniaj ich w `data`.
- **E2E tylko na buildzie produkcyjnym** — na `next dev` kompilacja tras na żądanie
  daje losowo padające testy. Uruchamiaj `npm run e2e`, nie `npx playwright test`:
  ten skrypt seeduje bazę i dopiero potem odpala Playwright, którego
  `webServer` sam startuje `e2e/support/testServer.ts` (bramkowany
  `E2E_SUPPORT=1` — nigdy nie ustawiaj tego gdzie indziej). `e2e/prepare.ts` zniknął
  wraz z hasłem: czyścił nieudane próby logowania hasłem, a limiter jest teraz
  kluczowany po adresie IP, nie po koncie — czyści go ten sam support server przy
  starcie.
- **Po `npm run e2e` przeseeduj bazę, zanim puścisz `npm run test:int`.** Suite e2e
  zaczyna od seeda, ale **kończy z bazą zmienioną** — przekazanie rejonu zostawia konto
  w stanie `pending`, testy karty zostawiają parafię i krąg. Testy integracyjne zakładają
  stan seeda i wtedy padają na czymś, co nie jest regresją.
- **`getByLabel` w Playwrighcie dopasowuje podciąg bez uwzględniania wielkości liter,**
  także w `<option>`. `getByLabel('Rejon')` trafiał w opcję „Para rejonowa”, a
  `getByText('admin@example.pl')` trafia też w `superadmin@example.pl`. Do selectów
  dawaj jawny `aria-label` (`exact: true` nie pomoże — nazwa z otaczającej etykiety
  obejmuje treść opcji), a do adresów `{ exact: true }`.
- **Sprawdzaj ścieżki także kontem rejonowym, nie tylko adminem.** Przez cały
  Plan 3 konto rejonowe nie mogło zapisać pary — wyłączony `<select>` rejonu nie
  jest wysyłany, a `Number(null)` to `0`, więc wartość rezerwowa nie działała.
  Nie miało to pokrycia, bo wszystkie testy karty logowały się jako admin. §1.17.
- **Testy integracyjne muszą zawężać zapytania do własnych danych.** Dwa razy złapaliśmy
  test, który liczył wiersze cudzej roboty albo kasował je przy sprzątaniu.
- **`npm audit` zgłasza 3 podatności high** (`deepmerge-ts` przez `prisma` → devDependency).
  **Nie naprawiaj** — `audit fix --force` cofa do Prismy 6.

## Otwarte pytania do Ciebie

1. **Push na GitHuba** — cała praca czeka lokalnie. Repozytorium jest w organizacji,
   więc push je upublicznia jej członkom.
2. **Próbka rzeczywistych danych** — układ arkusza jest ustalony (szablon do pobrania
   pod `/export/template`), ale warto go skonfrontować z Twoim prawdziwym plikiem,
   zanim zrobimy import produkcyjny.
3. **Hosting** — ustalone „VPS w UE + Docker", ale bez konkretów. Blokuje wdrożenie
   i uzupełnienie klauzuli informacyjnej, która musi wskazać administratora danych.
4. **Treść klauzuli informacyjnej** — strona stoi, luki są oznaczone: administrator
   danych, podstawa prawna, dostawca hostingu, okres przechowywania po odejściu.
5. **Co dalej?** Cała infrastruktura wdrożeniowa leży w repozytorium i została
   sprawdzona lokalnie. Brakuje wyłącznie dostawcy VPS (z umową powierzenia)
   i domeny wskazującej na serwer. **Uwaga:** domena musi być ostateczna, zanim
   ktokolwiek zarejestruje pierwszy klucz dostępu — zmiana potem unieważnia
   wszystkie klucze. Patrz `docs/DEPLOYMENT.md`.
