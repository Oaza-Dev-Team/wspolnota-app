# Wdrożenie

Runbook produkcyjny Kartoteki DK. Stan na 19.08.2026.

## Czego jeszcze brakuje

Dwie rzeczy są decyzją zamawiającego i bez nich nie da się ruszyć:

1. **Dostawca VPS** — spec §12 wymaga serwera w Unii Europejskiej i umowy powierzenia
   przetwarzania danych. Kartoteka zawiera dane kategorii szczególnej (art. 9 RODO),
   więc to nie jest formalność.
2. **Domena** — musi wskazywać na serwer **zanim** wstanie proxy, inaczej Let's Encrypt
   odmówi wystawienia certyfikatu.

Wszystko poniżej jest od tych dwóch rzeczy niezależne i leży już w repozytorium.

## Co jest w repozytorium

| Plik | Rola |
|---|---|
| `Dockerfile` | obraz produkcyjny — etapy `deps`, `build`, `migrate`, `runner` |
| `docker-compose.prod.yml` | baza, migracje, aplikacja, proxy |
| `Caddyfile` | reverse proxy, automatyczny TLS, nagłówki bezpieczeństwa |
| `.env.production.example` | szablon konfiguracji — skopiuj do `.env` na serwerze |
| `scripts/create-admin.mts` | pierwsze konto administratora na pustej bazie |
| `scripts/backup.sh` | szyfrowany `pg_dump` z retencją 30 dni |
| `scripts/retention.mts` | czyszczenie audytu (24 mies.) i wygasłych sesji |

## Pierwsze uruchomienie

```bash
# na serwerze
git clone https://github.com/Oaza-Dev-Team/wspolnota-app.git /srv/kartoteka
cd /srv/kartoteka

cp .env.production.example .env
$EDITOR .env        # wypełnij POSTGRES_PASSWORD, APP_DOMAIN, APP_URL, BACKUP_PASSPHRASE

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

### Pierwsze konto

Baza produkcyjna startuje pusta — `npm run db:seed` jest **wyłącznie** do dewelopmentu
i wygenerowałby 300 fikcyjnych par. Pierwsze konto administratora zakłada osobny skrypt:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL="imie.nazwisko@example.pl" \
  -e ADMIN_NAME="Maria i Piotr Nowakowie" \
  -e ADMIN_PASSWORD="…" \
  migrate npm run create-admin
```

Skrypt odmawia, jeśli konto administratora już istnieje — jest do postawienia pustej
instalacji, a przypadkowy drugi admin to problem bezpieczeństwa. Hasło zmień po
pierwszym zalogowaniu.

Wszystkie pozostałe konta zakłada się już z interfejsu, przez jednorazowe linki
zaproszeń.

## Aktualizacja

```bash
cd /srv/kartoteka
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migracje zastosują się same. Stare obrazy: `docker image prune -f`.

## Zadania crona hosta

Oba świadomie **nie** są schedulerem wewnątrz aplikacji — patrz `DECISIONS.md` §1.7.

```cron
# kopia zapasowa, 03:15 UTC
15 3 * * *  cd /srv/kartoteka && ./scripts/backup.sh /var/backups/kartoteka >> /var/log/kartoteka-backup.log 2>&1

# retencja audytu i sesji, 03:45 UTC
45 3 * * *  cd /srv/kartoteka && docker compose -f docker-compose.prod.yml run --rm migrate npm run retention >> /var/log/kartoteka-retention.log 2>&1
```

`backup.sh` czyta `BACKUP_PASSPHRASE` z `.env` obok compose'a. **Kopię hasła trzymaj
poza tym serwerem** — kopia zapasowa, której nie da się odszyfrować, nie jest kopią
zapasową.

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
