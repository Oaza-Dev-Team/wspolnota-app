# Stan projektu — 19.08.2026

Dokument do wznowienia pracy po przerwie. Aktualizuj przy każdym zatrzymaniu.

## Gdzie jesteśmy

Kartoteka Domowego Kościoła — aplikacja webowa dla wspólnoty Ruchu Światło-Życie
(archidiecezja gdańska). **11 rejonów**, ~300 par, ~15 kont edytujących, 4 role.

Budowane z handoffu projektowego w `docs/handoff/` (README = wygląd, IMPLEMENTATION =
lista odbioru). Projekt techniczny: `docs/superpowers/specs/2026-08-18-kartoteka-dk-design.md`.
Odstępstwa i wynik odbioru: `DECISIONS.md` w katalogu głównym.

## Gałąź i commity

**Aktualna gałąź: `main`** — drzewo czyste, plany 1–7 scalone.

`main` jest **wiele commitów przed `origin/main`** — nic nie wypchnięte na GitHuba
(`github.com/Oaza-Dev-Team/wspolnota-app`). To świadoma decyzja, czeka na Twoją zgodę.

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

**Wszystkie zaplanowane prace są skończone.** Do postawienia produkcji brakuje już
tylko dwóch Twoich decyzji: dostawcy VPS i domeny — patrz `docs/DEPLOYMENT.md`.

### Co działa

- logowanie hasłem, sesje w bazie, limit prób, trzy role
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
  zmień nazwę / popraw adres / przekaż rejon), historia zmian z paginacją
- rejon może mieć **parę odpowiedzialną i pomocników** — uprawnienia takie same,
  różnią się tylko kafelkiem rejonu i tym, czyje konto da się przekazać
- strona ustawienia hasła z jednorazowego linku zaproszenia
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

Konta testowe, wszystkie z hasłem `kartoteka123`:

| E-mail | Rola |
|---|---|
| `admin@example.pl` | para odpowiedzialna za wspólnotę |
| `moderator@example.pl` | moderator, tylko podgląd |
| `rejon1@example.pl` … `rejon10@example.pl` | pary rejonowe |
| `rejon11@example.pl` | status `pending`, **nie zaloguje się** (to jest testowane) |
| `superadmin@example.pl` | konto techniczne — jedyne, którego admin nie tknie |
| `rejon1.pomoc@example.pl` | pomocnik rejonu I — kilka kont na jeden rejon |

## Weryfikacja

```bash
npm test          # 141 testów jednostkowych
npm run test:int  # 198 integracyjnych (wymagają bazy)
npm run lint
npm run build
npm run e2e       # 86 testów Playwright, na buildzie produkcyjnym
npm run retention # czyszczenie audytu i sesji — na produkcji z crona hosta
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
- **Logowanie Google — nadal odłożone.** Spec §6.1 wyznaczał Plan 5 jako moment decyzji,
  ale wariant z linkiem zaproszenia działa tak samo przy haśle i przy Google, więc
  odłożenie nic nie kosztuje. **Potrzebna Twoja wiedza:** czy te piętnaście osób ma
  konta Google?

## Pułapki tego środowiska

- **Port bazy to 5433**, nie 5432 — 5432 zajmuje `docfields_postgres` z innego projektu.
- **Prisma 7 wymaga sterownika** — `new PrismaClient()` bez `adapter` nie kompiluje się.
- **`prisma generate` po każdej zmianie schematu** — `migrate` tego nie robi.
- **`prisma migrate dev` potrafi zawisnąć po zastosowaniu migracji.** Sprawdź
  `prisma migrate status` zanim uznasz, że padła; wiszący proces trzyma blokadę advisory.
- **`tsx` nie ładuje `.env`** — skrypty zaczynają się od `import 'dotenv/config'`.
- **Kolumny `search_text` są `GENERATED ALWAYS`** — nigdy nie wymieniaj ich w `data`.
- **E2E tylko na buildzie produkcyjnym** — na `next dev` kompilacja tras na żądanie
  daje losowo padające testy. Uruchamiaj `npm run e2e`, nie `npx playwright test`:
  bez `e2e/prepare.ts` limiter prób logowania zablokuje konto testowe.
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
4. **Logowanie Google** — patrz wyżej.
5. **Treść klauzuli informacyjnej** — strona stoi, luki są oznaczone: administrator
   danych, podstawa prawna, dostawca hostingu, okres przechowywania po odejściu.
6. **Co dalej?** Cała infrastruktura wdrożeniowa leży w repozytorium i została
   sprawdzona lokalnie. Brakuje wyłącznie dostawcy VPS (z umową powierzenia)
   i domeny wskazującej na serwer.
