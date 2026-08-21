# Wdrożenie

Runbook produkcyjny Kartoteki DK. Stan na 21.08.2026 — logowanie hasłem zastąpiła
rejestracja klucza dostępu (passkey); projekt w
`docs/superpowers/specs/2026-08-21-passkey-login-design.md`.

## Czego jeszcze brakuje

Dwie rzeczy są decyzją zamawiającego i bez nich nie da się ruszyć:

1. **Dostawca VPS** — spec §12 wymaga serwera w Unii Europejskiej i umowy powierzenia
   przetwarzania danych. Kartoteka zawiera dane kategorii szczególnej (art. 9 RODO),
   więc to nie jest formalność.
2. **Domena** — musi wskazywać na serwer **zanim** wstanie proxy, inaczej Let's Encrypt
   odmówi wystawienia certyfikatu. Od czasu przejścia na klucze dostępu domena
   nie jest już tylko sprawą TLS — patrz ostrzeżenie w sekcji „Domena, zanim
   cokolwiek innego" niżej. Musi być gotowa, zanim ktokolwiek zarejestruje klucz,
   nie tylko zanim wstanie proxy.

Wszystko poniżej jest od tych dwóch rzeczy niezależne i leży już w repozytorium.

## Co jest w repozytorium

| Plik | Rola |
|---|---|
| `Dockerfile` | obraz produkcyjny — etapy `deps`, `build`, `migrate`, `runner` |
| `docker-compose.prod.yml` | baza, migracje, aplikacja, proxy |
| `docker-compose.coolify.yml` | to samo bez proxy — patrz „Wdrożenie przez Coolify" |
| `Caddyfile` | reverse proxy, automatyczny TLS |
| `.env.production.example` | szablon konfiguracji — skopiuj do `.env` na serwerze |
| `scripts/create-superadmin.mts` | pierwsze konto — techniczne — na pustej bazie |
| `scripts/key-reset.mts` | jednorazowy link dla konta, które straciło wszystkie klucze |
| `scripts/backup.sh` | szyfrowany `pg_dump` z retencją 30 dni |
| `scripts/retention.mts` | czyszczenie audytu (24 mies.), wygasłych sesji, wygasłych wyzwań logowania kluczem i starych prób logowania (adresy IP) |

## Domena, zanim cokolwiek innego

**Klucz dostępu jest przywiązany do domeny nieodwracalnie.** RP ID (zakres, do
którego przeglądarka przywiązuje klucz) to `kartoteka.oazagdansk.pl`, wyprowadzony
w chwili rejestracji z `APP_URL` (`src/lib/auth/webauthn/config.ts`). Ten sam klucz
nie istnieje pod żadnym innym adresem — ani pod `oazagdansk.pl`, ani pod `localhost`,
ani pod kolejną poddomeną.

> **Zmiana domeny unieważnia wszystkie klucze dostępu** i oznacza rozesłanie kompletu
> nowych zaproszeń. Klucz jest przywiązany do `kartoteka.oazagdansk.pl` nieodwracalnie.

Konsekwencja praktyczna: pod hasłem kolejność nie miała znaczenia — DNS, `APP_URL`
i konto dało się ustawiać w dowolnej kolejności, byle wszystkie były gotowe przed
pójściem na produkcję. **Teraz kolejność jest częścią bezpieczeństwa wdrożenia.**
DNS i `APP_URL` muszą być ostatecznie ustalone, zanim ktokolwiek zarejestruje
pierwszy klucz — łącznie z kluczem konta technicznego w kroku poniżej. Zarejestrowanie
klucza pod tymczasowym albo błędnym adresem, a potem poprawienie `APP_URL`, zostawia
klucz działający pod adresem, którego już nie ma.

## Pierwsze uruchomienie

Kolejność poniżej wynika z ostrzeżenia wyżej — trzymaj się jej, nie tylko w duchu:

1. **DNS.** `kartoteka.oazagdansk.pl` → adres serwera. Zanim cokolwiek innego.
2. **`APP_URL`** w `.env` na serwerze, zgodny z tą samą domeną (`https://…`, bez
   ścieżki) — wypełniany razem z resztą `.env` w bloku poleceń niżej.
3. Wstawanie stosu: baza → migracje (`migrate deploy`) → aplikacja → proxy z TLS.
4. `npm run create-superadmin` — pierwsze konto techniczne, w stanie `pending`.
5. Otwarcie linku zaproszenia **na urządzeniu, z którego naprawdę będzie
   wykonywana praca** i rejestracja pierwszego klucza.
6. **Zaraz potem, w tym samym wejściu: drugi klucz, na telefonie.** Patrz
   „Rejestracja klucza i zasada dwóch kluczy" niżej — to krok, nie sugestia.
7. Logowanie, założenie z widoku „Konta" pary odpowiedzialnej za wspólnotę
   i jedenastu kont rejonowych, wygenerowanie linków zaproszeń.
8. **Pilotaż.** Najpierw dwa–trzy linki — do osób, o których sprzęcie wiadomo
   najmniej. Reszta dopiero po potwierdzeniu, że przechodzi.

```bash
# na serwerze
git clone https://github.com/Oaza-Dev-Team/wspolnota-app.git /srv/kartoteka
cd /srv/kartoteka

cp .env.production.example .env
$EDITOR .env        # wypełnij POSTGRES_PASSWORD, APP_DOMAIN, APP_URL, BACKUP_PASSPHRASE
                     # APP_URL musi się zgadzać z domeną z DNS-u (krok 1 wyżej) —
                     # to z niej wyprowadzany jest zakres każdego klucza dostępu
                     # APP_DOMAIN to ta sama domena bez protokołu: certyfikat
                     # wystawiony dla innego hosta niż ten z APP_URL oznacza
                     # klucze przywiązane do adresu, pod którym nikt nie wejdzie

docker compose -f docker-compose.prod.yml up -d --build
```

Kolejność wstawania jest wymuszona przez compose: baza → migracje → aplikacja → proxy.
Usługa `migrate` uruchamia `prisma migrate deploy` i kończy się. **Jeśli migracja padnie,
aplikacja nie wstanie** — serwer działający na schemacie, którego się nie spodziewa,
jest gorszy niż serwer wyłączony.

Sprawdzenie:

```bash
docker compose -f docker-compose.prod.yml ps
curl -sf https://TWOJA-DOMENA/health      # {"status":"ok"}
```

**Brak `APP_URL` albo wartość, która nie jest adresem, zatrzymuje aplikację przy
starcie** — sprawdza to `src/instrumentation.ts`, zanim kontener przyjmie pierwsze
żądanie. W logu widać wtedy nazwę zmiennej i wartość, która ją zepsuła, zamiast
„logowanie nie działa" kilka godzin później. Najczęstsza literówka to adres bez
protokołu (`kartoteka.oazagdansk.pl` zamiast `https://kartoteka.oazagdansk.pl`) —
jest odrzucana tak samo jak brak zmiennej.

```bash
docker compose -f docker-compose.prod.yml logs app   # gdy kontener nie wstaje
```

`/health` odpowiada „ok" na sam fakt, że serwer stoi — a stoi tylko wtedy, gdy
`APP_URL` przeszła kontrolę przy starcie. To nie zwalnia z ostrożności co do
**treści** tej zmiennej: adres poprawny składniowo, ale wskazujący inną domenę niż
ta z DNS-u, wstanie bez słowa i przywiąże klucze do domeny, której nie ma. Patrz
„Domena, zanim cokolwiek innego" wyżej.

### Pierwsze konto

Baza produkcyjna startuje pusta — `npm run db:seed` jest **wyłącznie** do dewelopmentu
i wygenerowałby 300 fikcyjnych par. Pierwsze konto to **konto techniczne** (rola
`superadmin`) i zakłada je osobny skrypt:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL="imie.nazwisko@example.pl" \
  -e ADMIN_NAME="Obsługa techniczna" \
  migrate npm run create-superadmin
```

Konto powstaje w stanie `pending`, bez hasła — nie ma go już nigdzie w aplikacji.
Skrypt wypisuje na konsolę jednorazowy link zaproszenia:

```
Utworzono konto techniczne: imie.nazwisko@example.pl
Otwórz link i utwórz klucz: https://kartoteka.oazagdansk.pl/invite/<token>
```

Skrypt odmawia, jeśli konto techniczne już istnieje — jest do postawienia pustej
instalacji, a przypadkowe drugie to problem bezpieczeństwa. **Ma to znaczenie
praktyczne przy linku:** gdyby wypisany adres wyglądał na błędny, nie da się po
prostu uruchomić skryptu ponownie — konto już jest i drugiego nie utworzy. Nowy
link dla tego samego konta wydaje `npm run key:reset` (patrz niżej).

Usługa `migrate`, w której to polecenie działa, dostaje `APP_URL` z tego samego
`.env` co aplikacja — dlatego w linku widnieje prawdziwa domena. Gdyby zamiast niej
pojawił się `localhost`, zmiennej w środowisku nie ma: skrypt mówi o tym wprost na
stderr, a naprawą jest uzupełnienie `.env` i `npm run key:reset` na tym koncie.

**Danych testowych na produkcji nie ma i nie będzie.** Usługa `migrate` wykonuje
wyłącznie `prisma migrate deploy`, czyli zakłada schemat — `prisma.config.ts` nie ma
wpisu `seed`, więc nie ma czego uruchomić. Obraz aplikacji (`runner`) zawiera tylko
`.next/standalone`, `.next/static` i `public`: nie ma w nim ani seeda, ani `tsx`,
ani CLI Prismy. Po wdrożeniu baza jest pusta poza schematem, a jedyne konto to to,
które zaraz utworzysz.

**Uwaga na kontener `migrate`.** Budowany jest z etapu `build`, więc *ma* w środku
`prisma/seed.ts` — a to ten sam kontener, w którym uruchamiasz polecenie powyżej.
`npm run db:seed` wpisane tam skasowałoby całą wspólnotę i zastąpiło ją trzystoma
zmyślonymi rodzinami oraz piętnastoma kontami bez klucza, czekającymi na zaproszenie.
Dlatego seed **odmawia bez `SEED_ALLOW_WIPE=1`**, a ta zmienna żyje w `.env`, które
`.dockerignore` trzyma poza każdym obrazem. Nie dodawaj jej na serwerze.

### Rejestracja klucza i zasada dwóch kluczy

Otwórz wypisany link **na urządzeniu, z którego naprawdę będziesz pracować** — to
ono trzyma pierwszy klucz. Strona sama sprawdza, czy przeglądarka obsługuje klucze
dostępu, i mówi wprost, gdy nie — nie pokazuje zepsutego przycisku.

**Zaraz potem, w tym samym wejściu, zarejestruj drugi klucz — na telefonie**, z tego
samego konta, pod `/account` → „Dodaj urządzenie". Nie potrzeba do tego osobnego
linku (ten, który już otworzyłeś, jest jednorazowy i zdążył się zużyć) — klikasz
„Dodaj urządzenie" w przeglądarce, w której już jesteś zalogowany po kroku wyżej,
wybierasz „użyj telefonu", a przeglądarka pokazuje kod QR. Telefon skanuje go
aparatem i potwierdza odciskiem palca albo Face ID; sam nie potrzebuje własnej sesji
ani otwartej przeglądarki na `/account`. To krok tej procedury, nie sugestia na
później: konto techniczne z dokładnie jednym kluczem jest jeden zgubiony telefon
(albo jeden zepsuty laptop) od sytuacji, w której jedyną drogą powrotu jest SSH na
serwer i `npm run key:reset` (patrz niżej) — zamiast zwykłego kliknięcia „Dodaj
urządzenie" z poziomu przeglądarki, na koncie, do którego wciąż jest się
zalogowanym z drugiego urządzenia. Dwa klucze na dwóch osobnych urządzeniach usuwają
ten pojedynczy punkt awarii.

**Osoba, której urządzenie w ogóle nie obsługuje kluczy** (stary telefon bez blokady
ekranu i stary komputer naraz — rzadkie, ale możliwe w przekroju wieku tej
wspólnoty): nie ma potrzeby ustalać tego z góry dla wszystkich jedenastu rejonów.
Strona zaproszenia rozstrzyga to per osoba, w momencie, w którym ma znaczenie, i
mówi, co zrobić (otworzyć link w telefonie, zaktualizować przeglądarkę, albo
skontaktować się z administratorem). Gdy żadne z tego nie pomoże, zapasowe
rozwiązanie jest sprzętowe, nie programowe: kluczyk USB klasy YubiKey (100–200 zł)
rejestruje się przez dokładnie ten sam formularz — dla WebAuthn to po prostu inny
rodzaj uwierzytelniacza. Nie ma potrzeby budować drugiego systemu logowania dla
pojedynczej osoby.

To konto **nie jest parą odpowiedzialną za wspólnotę**. Para odpowiedzialna ma rolę
`admin` i jest urzędem, który zmienia się co kilka lat; konto techniczne trwa ponad
tymi zmianami i istnieje po to, żeby ją powołać i żeby dało się wrócić do aplikacji,
gdy coś pójdzie źle. Dopiero po zarejestrowaniu obu kluczy: zaloguj się na nie i
z widoku **Konta** utwórz parę odpowiedzialną, a potem jedenaście kont rejonowych —
każde dostaje jednorazowy link zaproszenia, który przekazujesz sam. **Rozdaj najpierw
dwa–trzy linki**, do osób, o których sprzęcie wiadomo najmniej; resztę dopiero po
potwierdzeniu, że przechodzą.

**Załóż drugie konto techniczne** — tym razem nie skryptem, tylko tak samo jak
resztę: z widoku „Konta", rola „Konto techniczne" (`create-superadmin` odmówi, bo
jedno już istnieje — to jest do postawienia pustej instalacji, nie do zakładania
drugiego). Ostatniego aktywnego konta technicznego aplikacja nie pozwoli wyłączyć
(bo nikt nie miałby jak wrócić). Utrata wszystkich kluczy do jedynego takiego konta
nie jest już ślepym zaułkiem — `npm run key:reset` (patrz niżej) odzyskuje dostęp z
samego SSH, bez `psql`. Drugie konto techniczne wciąż warto założyć, ale z innego
powodu: rozkłada odpowiedzialność za instalację na dwie osoby zamiast jednej, zamiast
być jedyną drogą powrotu.

### Odzyskiwanie dostępu: `npm run key:reset`

Konto, które straciło wszystkie swoje klucze (zgubiony telefon i stary komputer
naraz, albo po prostu jedyne urządzenie, jakie miało), odzyskuje dostęp tak samo
jak przy pierwszym zaproszeniu:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  migrate npm run key:reset -- adres@example.pl
```

Skrypt wypisuje nowy jednorazowy link zaproszenia i **celowo nie kasuje istniejących
kluczy tego konta** — zwykłym powodem uruchomienia jest zgubiony telefon, a zgubiony
telefon i tak wymaga PIN-u albo odcisku palca właściciela, żeby był komukolwiek
przydatny. Kto chce odciąć dostęp natychmiast (telefon skradziony, nie zgubiony),
najpierw wyłącza konto z widoku „Konta" — to kończy jego sesje od razu. Uruchamia to
ten, kto ma dostęp SSH do serwera, czyli i tak może wszystko; dodatkowego
uprawnienia skrypt nie sprawdza.

To ten sam mechanizm co `create-superadmin`, użyty do innej rzeczy: pierwsze
uruchomienie instalacji i późniejsze ratowanie kogoś, kto stracił wszystkie klucze,
to jeden i ten sam skrypt w dwóch zastosowaniach.

## Aktualizacja

```bash
cd /srv/kartoteka
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migracje zastosują się same. Stare obrazy: `docker image prune -f`.

## Wdrożenie przez Coolify

Produkcja stoi na Coolify. Wszystko powyżej opisuje ścieżkę samodzielną — zostaje
ważne jako droga odwrotu na dowolnego hosta z Dockerem — ale różni się w czterech
miejscach.

**Plik compose to `docker-compose.coolify.yml`**, czyli `prod` bez usługi `proxy`.
TLS kończy Traefik należący do Coolify, a domenę przypisujesz usłudze `app`
w panelu, w formacie `https://kartoteka.example.pl:3000`. Port po dwukropku to
adresowanie wewnętrzne — nie publikuje niczego.

**Nagłówki bezpieczeństwa nie są już w `Caddyfile`.** Przeniosły się do
`next.config.ts`, bo należą do aplikacji, a nie do wymiennej warstwy wejściowej.
Pilnuje ich `e2e/security-headers.spec.ts`, uruchamiany przeciwko produkcyjnemu
buildowi.

**Zmienne środowiskowe ustawiasz w panelu**, nie w pliku `.env`. Coolify zapisuje
je do `.env` w katalogu aplikacji — także te, do których plik compose się nie
odwołuje, jak `BACKUP_PASSPHRASE`. `APP_DOMAIN` przestaje być potrzebna; istniała
wyłącznie po to, żeby Caddy wiedział, dla jakiej domeny wystawić certyfikat. `APP_URL`
zostaje i musi się zgadzać co do joty z domeną, którą przypisujesz usłudze `app` w
panelu — z niej wyprowadzany jest zakres każdego klucza dostępu (patrz „Domena,
zanim cokolwiek innego" na początku tego dokumentu). Ustaw ją przed pierwszym
uruchomieniem `create-superadmin`, nie po.

**Repozytorium nie istnieje na serwerze.** Coolify klonuje kod do katalogu
tymczasowego, buduje obrazy i zostawia pod
`/data/coolify/applications/<UUID>/` wyłącznie `.env` i wynikowy
`docker-compose.yaml`. Skrypty z `scripts/` trzeba wgrać na host osobno; te, które
mają działać wewnątrz kontenera, uruchamiasz przez `docker compose run --rm migrate`,
bo są wbudowane w obraz.

Konto techniczne zakładasz tak samo, tylko z katalogu aplikacji Coolify i przez
wygenerowany plik compose:

```bash
cd /data/coolify/applications/<UUID>
docker compose run --rm \
  -e ADMIN_EMAIL -e ADMIN_NAME \
  migrate npm run create-superadmin
```

Dalej identycznie jak w ścieżce samodzielnej: otwórz wypisany link, zarejestruj
klucz, zaraz potem drugi na telefonie — patrz „Rejestracja klucza i zasada dwóch
kluczy" wyżej. `npm run key:reset` uruchamia się stąd tak samo, przez
`docker compose run --rm migrate npm run key:reset -- adres@example.pl`.

## Zadania crona hosta

Oba świadomie **nie** są schedulerem wewnątrz aplikacji — patrz `DECISIONS.md` §1.7.
Oba działają na hoście, nie w Scheduled Tasks Coolify: backup potrzebuje `gpg`,
którego nie ma w obrazie `postgres`, a retencja potrzebuje obrazu `migrate`, który
nie działa w tle.

```cron
# kopia zapasowa, 03:15 UTC
15 3 * * *  cd /srv/kartoteka && ./scripts/backup.sh /var/backups/kartoteka >> /var/log/kartoteka-backup.log 2>&1

# retencja audytu, sesji, wyzwań i prób logowania, 03:45 UTC
45 3 * * *  cd /srv/kartoteka && docker compose -f docker-compose.prod.yml run --rm migrate npm run retention >> /var/log/kartoteka-retention.log 2>&1
```

Na Coolify te same dwa zadania, ze ścieżką katalogu aplikacji i wygenerowanym plikiem
compose. `backup.sh` wgrywasz na host osobno, bo w tym katalogu nie ma repozytorium:

```cron
KARTOTEKA=/data/coolify/applications/<UUID>

# kopia zapasowa, 03:15 UTC
15 3 * * * root cd $KARTOTEKA && COMPOSE_FILE=docker-compose.yaml /usr/local/bin/kartoteka-backup /var/backups/kartoteka >> /var/log/kartoteka-backup.log 2>&1

# retencja audytu, sesji, wyzwań i prób logowania, 03:45 UTC
45 3 * * * root cd $KARTOTEKA && docker compose run --rm migrate npm run retention >> /var/log/kartoteka-retention.log 2>&1
```

`backup.sh` czyta `BACKUP_PASSPHRASE` z `.env` obok compose'a — **wczytuje ten plik
zanim sprawdzi, czy hasło jest ustawione**, i ta kolejność jest celowa. Odwrotna
sprawiała, że powyższy wpis crona, który świadomie nie eksportuje hasła, odmawiał
każdej nocy do pliku logu, którego nikt nie czyta.

**Kopię hasła trzymaj poza tym serwerem** — kopia zapasowa, której nie da się
odszyfrować, nie jest kopią zapasową.

## Odtworzenie z kopii

```bash
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" \
    /var/backups/kartoteka/kartoteka-2026-08-19T031500Z.sql.gz.gpg \
  | gunzip \
  | docker compose -f docker-compose.prod.yml exec -T db psql -U kartoteka -d kartoteka
```

**Sprawdź odtwarzanie zanim będzie potrzebne.** Kopia, której nikt nigdy nie odtworzył,
to hipoteza, nie zabezpieczenie.

## Co jest wystawione na świat

Tylko porty 80 i 443 proxy. Baza nie publikuje portu — jest osiągalna wyłącznie
z sieci compose'a, więc błąd w konfiguracji firewalla jej nie odsłoni.

`/health` odpowiada bez sesji, bo pyta o nią orkiestrator, nie człowiek. Mówi
wyłącznie „działa" albo „nie działa" — żadnej wersji, żadnych liczników, żadnej
treści błędu.

## Czego tu nie ma

- **SMTP.** Zaproszenia to jednorazowe linki, które administrator przekazuje sam
  (`DECISIONS.md` §1.3). Nie ma serwera poczty do skonfigurowania.
- **`SESSION_SECRET`.** Był w szablonie `.env`, ale aplikacja go nie używa: tokeny
  sesji to 32 losowe bajty, w bazie leży wyłącznie ich skrót SHA-256. Nie ma czego
  podpisywać, więc zmienna zniknęła zamiast udawać, że coś robi.
- **Monitoring i alerty.** Healthcheck restartuje kontener; nikt nie dostaje
  powiadomienia. Do ustalenia razem z hostingiem.
