# Pole „Parafia” w karcie pary — z selecta na combobox

Wariant **1A** z makiety `Parafia — kontrolka.dc.html`. Zastępuje dzisiejszą parę
kontrolek (`.search` + `<select name="parishId">`) w `src/app/(app)/couples/CoupleCard.tsx`
jednym polem z podpowiedziami.

Dokument jest nadrzędny dla zachowania tego pola. Reszta karty bez zmian.

## Dlaczego

Select z szukajką nad nim ma trzy wady, które combobox usuwa: dwa pola na jedną
decyzję, filtr nie mówi, co jest wybrane, a „+ nowa parafia…” ginie na końcu listy
kilkudziesięciu opcji. Zysk musi być zachowany: select potrafił bez otwierania
powiedzieć „— jak w kręgu —”, i **to zachowanie zostaje** (patrz stan zwinięty).

## Kontrakt zapisu — bez zmian

Server action zostaje dokładnie taka, jaka jest. Formularz nadal wysyła:

| pole | wartość |
|---|---|
| `parishId` | `''` → parafia z kręgu · `<id>` → parafia własna pary · `__new__` → utwórz |
| `newParishName`, `newParishCity` | tylko gdy `parishId === '__new__'` |

Wniosek: combobox jest tylko UI nad `<input type="hidden" name="parishId">`.
Nie ruszamy `actions.ts`, `MissingParish`, ani sekcji `.newEntity` — poza tym, że
`newParishName` dostaje `defaultValue` z tego, co człowiek wpisał (niżej).

## Stan i zachowanie

Trzy stany wyboru, jeden hidden input:

1. **dziedziczone** — `parishId=''`. Zwinięte pole pokazuje placeholderem
   `— jak w kręgu — (św. Brygidy, Gdańsk)`; podpowiedź pod polem:
   `Dziedziczy z kręgu: <parafia kręgu>`.
2. **wybrana parafia** — `parishId=<id>`. Zwinięte pole pokazuje `Nazwa, Miasto`;
   podpowiedź: `Parafia własna pary, inna niż parafia kręgu.`
3. **nowa** — `parishId='__new__'`. Zwinięte pole pokazuje `<wpisany tekst> (nowa)`;
   pod polem odsłania się istniejący blok `.newEntity` z `newParishName`
   (prefill = wpisany tekst) i `newParishCity` (puste, fokus tam po wyborze).

Otwieranie i lista:

- Fokus lub klik **otwiera** listę i czyści zapytanie → widać wszystkie parafie.
  Wybrana wartość nie ginie: jest w hidden inpucie do momentu nowego wyboru.
- Pisanie filtruje po `nazwa + ' ' + miasto`, **bez ogonków i bez wielkości liter**,
  dopasowanie `includes` (nie tylko prefiks — „bryg” znajduje „św. Brygidy”).
  Zwijanie diakrytyków 1:1 (`ą→a`… `ż→z`), bez `normalize('NFD')`, żeby indeksy
  dopasowania zgadzały się z oryginalnym stringiem przy pogrubianiu trafienia.
- Wiersz listy: nazwa po lewej (trafiony fragment `<b>`), miasto po prawej, drobniej.
- Wiersz „— jak w kręgu —” jest **pierwszy**, widoczny przy pustym zapytaniu oraz gdy
  zapytanie pasuje do frazy „jak w kregu”. Meta po prawej: parafia kręgu.
- Wiersz „+ nowa parafia „X”” jest **ostatni** i pojawia się, gdy `X.trim().length >= 3`
  i żadna parafia nie ma dokładnie takiej nazwy. Meta: `utworzy się przy zapisie`.
- Pod polem licznik: przy pustym zapytaniu `43 parafie — pisz albo wybierz ↑↓`,
  przy filtrze `7 z 43 parafii`. Liczebniki przez `plural()` z `src/lib/pl/`.
  Sortowanie listy `localeCompare(…, 'pl')`.
- Zamknięcie bez wyboru (Esc, blur, klik poza) **nie zmienia** wyboru ani hidden inputu.

Klawiatura: `↓`/`↑` po wierszach (otwiera, jeśli zwinięte), `Enter` wybiera
podświetlony, `Esc` zamyka, `Home`/`End` skok na koniec listy, `Tab` zamyka
i przechodzi dalej bez zmiany wyboru. Podświetlenie po `onMouseEnter` też.
Wybór myszą na `onMouseDown` z `preventDefault()` — `onClick` przegrywa z `blur`
i lista zamyka się przed wyborem.

Dostępność (to jest część zamówienia, nie dodatek):

- input: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
  `aria-activedescendant` = id podświetlonego wiersza, `aria-label="Parafia"`,
  `autoComplete="off"`.
- kontener listy `role="listbox"`, wiersze `role="option"` + `aria-selected`,
  stabilne `id` (`parish-opt-<i>`).
- licznik trafień w `aria-live="polite"`, żeby czytnik wiedział, że lista się zawęziła.
- wiersze min 44 px wysokości; lista `max-height` ok. 266 px i `overflow:auto`;
  podświetlony wiersz doprowadzany do widoku przez ustawienie `scrollTop` kontenera
  z jego `offsetTop` — **nie** `scrollIntoView`.
- `!editable`: żadnej listy ani hidden inputu. Zwykły `<input disabled>` z etykietą
  wybranej parafii albo `— jak w kręgu —`; tak samo jak dziś zachowują się pozostałe pola.

## Warstwa CSS

Nowe klasy w `src/app/(app)/couples/card.module.css`; klasę `.search` usuń, jeśli po
zmianie nikt jej nie używa (sprawdź `FilterBar`). Same tokeny, żadnych literałów:

| klasa | rola |
|---|---|
| `.combo` | `position:relative` wokół pola i listy |
| `.comboList` | `position:absolute`, `background:var(--surface)`, `border:1px solid var(--border)`, `border-radius:var(--r-9)`, `box-shadow:var(--shadow-toast)`, `z-index` nad `.newEntity` |
| `.comboRow` | `display:flex`, `justify-content:space-between`, `min-height:44px`, `cursor:pointer` |
| `.comboRowActive` | `background:var(--bg-row)` (albo `--row-hover`) |
| `.comboMeta` | `font-size:12px`, `color:var(--text-muted)`, `white-space:nowrap` |
| `.comboMark` | pogrubiony fragment trafienia, `color:var(--navy-700)` |

Samo pole używa istniejącego `.control` — łącznie z dwustopniowym fokusem
(`:focus` miękki ring, `:focus-visible` outline). Lista jest w `<dialog>`, więc
`z-index` liczy się tylko wewnątrz panelu; nie dokładaj portalu.

## Szkic implementacji

Do wklejenia w miejsce dzisiejszego bloku `Parafia` w `CoupleCard.tsx`; logikę
dopasowania (`fold`, filtr, składanie wierszy) wynieś do
`src/app/(app)/couples/ParishCombobox.tsx` jako komponent kliencki z propsami
`{ parishes, valueId, inheritedLabel, editable }`, żeby karta nie rosła.

```tsx
type Row =
  | { kind: 'inherit' }
  | { kind: 'item'; id: string; name: string; city: string; hit: [number, number] | null }
  | { kind: 'create'; text: string };
```

Reguły, które łatwo zgubić:

- `parishId` w hidden inpucie, nie w `value` widocznego pola — inaczej wyślemy etykietę.
- Nazwa i miasto w `options.parishes` przychodzą dziś jako jeden `label`. Rozdziel je
  w `page.tsx` (`{ id, name, city }`), żeby wiersz mógł pokazać miasto po prawej;
  `label` możesz zostawić dla `FilterBar`.
- Po wyborze „+ nowa parafia” ustaw fokus na `newParishCity` (nazwę już znamy).
- Zmiana kręgu nie zmienia parafii — ale zmienia tekst „dziedziczy z kręgu”.
  Etykieta parafii kręgu musi iść z danymi kręgów (`options.circles[].parishLabel`),
  inaczej podpowiedź skłamie po zmianie kręgu w tej samej sesji.

## Testy do przepisania

`e2e/card.spec.ts` operuje na selekcie i **przestanie się kompilować semantycznie** —
`selectOption` nie działa na inpucie. Do przepisania, zachowując intencję:

1. `creating a couple can introduce a parish and a circle that do not exist yet`
   → wpisz nazwę, kliknij wiersz `+ nowa parafia`, wypełnij miasto, zapisz.
2. `searching narrows the parish list without losing what is already chosen`
   → po `Esc` hidden `parishId` ma tę samą wartość co przed pisaniem.
3. `a couple that takes its parish from the circle says so rather than looking empty`
   → zwinięte pole pokazuje `— jak w kręgu —` z nazwą parafii kręgu.
4. Nowy: `keyboard alone can pick a parish` — `↓↓Enter`, sprawdź hidden input.
5. Nowy: `Escape closes the list without changing the choice`.
6. `e2e/accessibility.spec.ts` — dołóż sprawdzenie `aria-expanded` i
   `aria-activedescendant` na otwartej liście.

`e2e/list.spec.ts` zostaje bez zmian: filtr w `FilterBar` to nadal select.

## Odbiór

- [ ] Jedno pole zamiast dwóch; „+ nowa parafia” widoczna dopiero, gdy ma sens.
- [ ] Zwinięte pole mówi, co jest wybrane, także przy dziedziczeniu z kręgu.
- [ ] „bryg”, „Bryg”, „brygidy”, „gdansk” znajdują to samo co „Brygidy”.
- [ ] Wybór wyłącznie klawiaturą; `Esc` i klik poza listą nie zmieniają wyboru.
- [ ] Czytnik ogłasza zawężenie listy; wiersze ≥ 44 px.
- [ ] `!editable` nie otwiera listy i nie wysyła `parishId`.
- [ ] Zero literałów kolorów/odstępów w nowym CSS.
- [ ] `npm test`, `npm run test:int`, `npm run lint`, `npm run build`, Playwright — zielone.
