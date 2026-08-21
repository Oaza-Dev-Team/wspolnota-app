# Logowanie kluczem dostępu (passkey) — projekt techniczny

**Data:** 2026-08-21
**Status:** do zatwierdzenia
**Zastępuje:** `2026-08-18-kartoteka-dk-design.md` §6 i §6.1
**Skutek dla:** `DECISIONS.md` §1.4 (rozstrzygnięte inaczej, niż zakładał spec)

Dokument opisuje zamianę logowania hasłem na logowanie kluczem dostępu. Hasło
znika z aplikacji całkowicie — nie jako droga zapasowa, nie jako pierwszy etap.

---

## 1. Dlaczego, i dlaczego nie hasło z drugim składnikiem

Wyjściowe pytanie brzmiało „czy samo hasło wystarcza". Odpowiedź wynika z trzech
faktów ustalonych z zamawiającym, a nie z ogólnych zaleceń:

1. **We wspólnocie zdarzały się wycieki haseł do skrzynek pocztowych.** Pojedyncze
   przypadki, ale realne. Zagrożeniem nie jest siła pojedynczego hasła, tylko nawyk:
   ta sama osoba ustawi tutaj hasło podobne albo to samo.
2. **Przekrój użytkowników sięga od osób młodych po emerytalne**, o bardzo różnej
   higienie haseł.
3. **System nie działa jeszcze produkcyjnie.** Istnieje jedno konto — techniczne,
   należące do wykonawcy. Nie ma nikogo do przeprowadzania przez zmianę.

Rozważono trzy kształty i dwa odrzucono:

**Hasło albo passkey — dwie równoległe drogi.** To, co robi Google i większość
serwisów. Odrzucone: konto jest tak mocne, jak jego najsłabsza włączona metoda,
więc napastnik z wyciekłym hasłem po prostu wybiera łatwiejszą drogę. Przy
punkcie 1 oznaczałoby to zbudowanie kluczy i pozostawienie obok nich otwartych
drzwi.

**Hasło oraz passkey — oba wymagane.** Bezpieczne, ale nieuzasadnione.
Passkey z wymuszoną weryfikacją użytkownika **już jest dwuskładnikowy**: coś, co
masz (klucz prywatny w konkretnym urządzeniu) plus coś, co wiesz lub czym jesteś
(PIN albo biometria odblokowujące ten klucz). Serwer to weryfikuje flagą `UV`
w odpowiedzi uwierzytelniacza. Hasło dołożone na wierzchu broni wyłącznie przed
kimś, kto ma odblokowane urządzenie ofiary i zna do niego PIN — czyli domownikiem,
który i tak znalazłby hasło zapisane na kartce. Kosztuje za to codzienne tarcie,
utrzymanie przy życiu przepływu resetu hasła i powrót nawyku z punktu 1.

**Samo passkey — wybrane.** Usuwa przyczynę, nie objaw: nie ma czego wyciec,
powtórzyć ani zapisać na kartce. Po stronie serwera nie zostaje baza haseł do
wyniesienia, tylko klucze publiczne, bezużyteczne dla kogoś, kto zrzuci bazę.
Jest też najłatwiejsze w codziennym użyciu, co przy sesji 7-dniowej (§5.4) ma
wagę większą niż zwykle.

**Warunek, przy którym decyzja byłaby błędna:** urządzenia współdzielone —
wspólny komputer w kancelarii, z którego korzysta kilka osób. Wtedy „coś, co masz"
przestaje być osobiste. Ustalono, że tak nie jest; gdyby się to zmieniło, wraca
wariant z hasłem wymaganym obok klucza.

**Formalnie:** RODO art. 32 wymaga środków proporcjonalnych do ryzyka, nie hasła.
Passkey z wymuszonym `UV` jest powyżej tego, co uchodzi dziś za standard dla danych
z art. 9 — mocniejszy niż hasło z SMS-em i niż hasło z TOTP.

### 1.1 Co to znaczy dla `DECISIONS.md` §1.4

Pytanie „logowanie kontem Google — tak czy nie" zostało rozstrzygnięte **nie**,
i to z innego powodu, niż przewidywał spec z 18.08. Odłożenie uzasadniano tym, że
nie wiadomo, czy piętnaście osób ma konta Google. Passkey czyni to pytanie
bezprzedmiotowym: nie potrzebuje żadnego konta u dostawcy zewnętrznego, nie dokłada
Google jako odbiorcy danych do klauzuli informacyjnej i nie uzależnia dostępu do
kartoteki od cudzej usługi.

Trafna okazała się natomiast przewidziana w §6.1 architektura szwu: **obie metody
schodzą się w `createSession(accountId)`**, więc za tym punktem nie zmienia się nic.

---

## 2. Zakres kluczy — domena

**RP ID: `kartoteka.oazagdansk.pl`.** Nie `oazagdansk.pl`.

Klucz jest przywiązany do zakresu domeny i dostępny dla każdej witryny w tym
zakresie. Wybór domeny nadrzędnej udostępniłby klucze do kartoteki wszystkiemu, co
stoi na `oazagdansk.pl` — w tym stronie wspólnoty. Wąski zakres kosztuje tyle, że
przeprowadzka na inną poddomenę unieważni klucze; to tania cena za odcięcie
kartoteki od reszty.

**Konsekwencja nieodwracalna:** zmiana domeny po wdrożeniu unieważnia wszystkie
klucze i oznacza rozesłanie kompletu nowych zaproszeń. Domena musi być ustalona
**przed** rejestracją pierwszego klucza produkcyjnego. Dlatego decyzja zapadła
teraz, a nie w trakcie wdrożenia.

RP ID oraz dozwolone źródło (`origin`) wyprowadzamy **z jednej zmiennej `APP_URL`**,
żeby nie dało się ustawić dwóch niezgodnych wartości. W trybie produkcyjnym brak
`APP_URL` zatrzymuje start aplikacji: rozjazd między tą zmienną a prawdziwym
adresem objawiłby się wyłącznie tym, że logowanie przestaje działać, z komunikatem
niepomagającym w diagnozie.

`localhost` jest przez przeglądarki traktowany jako bezpieczny kontekst, więc praca
deweloperska działa bez TLS. Klucze z `localhost` nie istnieją na produkcji i
odwrotnie — nie ma czego mieszać ani sprzątać.

---

## 3. Model danych

### 3.1 Nowa tabela `credential`

Konto ma **wiele** kluczy. To nie jest udogodnienie, tylko podstawowa odpowiedź na
utratę urządzenia (§6) i na pytanie „chcę korzystać z komputera i z telefonu".

| kolumna | typ | rola |
|---|---|---|
| `id` | `String @id` | identyfikator nadany przez uwierzytelniacz, base64url |
| `account_id` | `BigInt` | właściciel, `onDelete: Cascade` |
| `public_key` | `Bytes` | klucz publiczny — jedyne, co przechowujemy |
| `counter` | `BigInt @default(0)` | licznik podpisów, wykrywanie klonu (§5.3) |
| `transports` | `String[]` | podpowiedź przeglądarki: `internal`, `hybrid`, `usb` |
| `label` | `String` | nazwa nadana przez użytkownika, np. „Telefon Ani" |
| `created_at` | `Timestamptz` | do listy w `/account` |
| `last_used_at` | `Timestamptz?` | do listy w `/account` |

Klucz główny to identyfikator z WebAuthn, a nie `BigInt` jak w reszcie schematu.
Odstępstwo świadome: ta wartość i tak musi być unikalna i wyszukiwalna, bo po niej
odnajdujemy klucz przy weryfikacji podpisu. Dokładanie obok drugiego identyfikatora
nie kupuje niczego.

Indeks na `account_id`. Mapowanie tabeli: `@@map("credential")`.

### 3.2 Zmiany w `account`

- **`password_hash` — usunięte.**
- **`webauthn_user_id`** (`Bytes @unique`) — nowe. Losowe 32 bajty, stałe dla konta.
  Wysyłane do uwierzytelniacza jako `user.id` i **tam zapisywane**. Specyfikacja
  WebAuthn wprost zabrania umieszczania w tym polu danych osobowych; adres e-mail
  ani nazwa pary nie mogą tam trafić. Wartość jest też tym, po czym odnajdujemy
  konto przy logowaniu bez podanego adresu (§5.2).
- **`invite_token_hash`, `invite_expires_at` — bez zmian.** Zaproszenie działa
  dalej, tylko na jego końcu powstaje klucz zamiast hasła.
- `credentials Credential[]` — relacja.

Do uwierzytelniacza trafiają jeszcze `user.name` i `user.displayName`; te **mają**
być czytelne, bo okno wyboru pokazuje je człowiekowi wybierającemu klucz. Adres
e-mail i nazwa pary — jak dziś na liście kont.

### 3.3 Nowa tabela `webauthn_challenge`

| kolumna | rola |
|---|---|
| `id` | `BigInt`, autoinkrement |
| `challenge` | losowe bajty wysłane przeglądarce |
| `account_id` | `BigInt?` — wypełnione przy rejestracji, puste przy logowaniu |
| `purpose` | `registration` / `authentication` |
| `expires_at` | `now() + 60 s` |

Wyzwanie musi żyć po stronie serwera i być jednorazowe, inaczej podpis nie dowodzi
niczego świeżego i nagranie jednej odpowiedzi wystarczy do ponownego wejścia.
Wiersz kasujemy przy zużyciu; zaległe sprząta istniejący `npm run retention`
(`scripts/retention.mts`), razem z sesjami i audytem.

Przy logowaniu `account_id` jest puste, bo w chwili wydania wyzwania nie wiemy
jeszcze, kto się loguje — i o to chodzi (§5.2).

---

## 4. Biblioteka

`@simplewebauthn/server` po stronie serwera, `@simplewebauthn/browser` po stronie
przeglądarki. Ręczne parsowanie CBOR i weryfikacja podpisów to nie jest kod, który
warto pisać samodzielnie do aplikacji dla piętnastu osób.

Zgodność wersji z Next 16.3 i React 19.2 sprawdzana przy implementacji, nie
zakładana z góry. Znika `@node-rs/argon2`.

---

## 5. Ceremonie

### 5.1 Rejestracja klucza — na końcu zaproszenia

Przepływ administracyjny zostaje bez zmian: admin klika „Zaproś", dostaje
jednorazowy link ważny 7 dni (`INVITE_DAYS` w `src/lib/accounts/policy.ts`)
i przekazuje go z ręki do ręki. Zmienia się wyłącznie strona pod linkiem.

Zamiast dwóch pól na hasło:

1. Strona pyta przeglądarkę, czy urządzenie obsługuje klucze
   (`isUserVerifyingPlatformAuthenticatorAvailable`). **Przycisk, który może nie
   zadziałać, nie jest pokazywany.** Gdy obsługi brak, osoba widzi „Otwórz ten link
   w telefonie" albo prośbę o kontakt z administratorem — nie zepsuty przycisk
   i nie biały ekran.
2. Kliknięcie „Utwórz klucz" → server action sprawdza token zaproszenia i wydaje
   parametry: wyzwanie, RP ID, `user.id`, `residentKey: 'required'`,
   `userVerification: 'required'`, `excludeCredentials` z już zarejestrowanych
   kluczy konta.
3. Przeglądarka tworzy klucz, użytkownik potwierdza odciskiem palca lub PIN-em.
4. Server action weryfikuje odpowiedź i **w jednej transakcji**: zapisuje wiersz
   `credential`, przełącza konto `pending` → `active`, zeruje token zaproszenia
   i zapisuje wpis do audytu. Reguła projektu o audycie w tej samej transakcji
   obowiązuje bez wyjątku.
5. **Logujemy od razu**, po czym pokazujemy zachętę do dodania drugiego urządzenia.

Punkt 5 jest odstępstwem od obecnego zachowania. `redeemAction`
(`src/app/(auth)/invite/[token]/actions.ts`) celowo nie loguje, z uzasadnieniem
„nowe hasło niech zostanie wpisane jeszcze raz, zanim mu zaufamy". Przy kluczu to
uzasadnienie znika: podpis właśnie został złożony i zweryfikowany, a powtórzenie
niczego nie dowodzi. Chwila zaraz po rejestracji jest przy tym jedynym momentem,
w którym mamy pewność, że osoba siedzi przy ekranie — i najlepszym, żeby
zaproponować drugi klucz.

### 5.2 Logowanie

`/login` to **jeden przycisk**. Pola na adres e-mail nie ma.

Klucze rejestrujemy jako odnajdywalne (`residentKey: 'required'`), więc przeglądarka
sama pokazuje listę kluczy dla tej witryny. Gdy na urządzeniu klucza nie ma, w tym
samym oknie proponuje „użyj innego urządzenia" i kod QR — telefon podpisuje,
komputer wchodzi, klucz zostaje w telefonie.

Skutek uboczny, który usuwa istniejący problem: **skoro nie ma pola na adres, nie da
się formularzem sprawdzać, kto ma konto.** Znika cała maszyneria `decoyHash`
z `src/app/(auth)/login/actions.ts` — sztuczny hash argon2id porównywany po to, żeby
czas odpowiedzi nie zdradzał istnienia konta.

Serwer po otrzymaniu podpisu:

1. odnajduje wyzwanie, sprawdza, że nie wygasło, i **kasuje je**;
2. odnajduje klucz po jego identyfikatorze, a konto po `webauthn_user_id`;
3. weryfikuje podpis kluczem publicznym;
4. **wymaga flagi `UV`** — bez tego passkey przestaje być dwuskładnikowy i cała
   argumentacja z §1 się rozpada; to nie jest szczegół do pominięcia;
5. sprawdza licznik podpisów (§5.3);
6. sprawdza `status === 'active'`;
7. aktualizuje `last_used_at` klucza i `last_login_at` konta;
8. woła `createSession(account.id)` i ustawia ciasteczko.

Za punktem 8 nie zmienia się **nic**: `requireUser()`, `permissions.ts`, `listScope`,
wszystkie server actions zostają dokładnie takie, jakie są.

### 5.3 Licznik podpisów — pułapka

Naiwna reguła „licznik musi rosnąć" **zepsułaby logowanie wszystkim**. Uwierzytelniacze
platformowe Apple i Google zwracają w liczniku stale zero, bo klucz synchronizuje
się między urządzeniami i monotoniczny licznik nie miałby sensu.

Reguła obowiązująca: gdy zapisany licznik i otrzymany są **oba zerowe**, kontroli
nie ma. W przeciwnym razie otrzymany musi być **ostro większy** od zapisanego;
wartość niższa lub równa oznacza sklonowany uwierzytelniacz i logowanie jest
odrzucane. Test jednostkowy na oba przypadki.

### 5.4 Sesja i limit prób

`SESSION_DAYS` w `src/lib/auth/session.ts` schodzi z **30 na 7**. Ciasteczko
(`setSessionCookie` w `requireUser.ts`) bierze tę wartość samo. Decyzja zamawiającego:
węższe okno dla skradzionej sesji, kosztem częstszego logowania. Przy passkey
częstsze logowanie to jedno dotknięcie czytnika, więc koszt jest znikomy — przy
haśle albo TOTP ta sama decyzja byłaby dotkliwa.

`src/lib/auth/rateLimit.ts` **zostaje**, ale w innej roli. Kluczowany po adresie IP
zamiast po adresie e-mail (którego nie ma). Podpisu kryptograficznego nie zgaduje
się metodą prób, więc limit chroni już tylko przed zaśmiecaniem tabeli wyzwań.
Progi `ATTEMPT_LIMIT` i `WINDOW_MINUTES` bez zmian.

**Świadomie nie wprowadzamy „zapamiętaj to urządzenie".** Cofnęłoby po cichu decyzję
o siedmiodniowej sesji.

---

## 6. Zarządzanie kluczami w `/account`

Strona, która dziś zawiera formularz zmiany hasła, dostaje **listę kluczy**: nazwa,
data dodania, ostatnie użycie. Przy każdym zmiana nazwy i usunięcie, nad listą
przycisk „Dodaj urządzenie".

Dodawanie to ceremonia z §5.1, uwierzytelniona sesją zamiast tokenu zaproszenia.
`excludeCredentials` z już zarejestrowanych kluczy — inaczej ludzie tworzyliby
duplikaty tego samego uwierzytelniacza, sądząc, że dodają drugie urządzenie.

Trzy zachowania, które razem zastępują procedurę odzyskiwania dostępu:

- **Ostatniego klucza nie da się usunąć.** Sprawdzane na serwerze, nie tylko
  ukryte w interfejsie: to zabezpieczenie przed zamknięciem się na zewnątrz,
  a nie kosmetyka. Server action jest publicznym endpointem POST.
- **Konto z dokładnie jednym kluczem widzi po zalogowaniu pasek z zachętą** do
  dodania drugiego. Tanie, a oszczędza telefony do administratora.
- **Po zalogowaniu kodem QR proponujemy zapisanie klucza na tym komputerze.**
  Odpowiedź WebAuthn niesie informację, że podpis przyszedł z innego urządzenia
  (`authenticatorAttachment: 'cross-platform'`), więc ten moment da się wykryć
  i zamienić w jedno kliknięcie zamiast skanowania QR przy każdym wejściu.

Dodanie i usunięcie klucza to wpisy w audycie, w tej samej transakcji.
`AuditKind.account` już istnieje — nowego rodzaju nie dodajemy.

Usunięcie klucza **nie** kończy sesji. Kto usuwa stary telefon z listy, siedzi
właśnie zalogowany na nowym.

---

## 7. Reset, przekazanie rejonu, furtka

### 7.1 „Nowy klucz…" zamiast „Nowe hasło…"

Przycisk na `/accounts` zmienia nazwę i nic poza tym. Mechanika `createInvite`
w `src/lib/accounts/manage.ts` zostaje nietknięta: jednorazowy link ważny 7 dni,
przekazywany z ręki do ręki.

Zostaje też zasada zapisana dziś w `docs/STATUS.md`: **wydanie linku nie odbiera
dotychczasowego dostępu.** Przy haśle brzmiała ryzykownie, przy kluczach jest
łagodniejsza — skradziony telefon i tak wymaga PIN-u albo biometrii właściciela.
Kto chce odciąć dostęp natychmiast, klika „Wyłącz", które kasuje sesje. Osoba po
utracie telefonu rejestruje nowy klucz i sama kasuje stary wpis z listy.

### 7.2 Przekazanie rejonu — miejsce, gdzie zmiana nie jest mechaniczna

`handOverRegion` (`src/lib/accounts/manage.ts:254`) zeruje dziś `passwordHash`
z komentarzem „ustępująca para zna stare hasło; zostawienie go pozwoliłoby jej
zalogować się pod nowym adresem".

Po zmianie to miejsce musi **usunąć wszystkie klucze konta**, w tej samej
transakcji. Tam naprawdę siada przy koncie inna para, a klucz ustępującej pary
zostałby ważny. Pominięcie tego jest błędem cichym: nic się nie zepsuje, dostęp
po prostu zostanie u niewłaściwych osób. Test integracyjny obowiązkowy.

### 7.3 Furtka i pierwsze uruchomienie

`scripts/key-reset.mts` — wypisuje jednorazowy link dla wskazanego konta:

```
npm run key:reset -- adres@example.pl
```

Wzorowany na `scripts/create-superadmin.mts`: rozszerzenie `.mts` (brak
`"type": "module"` w projekcie sprawia, że `tsx` ładuje `.ts` jako CommonJS
i top-level `await` wywala się z `ERR_REQUIRE_ASYNC_MODULE`) oraz
`import 'dotenv/config'` na pierwszej linii (`tsx` nie ładuje `.env` sam).

Uruchamia go ten, kto ma dostęp SSH do serwera — czyli i tak może wszystko.
Dodatkowego uprawnienia nie sprawdzamy. Wpis do audytu bez działającego konta:
`Audit.accountId` jest `BigInt?`, więc model to zniesie bez naciągania.

`scripts/create-superadmin.mts` zmienia się analogicznie: przestaje przyjmować
`ADMIN_PASSWORD`, tworzy konto w stanie `pending` z tokenem zaproszenia i wypisuje
link. Komentarz na górze pliku obiecuje dziś „zmień hasło po pierwszym
zalogowaniu" — do poprawienia. Odmowa utworzenia drugiego konta technicznego
zostaje.

**Te dwa skrypty to jeden mechanizm w dwóch zastosowaniach:** pierwsze uruchomienie
instalacji i późniejsze ratowanie kogoś, kto stracił wszystkie klucze.

---

## 8. Co znika

| Plik / element | Los |
|---|---|
| `src/lib/auth/password.ts` + `password.test.ts` | usunięte |
| `decoyHash` w `login/actions.ts` | usunięte wraz z powodem istnienia (§5.2) |
| `changeOwnPassword` w `src/lib/accounts/self.ts` + testy | usunięte |
| `MIN_PASSWORD_LENGTH` w `src/lib/accounts/policy.ts` | usunięte (`INVITE_DAYS`, `MAX_ACCOUNT_NAME` zostają) |
| pola hasła w `redeemAction` | zastąpione ceremonią |
| `@node-rs/argon2` | usunięta zależność |
| `e2e/password.spec.ts` | zastąpiony przez `passkey.spec.ts` |
| `e2e/prepare.ts` | traci powód istnienia (§11) |

Ubywa ok. 150 linii, dochodzi ok. 350. Netto projekt rośnie umiarkowanie, mimo że
metoda jest poważniejsza od zastąpionej.

---

## 9. Migracja bazy

**Pisana ręcznie.** `AGENTS.md` ostrzega, że `prisma migrate dev` czyta kolumny
`search_text` (`GENERATED ALWAYS`) jako dryf i dokłada do migracji `DROP DEFAULT`
oraz `DROP INDEX couple_search_text_idx`, po czym sam się na tym wywraca,
zostawiając skasowany indeks wyszukiwania. Ta migracja dodaje dwie tabele i usuwa
kolumnę, czyli trafia dokładnie w ten scenariusz.

Tryb pracy: SQL pisany ręcznie, sprawdzany na jednorazowej bazie
(`CREATE DATABASE …` + `migrate deploy`), a nie przez kasowanie bazy deweloperskiej.
Po zastosowaniu weryfikacja `prisma migrate status` — proces potrafi zawisnąć mimo
poprawnie zastosowanej migracji i trzymać blokadę advisory.

Zakres SQL: `CREATE TABLE credential`, `CREATE TABLE webauthn_challenge`,
`ALTER TABLE account DROP COLUMN password_hash`,
`ALTER TABLE account ADD COLUMN webauthn_user_id bytea`, indeksy, ograniczenia.

`webauthn_user_id` jest `UNIQUE NOT NULL`, a tabela nie jest pusta (istnieje konto
techniczne), więc kolumna powstaje jako nullable, zostaje wypełniona losowymi
wartościami dla istniejących wierszy i dopiero potem dostaje `NOT NULL`. Przy
jednym wierszu to formalność, ale migracja ma być poprawna niezależnie od tego,
ile ich zastanie.

---

## 10. Wdrożenie

### 10.1 Stan wyjściowy

Jedno konto — techniczne, z hasłem, należące do wykonawcy. Pozostałe konta nie są
założone. **Nie ma czego migrować i nie ma nikogo do przeprowadzania przez zmianę**,
więc robimy twarde cięcie bez okresu przejściowego i bez dwóch dróg wejścia
działających obok siebie.

### 10.2 Kolejność

Najpierw komplet pracy lokalnie, na `localhost`. Dopiero potem produkcja:

1. DNS: `kartoteka.oazagdansk.pl` → adres VPS. TLS załatwia Caddy
   z `docker-compose.prod.yml`.
2. `APP_URL=https://kartoteka.oazagdansk.pl` w środowisku produkcyjnym.
3. `migrate deploy` na świeżej bazie.
4. SSH, `npm run create-superadmin`, link z konsoli otwarty w przeglądarce
   **na maszynie, z której praca będzie naprawdę wykonywana**.
5. Rejestracja klucza — i **zaraz potem, w tym samym wejściu, drugiego, na
   telefonie.** Krok nieopcjonalny: konto techniczne z jednym kluczem to
   instalacja o jeden zgubiony telefon od sytuacji, w której jedynym wyjściem jest
   SSH z cudzego komputera.
6. Zalogowanie, założenie z interfejsu kont admina i jedenastu rejonowych,
   wygenerowanie linków.
7. **Pilotaż: najpierw dwa albo trzy linki** — do osób, o których sprzęcie wiadomo
   najmniej. Reszta po potwierdzeniu, że przechodzi.

### 10.3 Osoba, której urządzenie nie obsługuje kluczy

Nie wiadomo, jakim sprzętem posługują się pary odpowiedzialne za rejony, i **nie
trzeba tego ustalać z góry.** Strona zaproszenia sprawdza obsługę i mówi wprost
(§5.1), więc niewiadoma rozstrzyga się per osoba, w momencie, w którym ma znaczenie.

O obsłudze decyduje przeglądarka i istnienie **jednego** nowoczesnego urządzenia,
nie wiek komputera. Ktoś ze starym komputerem, ale zwykłym telefonem z blokadą
ekranu, rejestruje klucz w telefonie i loguje się na komputerze kodem QR.
Zablokowana jest dopiero osoba mająca jednocześnie stary telefon bez blokady ekranu
i stary komputer.

**Plan awaryjny to sprzęt, nie kod:** kluczyk USB klasy YubiKey, 100–200 zł, działa
przez dokładnie ten sam kod — dla WebAuthn to po prostu inny uwierzytelniacz. Dla
jednej czy dwóch osób jest to tańsze i uczciwsze niż zbudowanie i utrzymywanie na
zawsze drugiego podsystemu z hasłem i TOTP dla przypadku, który może nie zaistnieć.

Gdyby pilotaż pokazał, że kluczyk USB nie wystarcza, dołożenie drugiej metody dla
pojedynczego konta jest pracą zamkniętą — nie dlatego, że budujemy pod nią
abstrakcję na zapas, tylko dlatego, że szew już istnieje i jest nim
`createSession(accountId)`. Nowa metoda kończy się tym samym wywołaniem, a wszystko
za nim zostaje nietknięte. **Żadnego wymiennego interfejsu weryfikatora nie
projektujemy** — abstrakcja z jedną implementacją kosztuje dziś, a odgaduje
kształt czegoś, co może nigdy nie powstać.

### 10.4 Do dopisania w `docs/DEPLOYMENT.md`

Sekcja o pierwszym uruchomieniu wg §10.2, zasada dwóch kluczy dla konta
technicznego, sposób użycia `key:reset` oraz zdanie, którego dziś tam nie ma:
**zmiana domeny unieważnia wszystkie klucze i oznacza rozesłanie kompletu nowych
zaproszeń.**

---

## 11. Testy

**Jednostkowe (Vitest).** Wygasłe wyzwanie. Wyzwanie użyte dwa razy. Cofnięty
licznik podpisów oraz oba warianty z §5.3. Brak flagi `UV`. Nieznany klucz.
Konto `disabled` i konto `pending` z poprawnym podpisem. Odmowa usunięcia
ostatniego klucza.

**Integracyjne.** Transakcyjność rejestracji: wpis `credential`, przełączenie
statusu i wpis audytu zapisują się razem albo wcale. Wykupienie zaproszenia.
Reset przez administratora. **Przekazanie rejonu kasujące klucze** (§7.2).
Sprzątanie wyzwań przez `retention`.

**Playwright.** Passkeys da się testować end-to-end bez sprzętu: Chromium wystawia
przez CDP wirtualny uwierzytelniacz, który podpisuje jak prawdziwy. Pełne logowanie
kluczem jest w zasięgu automatu.

Problem leży gdzie indziej. **Siedem z ośmiu plików `.spec.ts` ma własną kopię
funkcji `signIn`** wpisującej pole „Hasło" — wszystkie oprócz
`security-headers.spec.ts`. Jeden z tych siedmiu (`password.spec.ts`) znika, więc
do przepisania zostaje sześć. Przy okazji wyciągamy pomocnika do wspólnego pliku,
razem z konfiguracją wirtualnego uwierzytelniacza: powielenie logowania w siedmiu
miejscach jest tym, co czyni taką zmianę bolesną, i drugi raz nie powinno zaboleć.

`e2e/prepare.ts` istnieje wyłącznie po to, by czyścić nieudane próby logowania
hasłem między uruchomieniami — traci powód istnienia.

**Seed.** `npm run db:seed` zakłada dziś piętnaście kont z hasłem `kartoteka123`.
Klucza nie da się zaseedować, bo musi zostać podpisany przez prawdziwy
uwierzytelniacz. Seed zostawia więc konta w stanie `pending` i **wypisuje
jednorazowe linki na konsolę**; deweloper po `db:reset` rejestruje klucz raz,
korzystając z wirtualnego uwierzytelniacza w Chrome DevTools — kilka kliknięć,
nie ceremonia z telefonem.

**Odrzucone: furtka „logowanie na skróty w trybie deweloperskim".** Obejście
logowania obecne w kodzie to dokładnie ta klasa rzeczy, którą ta zmiana ma usuwać,
a jego przypadkowe włączenie na produkcji kosztowałoby całą kartotekę.

---

## 12. Poza zakresem

- **Logowanie kontem Google** — rozstrzygnięte odmownie, §1.1.
- **TOTP** — wyłącznie jako plan awaryjny dla pojedynczego konta, gdyby pilotaż
  wykazał potrzebę; §10.3.
- **„Zapamiętaj to urządzenie"** — świadomie pominięte, §5.4.
- **Ponowne potwierdzenie kodem przy eksporcie i trwałym usunięciu** — rozważone
  i odrzucone: przy passkey sesja i tak trwa 7 dni, a klejnot chroni ten sam
  składnik, co całą resztę.
- **Treść klauzuli informacyjnej** — nadal rusztowanie z lukami. Passkey nie
  dokłada tam odbiorcy zewnętrznego, więc zakres luk się nie zmienia.
