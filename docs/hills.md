# Skocznie własne: format i reguły

## Czym jest skocznia

Skocznia własna gry to same dane: jeden obiekt zgodny z JSON, bez funkcji i bez kodu. Ten sam format obowiązuje
każdą skocznię, niezależnie od źródła (zrobioną ręcznie, wygenerowaną, a później zrobioną przez gracza). Dzięki
temu każda skocznia przechodzi te same kontrole, a plik skoczni nie może niczego wykonać. Kod: `src/hills/`.

Skocznie z plików oryginału mają własny opis w `hill-format.md`; ten dokument ich nie dotyczy.

## Format

Typ `HillSpec` (`src/hills/hill-spec.ts`), wersja formatu `schemaVersion: 1`. Przykład: skocznia „Ćwiczebna”
(`src/hills/own-hills.ts`).

```json
{
  "schemaVersion": 1,
  "id": "own-2",
  "name": "Ćwiczebna",
  "kPointM": 90,
  "profile": {
    "inrun": {
      "startXM": 11.4, "flatEndXM": 10, "lineEndXM": 25.3, "takeoffXM": 46,
      "lineSlope": -1, "lineInterceptM": 230, "curveA": 0.02
    },
    "landing": {
      "centerXM": 115, "centerYM": 150.9, "amplitudeM": 45, "widthM": 50,
      "outrunStartXM": 170, "outrunCurveA": 0.01, "knollBlend": 0.3
    }
  },
  "look": {
    "skyRgb6": [30, 50, 63],
    "terrain": { "seed": 4321, "amplitudeM": 50, "baseOverOutrunM": 3 },
    "trees": { "firstCount": 70, "secondCount": 30, "fromXM": 50, "toXM": 200, "seed": 5150, "hidden": [] },
    "supports": [
      { "fromXM": 7, "toXM": 9.5, "colour": 13, "frontColour": 25 },
      { "fromXM": 20, "toXM": 21, "colour": 13, "frontColour": 17 },
      { "fromXM": 33, "toXM": 40, "colour": 13, "frontColour": 25 }
    ],
    "inrun": { "platformStartXM": 6, "nearWallUpPx": 12, "nearWallDownPx": 11, "wallColour": 228, "gateColour": 163 },
    "marks": { "firstMarkM": 75, "markCount": 3, "fenceColour": 192, "fenceStartM": 0 }
  }
}
```

`profile` to parametry procedur budujących profil (`buildHillProfile` w `src/sim/hill-setup.ts`, znaczenie pól
w `physics-spec.md`), `look` to wygląd poza profilem (`HillLook` w `src/render/hill-look.ts`).

## Kontrola formatu

`parseHillSpec` (`src/hills/parse-hill-spec.ts`) czyta dane z niezaufanego źródła. Każdy obiekt jest sprawdzany
z listą znanych kluczy: klucz nieznany (także `__proto__`, `constructor`, `prototype`) i brakujący to błąd.
Dozwolone są tylko zwykłe obiekty, tablice i skończone liczby. Wynik jest budowany od nowa z dozwolonych pól.
Kontrola zbiera wszystkie problemy naraz; każdy ma stały identyfikator reguły (`format.…`), ścieżkę pola
i krótki opis po angielsku do logów. Teksty dla gracza dojdą w `src/text/ui-text.ts`.

Granice formatu (`src/hills/hill-spec-limits.ts`) mówią, co przyjmie silnik i rysowanie, a nie co jest dobrą
skocznią:

- wersja: wyższa od obsługiwanej daje jeden problem `format.newer-version` (dane z nowszej gry), inna `format.version`;
- `id`: małe litery i cyfry w grupach łączonych dywizem, 1..40 znaków, bo jest kluczem rekordów i powtórek;
- `name`: 1..24 znaki po normalizacji NFC, bez znaków sterujących, sterujących kierunkiem pisma i zerowej
  szerokości, tylko znaki, które czcionka obrazu skoku rysuje (`fontDraws` w `src/render/pixel-font.ts`), bo
  inaczej nazwa wyglądałaby inaczej, niż ją zapisano;
- szerokość tytułu: napis „nazwa K…” ma najwyżej 138 px, bo tyle miejsca zostaje w najwęższym obrazie (256 px) między
  przyciskiem pauzy w lewym górnym rogu (najdalej do kolumny 61) a oknem wiatru ze światłem startowym (57 px
  z odstępem) (`src/hills/hill-title.ts`);
- `kPointM`: liczba całkowita 20..300;
- rozbieg: zakresy pól oraz kolejność `flatEndXM <= startXM < takeoffXM` i `flatEndXM <= lineEndXM < takeoffXM`,
  bo funkcje profilu biorą część płaską do `flatEndXM`, prostą do `lineEndXM`, a łuk dalej; płaska część za końcem
  prostej zostałaby nadpisana łukiem;
- zeskok: zakresy pól, wybieg zaczyna się co najmniej 20 m za progiem i najdalej na 600 m;
- wygląd: kolory to indeksy palety 0..255 (bramka startowa najwyżej 254, bo jej druga połowa bierze następny
  indeks), niebo w 6-bitowym RGB, ziarna 0..65535, najwyżej 8 podpór i 8 ukrytych grup drzew, odcinki z początkiem
  przed końcem.

## Reguły geometrii

`geometryProblems` (`src/hills/hill-geometry.ts`) mierzy zbudowany profil (`hillGeometry`) i sprawdza progi
z `HILL_RULES` (identyfikatory `geometry.…`). Pomiary są skończone dla każdej skoczni, która przeszła kontrolę formatu.

- `join-height`: na złączach płaskie/prosta, prosta/łuk i zeskok/wybieg skok wysokości najwyżej 0,01 m, bo stopień
  w torze to uderzenie w nartę;
- `join-slope`: na złączach prosta/łuk i zeskok/wybieg różnica nachylenia najwyżej 0,5°; płaska część leży za
  belką startową i styka się z prostą pod jej pełnym kątem, więc tam sprawdzana jest tylko wysokość;
- `takeoff-angle`: kąt progu 6..12° w dół, bo poza tym lot jest za stromy albo za płaski dla fizyki skoku;
- `table-height`: próg 1..3 m nad zeskokiem, bo niżej skoczek ląduje od razu, wyżej spada z wysoka;
- `landing-angle-at-k`: nachylenie zeskoku w punkcie K 34..48°, bo tam ląduje większość skoków;
- `k-near-steepest`: punkt K najwyżej 15 m (w poziomie) od najbardziej stromego miejsca zeskoku;
- `landing-area-length`: koniec strefy lądowania (pierwsze miejsce za najbardziej stromym, gdzie zeskok jest
  łagodniejszy niż 32°, mierzony łukiem od progu) leży 0,1..0,4 K za punktem K, bo dalsze skoki potrzebują miejsca;
- `outrun-length`: od końca strefy lądowania do najniższego punktu wybiegu co najmniej 30 m w poziomie, na
  wyhamowanie;
- `outrun-within-scene`: najniższy punkt wybiegu najdalej 380 m, bo tyle obejmują tablice warstw sceny
  (`LAYER_TABLE_LENGTH_M` w `src/render/hill-layer-tables.ts`);
- `inrun-descends`, `landing-descends`: rozbieg opada od startu do progu, a zeskok od progu do najniższego punktu
  wybiegu (próbki co 0,1 m).

Kontrole oparte na symulacji skoków dochodzą w kolejnym kroku.

## Odcisk geometrii i identyfikator

`hillFingerprint` (`src/hills/hill-fingerprint.ts`) to skrót FNV-1a (32 bity, 8 cyfr szesnastkowych) z punktu K
i 20 liczb zbudowanego profilu, każdej jako 4 bajtów wartości pojedynczej precyzji (little-endian). Wygląd do
niego nie wchodzi. Test przypina odcisk każdej skoczni własnej. Zmiana geometrii oznacza nowy identyfikator,
a stary trafia do `RETIRED_OWN_HILL_IDS` (`src/game/hill-choice.ts`): rekordy i powtórki zostają przy starym
kształcie i nigdy nie spotykają nowego.

## Dodanie skoczni

1. Skopiować dane istniejącej skoczni w `src/hills/own-hills.ts`, nadać nowy `id` i nazwę, zmienić liczby.
2. `corepack pnpm test src/hills`: format, reguły geometrii i odcisk (nowy odcisk dopisać do tabeli w teście).
3. Przejrzeć migawkę pikseli i testy przeglądarkowe, które wskazują skocznię wbudowaną (`e2e/support/app.ts`;
   czasy naciśnięć w `e2e/support/jump.ts` zmierzono na tej skoczni).
4. Skoczyć na komputerze i na telefonie.
5. Podnieść wersję jak przy każdej zmianie gry.
