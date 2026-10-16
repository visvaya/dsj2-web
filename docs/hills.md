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
  "id": "own-3",
  "name": "Ćwiczebna",
  "kPointM": 90,
  "profile": {
    "inrun": {
      "startXM": 10.6, "flatEndXM": 9.2, "lineEndXM": 25.3, "takeoffXM": 46,
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
Za długa lista i za długi tekst są zgłaszane bez czytania nadmiaru, więc rozmiar danych nie zwiększa kosztu kontroli.
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
- rozbieg: zakresy pól oraz kolejność `startXM < takeoffXM` i `flatEndXM <= lineEndXM < takeoffXM`, bo funkcje
  profilu biorą część płaską do `flatEndXM`, prostą do `lineEndXM`, a łuk dalej; płaska część za końcem prostej
  zostałaby nadpisana łukiem; start może leżeć na części płaskiej;
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
- `takeoff-angle`: kąt progu 6..12° w dół;
- `table-height`: próg 1..3 m nad zeskokiem;
- `landing-angle-at-k`: nachylenie zeskoku w punkcie K 34..48°, bo w okolicy K ląduje większość skoków i tam
  zeskok ma przejmować lądowanie;
- `k-near-steepest`: punkt K najwyżej 15 m (w poziomie) od najbardziej stromego miejsca zeskoku;
- `landing-area-length`: koniec strefy lądowania (pierwsze miejsce za najbardziej stromym, gdzie zeskok jest
  łagodniejszy niż 32°, mierzony łukiem od progu) leży 0,1..0,4 K za punktem K, bo dalsze skoki potrzebują miejsca;
- `outrun-length`: od końca strefy lądowania do najniższego punktu wybiegu co najmniej 30 m w poziomie, na
  wyhamowanie;
- `outrun-within-scene`: najniższy punkt wybiegu najdalej 380 m, bo tyle obejmują tablice warstw sceny
  (`LAYER_TABLE_LENGTH_M` w `src/render/hill-layer-tables.ts`);
- `inrun-descends`, `landing-descends`: rozbieg opada od startu do progu, a zeskok od progu do najniższego punktu
  wybiegu (próbki co 0,1 m; próbka może leżeć najwyżej 1 mm wyżej od poprzedniej, bo przy dnie łagodnego wybiegu
  sąsiednie wysokości różnią się mniej, niż rozróżnia pojedyncza precyzja).

### Dwa poziomy reguł

Każda reguła geometrii ma poziom (`GEOMETRY_RULE_LEVELS`, pole `level` problemu; problemy formatu i symulacji
poziomu nie mają, bo z natury są dopuszczające):

- **dopuszczenie** (`admission`): reguły, których potrzebuje silnik albo scena, albo których nie łamie żadna
  skocznia tej gry; skocznia, która je łamie, jest odrzucana:
  - `join-height`, `join-slope`: stopień albo załamanie toru to uderzenie w narty;
  - `inrun-descends`: wznoszący się rozbieg może zatrzymać skoczka przed progiem;
  - `landing-descends`: wznoszący się zeskok to ściana, w którą skoczek wlatuje;
  - `table-height`: próg daleko nad zeskokiem albo pod nim odbiera wybiciu sens;
- **styl** (`style`): reguły nowoczesnej skoczni, których trzymają się skocznie własne gry; skocznia gracza, która
  je łamie, jest dopuszczana z uwagą, a nie odrzucana:
  - `takeoff-angle`: skocznie oryginału mają progi daleko poza tym zakresem i dobrze się na nich skacze;
  - `landing-area-length`: czy dobry gracz przeskoczy strefę lądowania, sprawdza symulacja;
  - `outrun-length`: czy skoczek zatrzyma się w scenie, sprawdza symulacja;
  - `outrun-within-scene`: scena jest rysowana do 380 m, ale liczy się to, że skoczek zatrzyma się przed jej
    końcem, co sprawdza symulacja; najniższy punkt wybiegu może leżeć dalej (tak jest na dwóch skoczniach
    oryginału);
  - `k-near-steepest`, `landing-angle-at-k`: czy dobry gracz ląduje blisko K, sprawdza symulacja.

`geometryProblems` zwraca problemy obu poziomów, `admissionProblems` tylko dopuszczające. Testy skoczni własnych
wymagają braku problemów obu poziomów. Test lokalny z plikami gry (`DSJ2_GAME_DIR`) sprawdza, że każda z 37 skoczni
oryginału przechodzi każdą regułę dopuszczenia (na każdej da się skakać);
liczbę skoczni oryginału spełniających każdą regułę pokazuje tylko wtedy, gdy któraś reguła dopuszczenia zawiedzie.

Zakresy reguł stylu to założenia projektu, a nie granice sprawdzone symulacją; to, co mają zapewniać, sprawdzają
kontrole oparte na symulacji skoków (następna sekcja).

## Kontrole symulacją

Geometria nie mówi, czy skocznia dobrze się skacze. Kontrole w `src/hills/hill-play.ts` puszczają prawdziwą
symulację (`startTrainingJump`, `stepTrainingJump`) z botami z `src/hills/hill-players.ts` i porównują wyniki
z progami `PLAY_RULES`. `playMeasures` zwraca same liczby, `playProblems` stosuje do nich progi (reguły `play.*`).
Każda kontrola obejmuje wszystkie skocznie własne, więc nowa skocznia wchodzi do nich przez same dane.

Dawne boty grały według skryptu: cel wybicia z próbowania celów w symulacji, w locie jeden kąt ciała (0,3 rad)
niezależnie od skoczni, wiatru i fazy lotu, lądowanie na stałej wysokości, bez czytania wiatru i bez wiedzy
o punktach. Były wiarygodne tylko do K120, a na 38 skoczniach z prostszym botem rozrzut odległości na dużych
skoczniach (40-60 m) pochodził od bota, a nie od skoczni. Teraz grają polityką gracza, którą wytrenowano,
a wyrocznia mówi, ile da się ze skoczni wyciągnąć najwyżej.

### Co widzi gracz

`playerView` (`src/hills/player-view.ts`) zwraca z bieżącego stanu skoku tylko to, co widzi gracz: klatkę, fazę,
prędkość, czas do krawędzi progu przy obecnej prędkości, wysokość nad terenem pod skoczkiem i tempo, w jakim maleje,
kąt ciała, liczbę klatek od oderwania oraz wiatr wzdłuż skoczni tak, jak pokazuje go wskaźnik (składowa x
z `displayedWindMPerS`, liczona deterministycznym cosinusem, żeby bot decydował tak samo w każdym silniku). Nie widzi
wiatru z przyszłości ani danych skoczni poza terenem pod sobą i krawędzią przed sobą.

### Polityka gracza

`PlayerPolicy` (`src/hills/player-policy.ts`) to 10 liczb z jednostką w nazwie:

- `takeoffAimS`: oba przyciski w przysiadzie, gdy czas do krawędzi spadnie do tej wartości; trzymane do oderwania;
- `earlyFlightFrames`, `earlyLeanRad`: pochylenie (minus kąt ciała, do którego prowadzi sterowanie) w pierwszych
  klatkach lotu;
- `leanRad`, `leanPerSpeedRadPerMPerS`, `leanPerHeightRadPerM`, `leanPerTailWindRadPerMPerS`: pochylenie w reszcie
  lotu, liniowe względem prędkości (od 25 m/s), wysokości nad terenem (od 3 m) i pokazanego wiatru w plecy;
  ograniczone do -0,2..0,9 rad;
- `landingHeightM`, `landingPerClosingS`: przy opadaniu prawy przycisk przez 4 klatki, gdy wysokość spadnie poniżej
  `landingHeightM` plus tempo opadania razy `landingPerClosingS`;
- `telemark`: lewy od 8. do 12. klatki po prawym (telemark) albo bez niego (na dwie nogi).

Sterowanie w locie to poprawka 60 mikrokroków myszy na radian błędu kąta, obcięta do 40 na klatkę. Szum bota
pochodzi z własnego, zasianego `BorlandRandom` (rozkład zbliżony do normalnego z sumy 12 liczb jednostajnych, bez
funkcji przestępnych, więc wynik jest ten sam w każdym silniku).

Trzy poziomy graczy (`PLAYER_LEVELS`) to wytrenowana polityka z ludzkim szumem:

- słaby: rozrzut wybicia 0,08 s, sterowanie 0,6 poprawki z szumem 8, lądowanie 0,7 m niżej niż polityka, +- 1 m;
- średni: rozrzut 0,04 s, pełne sterowanie z szumem 4, lądowanie 0,2 m niżej, +- 0,5 m;
- dobry: rozrzut 0,015 s, pełne sterowanie z szumem 2, lądowanie jak polityka, +- 0,2 m.

`EXACT_PLAYER_LEVEL` to dobry gracz bez szumu, czyli sama polityka.

### Trening

`node scripts/train-player.mjs [liczba ocen]` (domyślnie 400) trenuje politykę i wypisuje liczby oraz wyniki do
przepisania do `TRAINED_PLAYER_POLICY` i `TRAINED_POLICY_SCORES`; niczego nie zapisuje. Skrypt, a nie plik testów:
trening trwa minuty, a wynikiem są liczby do przejrzenia i przepisania, nie werdykt. Trening jest deterministyczny:
ten sam kod daje te same liczby.

Zbiór treningowy (`src/hills/test-support/player-training.ts`) to wyłącznie skocznie własne i ich warianty z ich
danych: wszystkie długości razy 0,7-2,5, rozbieg dłuższy albo krótszy o 4-32 m razy skala (dłuższy przesuwa resztę
skoczni w prawo, bo start nie może zejść poniżej 0 m; próg zachowuje wysokość, bo reguły trzymają ją w stałym
zakresie). Wariant zostaje, gdy przechodzi kontrolę formatu i reguły dopuszczenia geometrii oraz gdy mediana
skoków gracza odniesienia (dawnego bota, `REFERENCE_PLAYER_POLICY`) leży między 0,75 K a końcem strefy lądowania,
czyli skocznia skacze się na swój rozmiar. Zostaje 19 skoczni od K63 do K225. Na każdej skacze gracz bez szumu na
dwóch najsilniejszych ziarnach każdej klasy wiatru; wynik to średnia punktów gry, a upadek lub dyskwalifikacja
liczy się jako -100 punktów.

Przeszukiwanie startuje od gracza odniesienia: najpierw strategia ewolucyjna (1+6) z zasianym generatorem (70%
ocen; wszystkie liczby naraz, rozrzut w krokach zgrubnych, szerszy po zysku, węższy bez niego), potem przeszukiwanie
po współrzędnych z krokami dokładnymi. Styl lądowania nie jest trenowany: wszystkie skocznie zbioru mają ten sam
kształt zeskoku, jedno porównanie stylów rozstrzygało kilka ziaren (raz na dwie nogi wygrało o 0,2 punktu na 152
skokach), a gracz odniesienia lądujący na dwie nogi upada na tym samym zbiorze tak często, że jego średnia spada
z 128 do 82 punktów.

Wynik: 155,0 punktu na zbiorze treningowym (gracz odniesienia 127,6), 123,25 na samych skoczniach własnych, po 173
ocenach, około 5 minut na tej maszynie. Część wczesna lotu wypadła (0 klatek), wiatr i prędkość nie weszły do
pochylenia; zostały pochylenie 0,2 rad rosnące o 0,048 rad na metr wysokości, wybicie 0,2 s przed krawędzią
i lądowanie na 1,8 m plus 0,04 s tempa opadania. Test jednostkowy sprawdza tylko, że liczby dają zapisany wynik na
skoczniach własnych: tani dowód, że ani polityka, ani symulacja się nie zmieniły.

### Wyrocznia

`oracleJump` (`src/hills/hill-oracle.ts`) zna skocznię i ziarno, więc i przyszły wiatr. Szuka zmian skoku
wytrenowanego gracza, które dają najwięcej punktów: przesunięcia celu wybicia o całe klatki, pochylenia dodanego
w czterech częściach lotu (do 35, 105 i 210 klatek od oderwania i dalej) i przesunięcia wysokości lądowania. To
przeszukiwanie po współrzędnych z krokami 0,1 rad i 1 m, potem 0,04 rad i 0,4 m, najwyżej 60 skoków na ziarno;
upadek i dyskwalifikacja to najgorszy wynik (-100 punktów). Startuje od skoku gracza, więc nigdy nie wypada
gorzej od niego. Na skoczni Ćwiczebna cztery wyszukiwania (po jednym na klasę wiatru) to 141 skoków i około 1,3 s.

### Porównanie z wyrocznią na skoczniach oryginału

Test lokalny (z `DSJ2_GAME_DIR`, patrz niżej) gra każdą z 37 skoczni oryginału wytrenowanym graczem i wyrocznią na
najsilniejszym ziarnie każdej klasy wiatru. Odległość, którą dokłada wyrocznia, jako część K (średnia i 90. centyl
w przedziale wielkości), pomiar z 2026-10-17:

| K | skoczni | średnio | 90. centyl | punkty średnio | upadki gracza |
|---|---|---|---|---|---|
| do 90 | 10 | 0,049 | 0,100 | 8,1 | 0 |
| 90-120 | 7 | 0,055 | 0,097 | 11,3 | 0 |
| 120-160 | 8 | 0,072 | 0,141 | 15,6 | 0 |
| powyżej 160 | 12 | 0,096 | 0,195 | 24,2 | 0 |

Margines wynika z przedziałów, w których boty już uznawano za wiarygodne: średnio najwyżej 0,06 K, 90. centyl
najwyżej 0,12 K, bez upadków. Przedział 120-160 go przekracza, więc granica K120 (`botReliableMaxKPointM`) zostaje;
test lokalny pilnuje marginesu do tej granicy. Na innych ziarnach (od 1001, 16 na skocznię) wytrenowany gracz
zdobywa na skoczniach oryginału prawie tyle samo co dawny bot (do K90 118,8 wobec 117,7 punktu, 90-120 114,3 wobec
111,5, 120-160 140,8 wobec 141,7, powyżej 160 159,7 wobec 164,1): trening na wariantach jednej skoczni własnej słabo
przenosi się na inne kształty zeskoku. Podniesienie granicy wymaga skoczni treningowych o innych kształtach, czyli
kolejnych skoczni własnych.

Okno wybicia to liczba klatek celu (co 1/70 s), przy których skoczek bez błędów ląduje najwyżej 3 m przed
najlepszym skokiem, bez upadku i dyskwalifikacji. Jedna klatka wybicia jest warta kilka metrów: to cecha fizyki
gry, a nie skoczni, więc okno liczy się w klatkach.

Najlepszy cel wybicia znajduje `takeoffAimSearch`, z lotem i lądowaniem wytrenowanego gracza bez szumu. Odległość w funkcji celu rośnie o 5-7 m na klatkę do jednego
szczytu i za nim spada (z urwiskiem około 6 klatek za wcześnie), więc wyszukiwanie zaczyna od najlepszego celu
poprzedniego ziarna (dla pierwszego od 14 klatek) i idzie w obie strony, aż na danej stronie dwa cele z rzędu
wypadną ponad 3 m poniżej najlepszego albo skończą się upadkiem; strona, na której pojawia się nowy najlepszy,
idzie dalej, więc najlepszy na brzegu poszerza wyszukiwanie. Zakres celów to od -10 do 30 klatek. Na skoczni
Ćwiczebna wyszukiwanie zajmuje 7-9 skoków na ziarno zamiast 41. Test porównuje je z przeglądem wszystkich 41 celów
(`src/hills/test-support/full-aim-sweep.ts`) na 8 ziarnach: najlepsza odległość, najlepszy cel i okno są równe.

### Klasy wiatru

Wiatr startowy skoku zależy tylko od ziarna (`createStartWind`, wołane przez `startTrainingJump`), więc próba
wybiera ziarna według wiatru, zanim skok się zacznie. `windClassSeeds` czyta wiatr startowy 256 kolejnych ziaren
i dla każdej klasy (`WIND_CLASSES`) bierze ziarna o najwyższej ocenie, od najsilniejszego, bez powtórzeń między
klasami (klasy wybierane w tej kolejności):

- `head`: najsilniejszy wiatr czołowy, najbardziej ujemna składowa wzdłuż skoczni (`xMPerS`);
- `calm`: cisza, najmniejsza prędkość (`speedMPerS`);
- `tail`: najsilniejszy wiatr w plecy, najbardziej dodatnia składowa wzdłuż skoczni;
- `variable`: wiatr najbardziej zmienny, największa skala błądzenia losowego w czasie skoku (`variabilityMPerS`).

Na ziarnach 1-256 są to na przykład `head` 122, 253, 23, 125 (składowa -4,5 m/s), `calm` 182, 185, 27, 226
(0,04-0,53 m/s), `tail` 138, 202, 234, 10 (+4,5 m/s), `variable` 14, 33, 235, 102 (zmienność 0,44-0,47). Wiatr
czołowy niesie dalej: najlepszy skok przy nim to około 100 m, przy wietrze w plecy około 86 m.

### Próba

Reguły są mierzone na zasianych skokach. Próba (`PLAY_SAMPLE`):

- 16 ziaren na klasę wiatru (razem 64), na których skacze każdy poziom gracza i bot bez błędów (sam wiatr);
- 4 najsilniejsze ziarna na klasę (razem 16) w wyszukiwaniu celu wybicia;
- najsilniejsze ziarno każdej klasy (razem 4) dla wyroczni, do 60 skoków każde;
- 12 skoków zaprojektowanych na najsilniejszym ziarnie każdej klasy (razem 48);
- 16 skoków z losowym sterowaniem (ziarna od 1) jako dodatkowe sprawdzenie na ślepo.

Każda klasa jest więc w każdej części próby w równej części. `PlaySample` przyjmuje pierwsze ziarno przeglądu
wiatru i skoków losowych, więc tę samą ocenę można powtórzyć na rozłącznej próbie. Jedna ocena to około 580
skoków i około 5,3 s na tej maszynie, z czego wyrocznia 141 skoków i około 1,3 s (bez wyroczni około 440 skoków
i 4 s, a jeszcze wcześniej 976 skoków i 7,8 s).

### Skoki zaprojektowane

`DESIGNED_SCENARIOS`: skok dobrego gracza bez błędów przy celu z wyszukiwania (mediana najlepszych celów), w każdym
jedna rzecz zmieniona: wybicie dużo za wcześnie (20 klatek), wcześnie (4), późno (-4 klatki), bez wybicia; poza
w locie pochylona (kąt ciała 0,6 rad), wyprostowana (0 rad), zmieniana co 35 klatek (w pozostałych skokach lot
prowadzi wytrenowana polityka, a lądowanie przychodzi na 1,8 m); lądowanie wcześnie (8 m nad
zeskokiem), na dwie nogi (tylko prawy przycisk), bez lądowania; do tego jeden skok późny, ze zmienną pozą i bez
lądowania. Każdy skok ma nazwę `<klasa>/<scenariusz>` (skoki losowe `random/<ziarno>`), a komunikat reguły podaje
nazwę skoku, który ją złamał. Na skoczni Ćwiczebna upadają skoki bez wybicia (`fallType` 5) i bez lądowania
(`fallType` 4); skoki losowe kończą się dyskwalifikacją z upadkiem typu 2, 3 albo 4.

Reguły:

- `bot-unreliable`: skocznia powyżej K120 nie przechodzi kontroli, bo wytrenowany gracz trzyma się blisko wyroczni
  tylko do tej wielkości (porównanie wyżej), a wyżej wynik zależy od bota, nie od skoczni;
- `takeoff-window`: mediana okna wybicia po ziarnach przeglądu co najmniej 2 klatki, żeby nie trzeba było trafić
  jednej klatki;
- `takeoff-window-share`: okno co najmniej 2 klatki na co najmniej 75% ziaren przeglądu. Okno 1 klatki zdarza się
  od czasu do czasu na każdej skoczni (krawędź progu wypada przy danym wietrze między dwiema klatkami), więc
  minimum z kilku ziaren przechodziło albo oblewało przypadkiem: na skoczni Ćwiczebna minimum z 4 ziaren wynosiło
  3 klatki na pięciu rozłącznych zbiorach i 1 klatkę na szóstym;
- `takeoff-clean`: każde ziarno przeglądu ma co najmniej jedno czyste wybicie (okno co najmniej 1 klatka), bo
  wiatr, przy którym nie da się czysto wybić, byłby nieuczciwy;
- `good-median`: mediana dobrego gracza od K-20 do K+10 m, żeby skocznia skakała się na swój rozmiar;
- `levels-ordered`: mediany rosną od słabego przez średniego do dobrego, bo umiejętność ma się opłacać;
- `skill-wins`: dobry skacze dalej od średniego w co najmniej 70% par skoków przy tym samym wietrze;
- `good-falls-in-class`: dobry gracz nie upada w żadnej klasie wiatru;
- `fall-rate`: średni gracz przewraca się (lub jest dyskwalifikowany) najwyżej w 10% skoków, dobry najwyżej w 3%.
  Próg średniego jest luźniejszy niż wcześniejsze 5% (przy 32 skokach): bot średni ląduje z rozrzutem wysokości
  lądowania 0,5 m, więc pojedynczy upadek to błąd bota, a nie skoczni, a przy 5% jeden upadek więcej odwracał
  werdykt (na skoczni Ćwiczebna 0, 1 i 1 upadek na 32 w trzech rozłącznych zbiorach). Dobry gracz prawie nigdy
  nie powinien upaść. Skocznia Ćwiczebna spełnia także dawne 5%;
- `best-short`: mediana najlepszych skoków (po ziarnach wiatru) co najmniej K-10 m, inaczej skoczni nie da się
  doskoczyć do K; mediana, a nie najgorsze ziarno, żeby jeden silny wiatr czołowy nie oblał uczciwej skoczni;
- `best-past-landing-area`: najdłuższy z najlepszych skoków wyroczni (po jednym na najsilniejszym ziarnie każdej
  klasy wiatru), czyli skok w najkorzystniejszej klasie (komunikat ją podaje; na skoczni Ćwiczebna to wiatr czołowy,
  102,5 m przy końcu strefy na 120,8 m), najwyżej 5 m za końcem strefy lądowania, żeby nikt jej nie przeskoczył.
  Wcześniej mierzyło to wyszukiwanie celu wybicia, które zmieniało tylko cel, a wyrocznia szuka też lotu
  i lądowania;
- `flight-time`: mediana lotu dobrego gracza co najmniej 2,5 s, żeby był to prawdziwy lot;
- `flight-height`: 90. centyl największej wysokości nad zeskokiem najwyżej 8 m, bo skoczek leci blisko stoku;
- `takeoff-speed`: prędkość na progu od 50 do 120 km/h, w zakresie skoczni narciarskich;
- `wind-spread`: odchylenie standardowe odległości bota bez błędów przy stałym celu (sam wiatr) najwyżej 8% K,
  bo ten sam wiatr niesie dalej w dłuższym locie (na skoczni Ćwiczebna zmierzono 5,5% K);
- `stress-ends`, `stress-finite`: skoki zaprojektowane i losowe kończą się przed limitem klatek i dają skończone
  liczby;
- `stress-within-scene`: każdy z nich zatrzymuje się przed 380 m, gdzie kończy się scena;
- `stress-below-terrain`: punkt skoczka schodzi najwyżej 0,5 m pod teren (na skoczni Ćwiczebna zmierzono 0 m).

### Stabilność werdyktu

Reguła liczona z próby musi dać ten sam werdykt na innej próbie, inaczej mierzy próbę, a nie skocznię. Test
w `src/hills/hill-play.stability.test.ts` ocenia każdą skocznię własną na trzech rozłącznych zbiorach ziaren
(przegląd wiatru 1-256, 257-512, 513-768; skoki losowe 1-16, 17-32, 33-48) i wymaga tej samej listy reguł
niespełnionych na każdym z nich.

Kontrole mają dwa poziomy. Zwykłe uruchomienie testów (i bramka przed PR) ocenia każdą skocznię własną raz,
na próbie opisanej wyżej; `corepack pnpm test src/hills` trwa około 9 s. Test stabilności trwa około 17 s na
skocznię, więc ma osobne polecenie, `corepack pnpm test:hills-stability` (zmienna `HILL_STABILITY=1` dołącza
plik, który `vite.config.ts` poza nią pomija). CI uruchamia je w zadaniu `checks`, gdy zmiana dotyka
`src/hills/`, `src/sim/`, `src/game/`, workflow, `package.json` albo `vite.config.ts`, a także gdy nie da się
ustalić, co się zmieniło (ręczne uruchomienie, brak poprzedniego commita).

### Równe szanse

- Te same wejścia dają ten sam wynik na każdym urządzeniu: test sprawdza, że skok z tym samym ziarnem, graczem
  i szumem daje ten sam skrót stanu końcowego, a z innym ziarnem inny.
- Umiejętność ma ważyć więcej niż wiatr: dobry gracz wygrywa ze średnim w większości par, a sam wiatr przesuwa
  skok o ograniczoną liczbę metrów.
- Żadna skocznia nie może wymagać trafienia jednej klatki: okno wybicia ma zwykle co najmniej 2 klatki, a przy
  każdym wietrze da się wybić czysto.
- Żadna skocznia nie może pozwolić dobremu skoczkowi wylądować za strefą lądowania.

Jedna klatka wybicia (1/70 s) jest warta kilka metrów odległości. To cecha fizyki gry, wspólna dla wszystkich
skoczni, a nie wada konkretnej skoczni.

## Kontrole obrazu

Testy obrazu (`src/render`), które mówią coś o rysowaniu skoczni, przechodzą przez wszystkie skocznie własne
(`OWN_HILLS`). Liczby biorą z danych skoczni: punkt K z `kPointM`, chwile wybicia jako udział klatek od startu
rozbiegu do progu, miejsca z profilu. Nowa skocznia dostaje je bez zmian w testach.

- ruch obrazu (`scene-motion.test.ts`): rekwizyty, końce linii odległości, ptaki i księżyc trzymają się swoich
  miejsc przez cały skok bota, bo każda skocznia ma inne miejsca tych rzeczy;
- rekwizyty i linie (`scene-props.test.ts`, `scene-layers.test.ts`): rękawy, maszty, lampy rozbiegu i linia K
  stoją na swoich powierzchniach i w swojej odległości, liczone z profilu tej skoczni;
- sceneria (`scene-scenery.test.ts`): drzewa, ptaki, księżyc i światło reflektorów na danych tej skoczni, bo ziarno
  drzew i profil zmieniają ich miejsca;
- sceneria z dala od toru: żadne drzewo nie stoi na płaszczyźnie skoczka ani przed nią (drzewa są tylko na
  warstwach za dalszą krawędzią zeskoku, z samej konstrukcji), a podpory rozbiegu kończą się najdalej na progu,
  bo za nim stałyby w zeskoku;
- figura skoczka (`jump-view.test.ts`): każda faza skoku rysowana bez pustych pikseli, figura na śniegu i w korycie
  rozbiegu przy wybiciu za wcześnie, wcześnie, tuż przed progiem i bez wybicia, bo te przypadki zależą od długości
  rozbiegu;
- tytuł (`jump-view.test.ts`): w najwęższym obrazie (256 px) i przy przycisku pauzy przesuwającym tytuł najdalej
  w prawo cały napis jest w obrazie i żaden jego piksel nie leży w kolumnach okna wiatru i światła startu;
  sprawdza to rysunek, a nie tylko szerokość liczoną przy kontroli formatu;
- budżet czasu klatki (`frame-time.budget.test.ts`): rysowanie najszerszego obrazu tej skoczni mieści się
  w budżecie, bo sceneria każdej skoczni rysuje się inaczej;
- migawka pikseli (`jump-view.pixels.test.ts`): pierwsza skocznia ma pełny zestaw, każda następna własne klucze
  (momenty skoku z telemarkiem, 356 px, dzień, zmierzch i noc, bez śniegu i mgły); test na kopii skoczni z innym
  niebem i drzewami sprawdza, że inny wygląd daje inne klatki.

Testy, którym wystarcza dowolna skocznia (pasek, podpowiedzi, teksty, menu, dźwięk, powtórki, zapis), zostają na
pierwszej skoczni własnej, żeby nie mnożyć czasu testów.

## Podobieństwo skoczni

`src/hills/hill-likeness.ts` mierzy, jak bardzo dwie skocznie są do siebie podobne, wyłącznie z ich danych.
`hillShape` opisuje skocznię kilkoma liczbami: punkt K, spadek zeskoku poniżej progu w 12 równych odstępach
poziomych od progu do końca obszaru lądowania (jako część K, więc skocznie różnej wielkości dają się porównać),
długość poziomą tego odcinka jako część K, spadek rozbiegu, kąt progu i wysokość progu nad zeskokiem. Wygląd
(niebo, teren, drzewa, podpory, ogrodzenia) się nie liczy: skocznia przemalowana to ta sama skocznia.

`hillDistance` to średnia kwadratowa różnic tych składników, każdej podzielonej przez skalę z `LIKENESS_SCALES`
(10 m punktu K, 0,02 K spadku zeskoku, 0,05 K długości zeskoku, 5 m spadku rozbiegu, 1° kąta progu, 0,5 m wysokości
progu). Skala to różnica, którą skoczek odczuwa na skoczni, więc żaden składnik nie przeważa samą jednostką;
punkty zeskoku tworzą jeden składnik, żeby profil nie przeważał liczbą punktów. Odległość wynosi 0 dla tej samej
skoczni i jest symetryczna.

Skocznie bliższe niż `LIKENESS.tooAlike` (0,4) uznaje się za tę samą skocznię: kopia skoczni oryginału zostaje
odrzucona, podobnie jak skocznia zbyt bliska już opublikowanej. Ponieważ każda skala to w przybliżeniu najmniejsza
różnica, którą skoczek odczuwa, odległość poniżej 1 to różnica ledwie odczuwalna, a poniżej progu praktycznie żadna.
Próg leży z zapasem poniżej odległości dwóch najbliższych różnych skoczni oryginału, więc te liczą się jako różne.
Przesuwanie liczb profilu o procent ich wartości nie sprawdza kopii: 1% bezwzględnej wysokości przesuwa próg
skoczni o metry, co daje już inną skocznię do skakania, ocenianą przez pozostałe reguły jak każda nowa.

### Porównanie ze skoczniami oryginału

`src/hills/original-hills.local.test.ts` porównuje skocznie własne ze skoczniami oryginału odczytanymi z plików
gracza. Działa tylko z ustawionym `DSJ2_GAME_DIR` (jak testy porównawcze), nigdy w CI; z ustawioną zmienną i bez
plików kończy się błędem, a nie pominięciem. Nic odczytanego z plików gry nie trafia do repozytorium ani na dysk.
Sprawdza, że żadna skocznia własna nie jest za bardzo podobna do skoczni oryginału, że każda gra w zakresie
skoczni oryginału o punkcie K w granicach 15 m od swojego (najlepsza odległość i mediana dobrego gracza względem K,
prędkość na progu, czas lotu, okno wybicia, rozrzut od wiatru jako część K; zakres poszerzony o margines
rozrzutu pomiaru), że skocznie oryginału przechodzą kontrolę formatu oraz że wytrenowany gracz trzyma się marginesu
wyroczni na skoczniach do granicy `botReliableMaxKPointM` (porównanie z wyrocznią wyżej; tabelę przedziałów podaje
komunikat, gdy test nie przechodzi). Całość trwa około 2,5 minuty.

```sh
DSJ2_GAME_DIR=<katalog gry> corepack pnpm test src/hills/original-hills.local.test.ts
```

## Odcisk geometrii i identyfikator

`hillFingerprint` (`src/hills/hill-fingerprint.ts`) to skrót FNV-1a (32 bity, 8 cyfr szesnastkowych) z punktu K
i 20 liczb zbudowanego profilu, każdej jako 4 bajtów wartości pojedynczej precyzji (little-endian). Wygląd do
niego nie wchodzi. Test przypina odcisk każdej skoczni własnej. Zmiana geometrii oznacza nowy identyfikator,
a stary trafia do `RETIRED_OWN_HILL_IDS` (`src/game/hill-choice.ts`): rekordy i powtórki zostają przy starym
kształcie i nigdy nie spotykają nowego.

Skocznia „Ćwiczebna” ma obecnie identyfikator `own-3`; `own-1` i `own-2` to jej wcześniejsze kształty. Na `own-2`
rozbieg był krótszy (`startXM` 11,4 i `flatEndXM` 10 zamiast 10,6 i 9,2) i najlepszy skok lądował w okolicy punktu
K; na `own-3` ląduje kilka metrów za nim, jak na skoczniach podobnej wielkości.

## Dodanie skoczni

1. Skopiować dane istniejącej skoczni w `src/hills/own-hills.ts`, nadać nowy `id` i nazwę, zmienić liczby.
2. `corepack pnpm test src/hills`: format, reguły geometrii, kontrole symulacją i odcisk (nowy odcisk dopisać do tabeli w teście);
   potem `corepack pnpm test:hills-stability`: ten sam werdykt na rozłącznych próbach.
3. `corepack pnpm test src/render`: kontrole obrazu; nowe klucze migawki pikseli dla nowej skoczni zapisuje
   `corepack pnpm test -u src/render/jump-view.pixels.test.ts`, a w diffie mają się pojawić tylko one.
4. Przejrzeć migawkę pikseli i testy przeglądarkowe, które wskazują skocznię wbudowaną (`e2e/support/app.ts`;
   czasy naciśnięć w `e2e/support/jump-timing.ts` zmierzono na tej skoczni; test
   `src/game/scripted-jump-timing.test.ts` sprawdza, że nadal dają czyste lądowanie z zapasem 0,1 s).
5. Skoczyć na komputerze i na telefonie.
6. Podnieść wersję jak przy każdej zmianie gry.
