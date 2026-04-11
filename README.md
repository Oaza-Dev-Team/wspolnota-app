# Wspólnota – Lista Członków

Prosta aplikacja webowa do zarządzania listą małżeństw w diecezji.  
Dane przechowywane są w Google Sheets – żadnego serwera, zero kosztów.

---

## Wymagania

- Node.js 16+
- Konto Google

---

## Instalacja i uruchomienie

```bash
cd wspolnota-app
npm install
npm start
```

---

## Konfiguracja Google (jednorazowo)

### Krok 1 – Utwórz projekt w Google Cloud

1. Wejdź na https://console.cloud.google.com/
2. Kliknij **Nowy projekt** → nadaj nazwę np. „Wspólnota"
3. Wybierz projekt

### Krok 2 – Włącz Google Sheets API

1. Menu → **APIs & Services** → **Library**
2. Wyszukaj „Google Sheets API" → **Enable**

### Krok 3 – Utwórz dane OAuth 2.0

1. Menu → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. Typ aplikacji: **Web application**
4. Dodaj do **Authorized JavaScript origins**:
   - `http://localhost:3000` (do developmentu)
   - docelowy adres produkcyjny (np. GitHub Pages)
5. Skopiuj **Client ID** – będzie potrzebny w aplikacji

### Krok 4 – Skonfiguruj ekran zgody OAuth

1. **APIs & Services** → **OAuth consent screen**
2. User Type: **Internal** (jeśli masz Google Workspace) lub **External**
3. Uzupełnij wymagane pola
4. Dodaj scope: `https://www.googleapis.com/auth/spreadsheets`
5. Dodaj testowych użytkowników (przy External)

### Krok 5 – Utwórz arkusz Google Sheets

1. Utwórz nowy arkusz na https://sheets.google.com
2. Zmień nazwę pierwszego arkusza na: **Członkowie**
3. W wierszu 1 dodaj nagłówki (opcjonalne, aplikacja pomija wiersz 1):
   ```
   A1: Imię męża
   B1: Imię żony
   C1: Nazwisko
   D1: Parafia
   E1: Numer kręgu
   F1: Email
   G1: Telefon
   H1: Notatki
   ```
4. Skopiuj ID arkusza z URL:
   `https://docs.google.com/spreadsheets/d/`**[TO JEST ID]**`/edit`

### Krok 6 – Uruchom aplikację i skonfiguruj

1. Uruchom `npm start`
2. Kliknij **Ustawienia** w aplikacji
3. Wpisz Client ID i ID arkusza
4. Kliknij **Połącz z Google Sheets**
5. Zaloguj się przez Google – gotowe!

---

## Struktura dostępu dla rejonów

Aby dać odpowiedzialnym za rejony dostęp tylko do swojego rejonu:

**Opcja A – Osobne arkusze (zakładki) w jednym pliku**
- Utwórz zakładki: `Rejon 1`, `Rejon 2`, itd.
- Udostępnij plik z uprawnieniem **Edytor** wybranym osobom
- W kodzie zmień `sheetName` na nazwę odpowiedniego rejonu

**Opcja B – Osobne pliki dla każdego rejonu**
- Utwórz osobny arkusz dla każdego rejonu
- Każdy rejon dostaje swój Spreadsheet ID do konfiguracji
- Plik diecezji używa IMPORTRANGE do zbierania danych

---

## Dalszy rozwój z Claude Code

Możesz poprosić Claude Code o:
- Dodanie logowania z rolami (admin diecezji / rejon)
- Eksport do PDF lub Excel
- Wysyłanie maili do członków
- Filtr po dacie dodania
- Statystyki i wykresy

---

## Hosting (opcjonalnie)

```bash
npm run build
```
Folder `build/` wrzuć na GitHub Pages, Netlify lub Vercel – wszystkie darmowe.
