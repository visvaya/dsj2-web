# Testy

## Rodzaje testów

| Plik | Co sprawdza | Gdzie działa |
|---|---|---|
| `src/sim/*.test.ts` | testy jednostkowe (generator, profil skoczni, funkcje deterministyczne) | wszędzie |
| `src/sim/jump-sim.regression.test.ts` | pełny skok na syntetycznej skoczni ze skryptowanym wejściem; wyniki i skrót stanu z każdej klatki w migawce; sprawdza też, że krok symulacji nie zmienia stanu, który dostał | wszędzie, także w CI |
| `src/sim/*.golden.test.ts` | porównanie z oryginalną grą klatka po klatce | tylko z plikami gry i śladami |
| `src/render/jump-view.pixels.test.ts` | skróty wszystkich pikseli całych klatek (14 momentów skoku, pory dnia, pogoda, szerokości widoku) w migawce | wszędzie, także w CI |
| `src/sim/test-support/replay-plan.test.ts` | plan powtórki: wejście skryptowanego gracza na syntetycznej skoczni wraca z planu klatka w klatkę | wszędzie, także w CI |
| `src/original/test-support/fall-search.test.ts` | wyszukiwanie upadków na syntetycznej skoczni: każdy znaleziony plan odtworzony w porcie daje swój typ upadku | wszędzie, także w CI |
| `src/sim/test-support/dsj-trace.test.ts` | odczyt i wyszukiwanie śladów (zwykłych i gzip) na małych, sztucznych śladach | wszędzie, także w CI |
| `tools/re/test_tools.py` | narzędzia analizy (FPU, kodek powtórek, powtórka z planu, zapis śladów) | wszędzie |
| `src/game/touch-landing.test.ts` | skok polami dotykowymi krokowany jak na ekranie skoku: w locie pole L tylko pochyla, pole P zaczyna telemark, nowe dotknięcie L kończy jego przygotowanie, a oba pola naraz lądują na dwie nogi; klawiatura i mysz bez zmian | wszędzie, także w CI |
| `src/render/frame-time.budget.test.ts` | czas kroku symulacji i rysowania najszerszego obrazu wobec budżetu (opis w „Pomiar wydajności”) | wszędzie, także w CI |
| `src/pwa/*.test.ts` | stan trybu offline i rejestracja service workera na atrapach przeglądarki; obrazek ikon | wszędzie, także w CI |
| `scripts/**/*.test.mjs` (`pnpm test:scripts`) | reguły pakietu i wydania, plik nagłówków, serwer testów, kontrola wdrożenia, ikony i manifest; service worker uruchamiany na atrapach cache i sieci (instalacja, odmowy, brak miejsca, aktywacja, obsługa żądań) | wszędzie, także w CI |
| `e2e/*.spec.ts` | zbudowana gra w prawdziwych przeglądarkach (Playwright), opis niżej | CI: Chromium, Firefox, WebKit; lokalnie: Edge |
| `e2e/perf/*.perf.ts` (`pnpm test:browser:perf`) | czas klatek na spowolnionym procesorze, pamięć po serii skoków, czas startu (opis w „Pomiar wydajności”) | CI: Chromium; lokalnie: Edge |

Testy porównawcze („golden”) są pomijane tylko wtedy, gdy nie ustawiono żadnej ze zmiennych opisanych niżej (tak
działa CI). Po ustawieniu zmiennej brak pliku, który ona zapowiada, kończy test błędem z nazwą brakującego pliku.
Ślady i pliki gry nie trafiają do repozytorium.

Celowa zmiana wyglądu wymaga odświeżenia migawki pikseli: `pnpm test -u src/render/jump-view.pixels.test.ts`.
Diff migawki pokazuje, które sceny się zmieniły; zmiana w scenie, której nie dotyczyła praca, to błąd.

## Pomiar wydajności

Tryb diagnostyczny włącza klucz `diag` w adresie strony (`https://adres-gry/?diag`; wartość klucza nie ma
znaczenia). Adres jest czytany raz, przy wczytaniu strony; tryb nie ma przełącznika w ustawieniach i niczego nie
zapisuje. Bez niego pętla skoku nie mierzy niczego.

W trybie diagnostycznym w lewym dolnym rogu obszaru obrazu widać nakładkę odświeżaną raz na sekundę:

| Linia | Znaczenie |
|---|---|
| `60.0 kl./s` | klatki na sekundę, policzone z mediany odstępu klatek |
| `klatka 16.7 / 17.0 / 33.4 ms` | odstęp między klatkami według zegara klatek przeglądarki: mediana / 95. percentyl / maksimum |
| `sym. 0.1 / 0.2 / 0.6 · rys. 1.2 / 1.6 / 4.0 ms` | czas wszystkich kroków symulacji w klatce oraz czas rysowania do bufora i wysłania obrazu na canvas, w tym samym układzie |
| `zgubione kroki 0.0 · długie klatki 0` | czas, którego gra nie nadrobiła (ponad 8 kroków na klatkę), przeliczony na kroki 1/70 s, oraz liczba klatek z odstępem ponad 50 ms |

Rozkłady pochodzą z ostatnich 4096 klatek, liczniki są od wejścia na ekran skoku (kolejny skok ich nie zeruje).
Klatki zatrzymanej gry (otwarte menu) nie są liczone, a pierwsza klatka po powrocie strony z tła jest pomijana.
Przeglądarki zaokrąglają zegar strony (do 0,1 ms albo do 1 ms), więc czasy symulacji bliskie zera są przybliżone.
Te same liczby są w atrybucie `data-stats` nakładki (JSON z polami `frames`, `steps`, `droppedSteps`,
`cappedFrames`, `longFrames`, `intervalMs`, `simMs`, `drawMs`); czytają go testy przeglądarkowe.

Niezależnie od trybu strona stawia dwa znaczniki User Timing, każdy raz na wczytanie strony:
`telemark:first-screen` (pierwsza klatka animacji po pokazaniu pierwszego ekranu) i `telemark:first-jump-frame`
(pierwszy obraz skoku wysłany na canvas). Odczyt w konsoli: `performance.getEntriesByName("telemark:first-screen")`;
widać je też w zakładce wydajności narzędzi przeglądarki.

`src/render/frame-time.budget.test.ts` mierzy medianę czasu kroku symulacji (skoki na skoczni wbudowanej, paczki
po 100 kroków) i medianę czasu rysowania obrazu 432 x 200 i porównuje je z budżetami ustawionymi na dziesięciokrotność
pomiaru z dnia i maszyny podanych w pliku. To potykacz na regresję o rząd wielkości (pętla w pętli, alokacja na
piksel), nie gwarancja płynności: czas w Node na komputerze nie mówi, ile klatek gra ma na telefonie. Działanie
nakładki i znaczników (nie wydajność) sprawdza `e2e/diagnostics.spec.ts`.

### Pomiary w przeglądarce

Dwa zestawy mierzą zbudowaną grę w przeglądarce i porównują wynik z budżetem.

**Pierwsze wejście** (`e2e/first-visit.spec.ts`, część zwykłego zestawu, profile komputera w trzech silnikach).
Test stawia własny serwer na `dist/`; serwer zapisuje dla każdego żądania status i liczbę bajtów ciała faktycznie
wysłanych, po kompresji (304 i HEAD to 0 bajtów; żądanie bez odpowiedzi nie ma tych pól). Dwa punkty pomiaru:

- pierwszy ekran: żądania samej strony do chwili, gdy menu stoi, a sieć ucichła. Strona rejestruje service
  workera zaraz po pokazaniu menu i jego żądania mieszałyby się z jej własnymi, więc ten punkt jest mierzony
  w osobnym profilu przeglądarki, w którym worker nie może się zarejestrować;
- gra gotowa bez sieci: wszystkie żądania świeżego profilu do komunikatu „Gotowe do gry bez internetu.”.

Test liczy też pliki, których pełne ciało serwer wysłał więcej niż raz. Worker pobiera przy instalacji każdy plik
wydania w trybie `no-cache`: pamięć przeglądarki może odpowiedzieć dopiero po zapytaniu serwera. W Chromium
i w Firefoksie przeglądarka pyta wtedy warunkowo i dostaje 304 dla tego, co strona już pobrała, więc żaden plik
nie idzie dwa razy, i test tego pilnuje. WebKit z testów przeglądarkowych nie odpowiada workerowi ze swojej
pamięci: strona, manifest, skrypt i arkusz stylów idą w całości drugi raz (zmierzone 2026-10-13 w CI: 268 840
bajtów do gotowości bez sieci zamiast 142 275). Test dopuszcza tam tę jedną dodatkową kopię i nic ponad nią.
Czy Safari na telefonie robi to samo, nie zostało zmierzone. Budżety i zmierzone wartości każdego silnika:
`FIRST_VISIT_BUDGET` i stałe obok niego w pliku testu.

**Czas i pamięć** (`e2e/perf/*.perf.ts`, osobny tryb, tylko Chromium). Testy czasu nie mogą biec obok innych
testów, bo zajęta maszyna gubi kroki symulacji; zmienna `BROWSER_TESTS_PERF` przełącza więc konfigurację na jeden
projekt `perf-chromium`, jeden test naraz, z własnym raportem (`playwright-report-perf/`) i katalogiem wyników
(`test-results-perf/`). Bez tej zmiennej pliki `*.perf.ts` nie są uruchamiane.

```sh
pnpm test:browser:perf        # przeglądarka Playwrighta (tak działa CI)
pnpm test:browser:perf:edge   # lokalnie: Microsoft Edge z systemu
```

| Plik | Co mierzy |
|---|---|
| `jump-frames.perf.ts` | jeden cały skok w trybie `?diag` przy procesorze spowolnionym 4 razy (`Emulation.setCPUThrottlingRate`) i, dla porównania w tym samym logu, trzy skoki bez spowolnienia (miarą jest środkowy): zgubione kroki, długie klatki, 95. percentyl odstępu klatek, czasu symulacji i rysowania (z `data-stats`) oraz liczba i najdłuższe z długich zadań (`PerformanceObserver`, `longtask`) od początku skoku |
| `jump-cycles.perf.ts` | po 3 cyklach rozgrzewki 20 cykli „nowy skok z menu, wyjście do menu głównego, ponowne wejście na skocznię” (w co drugim skok biegnie sekundę); przed i po: sterta po wymuszonym odśmiecaniu, liczba nasłuchów zdarzeń, węzłów i dokumentów. Nasłuchy i węzły są miarą pewniejszą od sterty: ich przyrost to wyciek |
| `start-times.perf.ts` | czas od początku nawigacji do `telemark:first-screen` przy pierwszym wejściu (procesor spowolniony 4 razy, sieć jak „Slow 4G” w Lighthouse: opóźnienie 150 ms, 1,6 Mb/s w dół, 750 kb/s w górę) i przy ponownym, gdy odpowiada service worker (tylko procesor); czas od naciśnięcia skoczni na liście do `telemark:first-jump-frame`. Po 5 prób, miarą jest mediana |

Budżety są w jednym obiekcie `PERF_BUDGET` (`e2e/perf/perf-budget.ts`); przy każdej liczbie jest data, maszyna
i zmierzone wartości. Czasy i liczniki zależne od obciążenia mają ok. trzykrotność mediany z trzech lokalnych
przebiegów, bo maszyna CI jest inna i współdzielona. Liczniki, które w każdym przebiegu były takie same (przyrost
nasłuchów i węzłów: zero; klatki ze zgubionym czasem bez spowolnienia: najwyżej jedna), mają budżet równy
pomiarowi.

Każdy pomiar, także w teście, który przeszedł, trafia do wyjścia przebiegu jako jedna linia zaczynająca się od
`PERF ` z obiektem JSON (`measure` to nazwa pomiaru, `project` to projekt Playwrighta, dalej surowe wartości,
w tym wszystkie próby) i jako załącznik `<nazwa>.json` w raporcie HTML. Odczyt z logu: `grep '^PERF ' <log>`.

Wynik z dnia ustawienia budżetów (2026-10-13, laptop z Intel Core i7-6700HQ, Edge 155 bez okna): przy procesorze
spowolnionym 4 razy gra pokazuje 20 klatek na sekundę zamiast 60, bo samo rysowanie klatki trwa wtedy 35 do 40 ms
(mediana) przy odstępie 16,7 ms, i gubi 20 do 35 kroków symulacji na skok. Bez spowolnienia trzyma 59,9 klatki
na sekundę; jedyną klatką, która bywa spóźniona o ponad 114 ms i gubi wtedy od 1 do 5 kroków, jest ta przy
pierwszym naciśnięciu na obrazie (jedno zadanie 85 do 130 ms, raz 187 ms, ok. 0,2 s po otwarciu ekranu skoku).

Ten sam zestaw na maszynie CI tego samego dnia (jeden przebieg, Chromium z Playwrighta na Linuksie): maszyna jest
około 2,5 razy szybsza od tamtego laptopa (rysowanie 2,4 do 2,7 ms bez spowolnienia), więc przy procesorze
spowolnionym 4 razy gra trzyma tam 59,9 klatki na sekundę (rysowanie 11,4 ms, mediana) i nie gubi kroków,
a zadania przy pierwszym naciśnięciu nie ma wcale. Budżety ustawione z laptopa są więc w CI luźne: przebieg w CI
łapie regresję rzędu wielkości, a stan „20 klatek na sekundę” widać tylko na wolniejszej maszynie.

Czego te pomiary nie mówią:

- spowolniony procesor to nie telefon: emulacja wydłuża pracę głównego wątku strony, nie naśladuje układu
  graficznego, pamięci ani przegrzewania; płynność na urządzeniu sprawdza się na urządzeniu;
- czasu, pamięci i długich zadań nie mierzy się w Firefoksie i WebKicie (sterowanie procesorem i odczyt sterty
  idą przez protokół Chromium); te silniki mają tylko pomiar pierwszego wejścia;
- liczby pochodzą z jednej maszyny, a budżet z mnożnikiem 3 łapie regresję kilkukrotną, nie kilkunastoprocentową;
  mniejsze zmiany widać tylko przez porównanie linii `PERF ` z dwóch przebiegów na tej samej maszynie.

## Testy w przeglądarkach

`pnpm test:browser` uruchamia Playwright na zbudowanej grze, nie na serwerze deweloperskim. Katalog `dist/` podaje
`scripts/serve-dist.mjs` (port 4317) tak, jak robi to hosting: z nagłówkami z `public/_headers`, w tym z polityką
bezpieczeństwa treści, z prawdziwym 404 dla nieznanej ścieżki i z service workerem, który rejestruje się jak
u gracza. Każdy test zaczyna od czystego kontekstu przeglądarki i kończy się błędem, gdy którakolwiek strona tego
kontekstu zgłosi nieobsłużony wyjątek albo wypisze błąd na konsoli. Test, który celowo coś psuje (brak skryptu,
brak pliku workera), podaje wzorzec oczekiwanego komunikatu przez `test.use({ expectedProblems })`; inne błędy
nadal go oblewają. Środowisko jest ustalone w `playwright.config.ts`: język `pl-PL`,
strefa `Europe/Warsaw`, ciemny schemat kolorów, ograniczony ruch.

Projekty (profile urządzeń):

| Projekt | Profil | Silnik |
|---|---|---|
| `desktop-chromium`, `desktop-firefox`, `desktop-webkit` | okno 1280x720, mysz i klawiatura | Chromium, Firefox, WebKit |
| `android-portrait`, `android-landscape` | Pixel 7 | Chromium |
| `iphone-portrait`, `iphone-landscape` | iPhone 14 | WebKit |
| `tablet-landscape` | iPad (7. generacji) | WebKit |

Co sprawdzają pliki w `e2e/`:

| Plik | Co sprawdza | Projekty |
|---|---|---|
| `smoke.spec.ts` | strona po polsku, przejścia menu, lista skoczni, skok i z powrotem; obraz narysowany, kwadratowe piksele gry, obraz dochodzi do krawędzi swojego obszaru także w oknie, brak przewijania na ekranie skoku | wszystkie |
| `jump.spec.ts` | cały skok wejściem urządzenia (przyciski myszy albo pola dotykowe), komunikat rekordu razem z odległością (przed notami), rekord na liście skoczni i w zapisie, także po przeładowaniu | wszystkie |
| `touch-layout.spec.ts` | pola L i P: co najmniej 44 px, poza obrazem, obok obrazu w poziomie i pod nim w pionie; przycisk pauzy | telefony i tablet |
| `tilt-controls.spec.ts` | tryb przechyłu: pól L i P nie ma, dwie połowy ekranu są przyciskami i pokrywają cały ekran, obraz nie jest mniejszy (w poziomie szerszy), przycisk pauzy leży nad nimi, dotknięcie prawej połowy zaczyna skok (pierwszy kciuk to lewy przycisk) | telefony i tablet, gdzie przeglądarka daje czujnik ruchu bez pytania |
| `keyboard.spec.ts` | menu, lista skoczni, strój i ekran skoku samą klawiaturą: kolejność Tab, widoczny fokus, Enter i spacja; na ekranie skoku Esc otwiera menu (fokus na „Wróć do gry”) i je zamyka (fokus wraca na przycisk pauzy), instrukcja otwiera się w menu i przejmuje fokus, wyjście do listy skoczni jest pozycją menu | komputer |
| `a11y.spec.ts` | axe, WCAG 2.2 AA, zero naruszeń na każdym ekranie; test pilnuje, że żaden ekran nie został pominięty | `desktop-chromium`, `android-portrait` |
| `settings.spec.ts` | dźwięk, sceneria i czułość bieżącego sterowania zostają po przeładowaniu | `desktop-chromium`, `android-portrait` |
| `sim-engines.spec.ts` | symulacja daje w silniku przeglądarki bit w bit wynik z migawki `jump-sim.regression.test.ts` (klatki, odległość, punkty, noty, typ upadku, skrót stanu) | komputery |
| `reflow.spec.ts` | menu, lista skoczni i strój przy szerokości 320 px i przy powiększeniu 200%: brak przewijania w bok, uciętych i nachodzących elementów; odstępy tekstu z WCAG 1.4.12; wymuszone kolory: kontrolki, kolory próbek i fokus widoczne (bez WebKita: Playwright naśladuje je tam elementem stylu, którego polityka treści strony nie dopuszcza) | komputery, `android-portrait` |
| `layout-stability.spec.ts` | zmiana ustawienia oraz otwarcie i zamknięcie pauzy nie przesuwają obrazu ani pól dotykowych (różnice w pikselach trafiają do raportu); pierwszy ekran jest od razu narysowany czcionkami gry, a przeglądarka nie pobiera ich osobno; przyciski pod obrazem na komputerze przesuwają się przy zmianie etykiety: znany błąd, `test.fixme` | wszystkie |
| `targets.spec.ts` | każda kontrolka spełnia WCAG 2.5.8 (24 na 24 px albo odstęp) i nic jej nie zasłania; przy otwartej pauzie fokus klawiatury nie wchodzi pod nią | wszystkie; fokus: dotykowe |
| `input.spec.ts` | oba przyciski myszy jako akord w obu kolejnościach naciśnięcia i puszczenia; naciśnięcie krótsze niż krok symulacji; jedno Esc wychodzi ze skoku | komputery |
| `interruption.spec.ts` | obrót telefonu w trakcie skoku: poprawny układ i skok do końca; ukrycie strony: test pomija się sam, bo żaden silnik uruchamiany przez Playwrighta nie ukrywa strony | telefony; ukrycie: brak |
| `sound.spec.ts` | żaden kontekst audio nie działa przed pierwszym gestem, jeden po nim; wyłączony dźwięk to cisza na wyjściu, także po przeładowaniu (`AudioContext` obserwowany z testu) | wszystkie |
| `player-files.spec.ts` | plik, który nie jest grą: komunikat po polsku, nic nie zostaje zapisane, skocznia wbudowana dostępna | wszystkie |
| `page-basics.spec.ts` | osobny tytuł strony dla każdego ekranu; tło ustawione na `html`; nowy ekran otwiera się od góry, bez pozycji przewinięcia poprzedniego | wszystkie |
| `version.spec.ts` | menu główne i menu skoku pokazują numer wersji z `package.json`, a `release.json` podaje ten sam | wszystkie |
| `first-visit.spec.ts` | pierwsze wejście: liczba żądań i bajty do pierwszego ekranu i do gotowości bez sieci wobec budżetu; w Chromium i Firefoksie żaden plik nie jest pobierany w całości dwa razy, w WebKicie najwyżej raz więcej (opis w „Pomiar wydajności”) | komputery (trzy silniki) |
| `offline.spec.ts` | po jednej wizycie gra startuje i daje się rozegrać bez sieci (cały skok, rekord po przeładowaniu); pierwsza wizyta bez sieci nie daje gry; nowe wydanie czeka, dopóki otwarte jest choć jedno okno, potem przejmuje stronę, a zapis zostaje; wydanie z brakującym albo uszkodzonym plikiem i wydanie podmienione w trakcie pobierania nie zostawiają żadnej części i nie ruszają działającego; wycofanie do starszego wydania dociera do gracza z nowszym; po przejęciu przez nowe wydanie strona poprzedniego nadal dostaje swój skrypt, a poprzednie wydanie znika dopiero po starcie strony nowego; brak skryptu przy pierwszej wizycie zostawia tekst z linkiem, bez pętli przeładowań | komputery (trzy silniki) |
| `http-policy.spec.ts` | serwer testów przechodzi tę samą kontrolę co wdrożenie (`scripts/check-deployment.mjs`); polityka treści, typy i reguły cache strony, workera, manifestu i licencji; strona nie blokuje powiększania | `desktop-chromium` |
| `single-file.spec.ts` | strona jednoplikowa nie pobiera niczego poza sobą, nie rejestruje workera także pod bezpiecznym adresem, działa bez sieci i w ramce | komputery |
| `safe-area.spec.ts` | przy ustawionych wcięciach ekranu (wartości telefonu w poziomie) żadna treść nie leży pod zasłoniętą krawędzią, na każdym ekranie | wszystkie |
| `storage-blocked.spec.ts` | przy zablokowanym magazynie gra ostrzega, działa i trzyma ustawienia do końca wizyty, bez nieobsłużonych błędów | `desktop-chromium`, `android-portrait` |

Skok trwa w czasie rzeczywistym (70 kroków symulacji na sekundę), więc test steruje nim według zegara strony,
liczonego od komunikatu „Skok rozpoczęty.” w regionie `aria-live` obok obrazu. Chwile naciśnięć leżą w środku okien
zmierzonych w symulacji na wielu ziarnach (opis w `e2e/support/jump.ts`). Skok zakończony upadkiem test powtarza,
najwyżej trzy razy, tak jak zrobiłby to gracz.

Scenariusze regresyjne symulacji są w `src/sim/test-support/regression-scenarios.ts`; korzysta z nich test Vitest
i strona testowa. Stronę buduje Vite projektu przed testami (`e2e/sim-harness.setup.ts`) do ignorowanego katalogu
`e2e/.sim-harness/`; do `dist/` nie trafia.

Testy trybu offline mają własne serwery (`scripts/lib/static-server.mjs`), po jednym na test, więc mogą odciąć
sieć, uszkodzić odpowiedź albo podstawić inne wydanie pod tym samym adresem. Dwa wydania i stronę jednoplikową
przygotowuje `e2e/releases.setup.ts` z testowanego `dist/`, krokiem wydania projektu, w ignorowanym katalogu
`e2e/.pwa-releases/`. Kontekst przeglądarki to jeden profil: zamknięcie strony i otwarcie nowej w tym samym
kontekście odpowiada zamknięciu gry i ponownemu uruchomieniu. Zapis gracza w tych testach to dane syntetyczne;
żaden plik oryginalnej gry nie bierze w nich udziału.

Wyniki axe oznaczone jako „incomplete” nie są ani naruszeniem, ani zaliczeniem: test zapisuje je do pliku
`axe-incomplete.json` w `test-results/` i dołącza do raportu.

### Lokalnie

```sh
pnpm test:browser:edge   # tylko projekty na Chromium, w zainstalowanym Microsoft Edge
```

Tryb lokalny (zmienna `BROWSER_TESTS_EDGE`) niczego nie pobiera: używa przeglądarki Edge z systemu i przed testami
buduje grę. Firefox i WebKit działają tylko w CI. `pnpm test:browser` bez zmiennej uruchamia wszystkie projekty
i wymaga przeglądarek Playwrighta (`pnpm exec playwright install chromium firefox webkit`); w CI testuje `dist/`
zbudowany przez zadanie `build`, poza CI buduje grę sam. Zmienna `BROWSER_TESTS_ENGINE` (`chromium`, `firefox`
albo `webkit`) zawęża przebieg do projektów jednego silnika. CI uruchamia równolegle zadania macierzy `browser`:
Chromium w dwóch częściach i WebKit w trzech (`--shard`, bo mają najwięcej profili), Firefox i tryb pomiarowy.
Kontrole kodu i testy jednostkowe biegną obok w zadaniu `checks`; zbiorcze zadanie `web` czeka na wszystkie.
W trybie lokalnym testy odmawiają grze przechwycenia myszy: przeglądarka bez okna potrafi mimo to zabrać kursor
całej maszyny na czas skoku. Gra działa wtedy bez przechwycenia; ścieżkę z przechwyconą myszą sprawdza CI,
o ile silnik na nią pozwala.
Raport HTML trafia do `playwright-report/`, ślady i zrzuty nieudanych testów do `test-results/` (w trybie pomiarów:
`playwright-report-perf/` i `test-results-perf/`). CI zapisuje te katalogi jako artefakty
`playwright-report-<zestaw>-<silnik>-<część>` (np. `playwright-report-browser-webkit-2`,
`playwright-report-perf-chromium-1`; 7 dni), gdy testy nie przeszły, a także wtedy, gdy test przeszedł dopiero w powtórce: przebieg jest wtedy zielony, a ślad nieudanej próby jest jedynym zapisem przyczyny.

Emulacja to nie urządzenie: profile telefonów i tabletu ustawiają rozmiar okna, gęstość pikseli, dotyk i nagłówek
przeglądarki, ale silnik pozostaje desktopowy. Żaden silnik w testach nie instaluje strony na ekranie głównym, nie
ma prawdziwych wcięć ekranu ani trybu bez paska przeglądarki; testy sprawdzają manifest, ikony i to, co układ robi
z podanymi wcięciami. Czego testy nie widzą, sprawdza się ręcznie (niżej).

### Odbiór ręczny na urządzeniu

Lista na około dziesięć minut: prawdziwy telefon (Android z Chrome albo iPhone z Safari) i jedna przeglądarka na
komputerze. Przy każdym punkcie: test, który pokrywa to automatycznie, albo „tylko urządzenie”.

| Nr | Krok | Oczekiwany wynik | Pokrycie |
|---|---|---|---|
| 1 | Otwórz stronę z adresu; na telefonie dodaj ją do ekranu głównego i otwórz stamtąd | menu po polsku, czcionka pikselowa, tytuł karty „Telemark” | `smoke.spec.ts`, `page-basics.spec.ts`; dodanie do ekranu głównego: tylko urządzenie |
| 2 | Trening, skocznia Ćwiczebna; przed dotknięciem ekranu skoku posłuchaj | cisza do pierwszego dotknięcia, potem wiatr | `sound.spec.ts`; realny głośnik: tylko urządzenie |
| 3 | iPhone: przełącznik wyciszenia włączony, potem wyłączony | dźwięk gry słychać w obu położeniach (gra ma własny wyłącznik) | tylko urządzenie |
| 4 | Pauza, „Dźwięk: wył.”, wróć do gry | cisza; po ponownym włączeniu dźwięk wraca | `sound.spec.ts` |
| 5 | Pauza, „Pochylanie: palec” | iPhone pyta o dostęp do czujnika ruchu; po zgodzie etykieta „Pochylanie: przechył”, po odmowie komunikat i pochylanie palcem | tylko urządzenie |
| 6 | Skok z pochylaniem przechyłem telefonu, w pionie i w poziomie; na belce trzymaj telefon inaczej niż w locie, w locie obracaj go powoli i szybko | pól L i P nie ma: dotknięcie ekranu zaczyna skok, dwa kciuki naraz wybijają, w locie jeden kciuk to telemark (drugi po chwili ustala jego szerokość), dwa naraz to lądowanie na dwie nogi; skoczek pochyla się o tyle, o ile obrócił się telefon, i zostaje tak, gdy telefon stoi w miejscu; cały zakres pochylenia to niecałe 9 stopni obrotu; obraz zajmuje całą szerokość i jest wyśrodkowany w pionie, a przycisk pauzy jest w lewym górnym rogu ekranu, nie da się go trafić przypadkiem przy grze, a nazwa skoczni zaczyna się obok niego, nie pod nim | układ i start dotknięciem: `tilt-controls.spec.ts`; przeliczenie obrotu na pochylenie i kolejność kciuków: `src/game/feedback.test.ts`, `src/game/player-input.test.ts`; czujnik i odczucie: tylko urządzenie |
| 7 | Android: skok z włączonymi wibracjami, potem „Wibracje: wył.” | krótka wibracja przy starcie, wybiciu i lądowaniu; po wyłączeniu brak. iPhone nie ma wibracji dla stron i nie pokazuje przycisku „Wibracje”; próba zastąpienia ich stuknięciem systemowego przełącznika nie dała odczuwalnego efektu (iPhone XS Max, iOS 18.7) | tylko urządzenie |
| 7a | Pauza, „Czułość”: zmniejsz i zwiększ, oddaj skok przy 1 i przy 10; powtórz w trybie palca i przechyłu | ten sam ruch myszy, palca albo telefonu pochyla skoczka słabiej przy 1 i mocniej przy 10 (każdy stopień to 10%); każdy sposób sterowania pamięta własną wartość, także po ponownym otwarciu gry | zapis i przeliczenie: `src/game/sensitivity.test.ts`, `settings.spec.ts`; odczucie: tylko urządzenie |
| 7b | Komputer: w trakcie skoku naciśnij Esc; w menu włącz „Pełny ekran”, wróć do gry, naciśnij Esc jeszcze raz; spróbuj też F11; w menu otwórz „Zmień skocznię”, wróć, wybierz inną skocznię, na końcu „Wyjdź do menu głównego” | pod obrazem nie ma paska przycisków; w pełnym ekranie (także po F11) obraz sięga krawędzi ekranu, w oknie skaluje się całymi pikselami; Esc zatrzymuje skok i otwiera menu (w pełnym ekranie przeglądarka może najpierw z niego wyjść), „Wróć do gry” albo Esc wznawia skok w tym samym miejscu; mysz w menu jest wolna; „Zmień skocznię” otwiera listę skoczni w menu: „Wstecz” wraca do menu, a wybór skoczni zaczyna skok na niej; z treningu wychodzi się pozycją „Wyjdź do menu głównego” | `keyboard.spec.ts`, `input.spec.ts`, `smoke.spec.ts` (Esc, menu, lista skoczni, wyjście); pełny ekran i przechwycenie myszy: tylko urządzenie |
| 7c | Menu główne, „Jak skakać”; to samo z menu pauzy na ekranie skoku; na telefonie w trybie palca i w trybie przechyłu | instrukcja mówi o tym, czym się steruje: myszą i klawiaturą, polami L i P albo kciukami i przechyłem; opisuje start, wybicie, lot, telemark z jego szerokością, lądowanie na dwie nogi, następny skok i menu | treść: `src/ui/how-to-jump-text.test.ts`; otwieranie i fokus: `keyboard.spec.ts`; układ ekranu: `reflow.spec.ts`, `targets.spec.ts`, `safe-area.spec.ts` |
| 7d | Menu główne w przeglądarce, „Gra jako aplikacja”; potem to samo menu w grze uruchomionej z ikony | instrukcja opisuje dodanie gry do ekranu głównego na iPhonie i Androidzie oraz instalację na komputerze; w grze uruchomionej z ikony tej pozycji nie ma | układ ekranu: `reflow.spec.ts`, `targets.spec.ts`, `safe-area.spec.ts`; kolejność w menu: `keyboard.spec.ts`; brak pozycji po instalacji i same kroki: tylko urządzenie |
| 7e | Komputer: obejrzyj róg ekranu skoku i menu; włącz i wyłącz „Pełny ekran” i „Podpowiedzi na skoczni”; w menu głównym wybierz „Wyłącz grę” | w rogu jest napis „ESC: MENU” zamiast znaku pauzy i nie ma wokół niego żółtej ramki po zamknięciu menu klawiszem; menu ma „Wróć do gry (Esc)”; „Pełny ekran” pokazuje „wł.” albo „wył.” zgodnie ze stanem; przy wyłączonych podpowiedziach obraz nie pokazuje żadnej instrukcji (start, wybicie, lot, następny skok); włączone nie migają; „Wyłącz grę” zamyka okno gry zainstalowanej albo otwartej w nowej karcie, a gdzie przeglądarka na to nie pozwala, pojawia się informacja, jak zamknąć kartę | fokus po zamknięciu menu: `keyboard.spec.ts`, `targets.spec.ts`; podpowiedzi: `src/render/jump-view.test.ts`; zamykanie okna i pełny ekran: tylko urządzenie |
| 7f | Menu główne, „Ustawienia”; zmień czułość, scenerię, dźwięk i podpowiedzi, wróć i wejdź na skocznię; na komputerze włącz pełny ekran klawiszem F11 i spróbuj wyłączyć go pozycją „Pełny ekran”; w zwykłej karcie wybierz „Wyłącz grę” | te same ustawienia co w menu skoku są dostępne bez wchodzenia na skocznię i obowiązują na skoczni; po F11 pozycja pokazuje „Pełny ekran: wł.”, a jej wybranie mówi, że ten pełny ekran wyłącza się klawiszem F11; informacja pod „Wyłącz grę” jest w ramce i dostaje fokus; przycisk menu na ekranie skoku nie dotyka krawędzi obrazu | układ i kolejność: `reflow.spec.ts`, `targets.spec.ts`, `keyboard.spec.ts`; pełny ekran przeglądarki i zamykanie karty: tylko urządzenie |
| 7g | Komputer, gra w oknie przeglądarki (nie w pełnym ekranie): wejdź na skocznię i zmieniaj rozmiar okna; w menu głównym wybierz „Wyłącz grę”. Telefon w pionie, sterowanie palcem: wejdź na skocznię; otwórz ustawienia z długim napisem „Podpowiedzi na skoczni: wył.” | obraz dochodzi do krawędzi okna (pasy zostają tylko przy bardzo szerokim albo bardzo wysokim oknie), a „ESC: MENU” leży w jego rogu obok nazwy skoczni; informacja pod „Wyłącz grę” jest wyrównana do obu krawędzi ramki, bez dużych odstępów między wyrazami; przycisk pauzy jest po lewej; napis zawinięty do dwóch linii jest wyśrodkowany | wypełnienie obszaru: `smoke.spec.ts`; pauza po lewej: `touch-layout.spec.ts`; wyrównanie tekstu i wygląd: tylko ręcznie |
| 8 | Cały skok polami L i P w pionie, potem w poziomie; w locie oderwij palec od pola L i przyłóż go ponownie, ląduj polem P | pola nie zasłaniają obrazu; w locie pole L tylko pochyla i powrót palca nie zaczyna lądowania; pole P zaczyna telemark, drugie dotknięcie P (albo nowe dotknięcie L) kończy jego przygotowanie i tak ustala szerokość, a pola L i P dotknięte razem lądują na dwie nogi (niższe noty, pewniejsze przy bardzo długim skoku); po pojawieniu się not pole L od razu zaczyna następny skok, także gdy skoczek jeszcze jedzie; rekord pojawia się na liście skoczni | `jump.spec.ts`, `touch-layout.spec.ts`; reguła pola L w locie i lądowanie na dwie nogi: `src/game/touch-landing.test.ts` (symulacja, bez przeglądarki) |
| 9 | Obróć telefon w trakcie najazdu | układ przestawia się, skok da się dokończyć | `interruption.spec.ts` |
| 10 | W poziomie obejrzyj okolice wycięcia ekranu i paska gestów, także z otwartym menu pauzy | nic ważnego pod wycięciem ani pod paskiem, brak białych pasów obok obrazu; menu pauzy, które się nie mieści, przewija się, a jego przyciski kończą się nad paskiem gestów zamiast pod niego wchodzić | `page-basics.spec.ts` (tło); wycięcie i pasek: tylko urządzenie |
| 11 | W trakcie skoku przejdź do innej aplikacji na kilka sekund i wróć | dźwięk milknie od razu, po powrocie skok trwa dalej od tego samego miejsca | tylko urządzenie (`interruption.spec.ts` pomija ten test) |
| 12 | W trakcie skoku zablokuj ekran, odblokuj | jak w punkcie 11 | tylko urządzenie |
| 13 | Menu, „Wczytaj pliki gry”, wybierz `Dsj.exe` ze swojej kopii; zamknij przeglądarkę i otwórz stronę ponownie | 37 skoczni z oryginału na liście także po ponownym otwarciu | tylko urządzenie i własna kopia gry; odmowa dla obcego pliku: `player-files.spec.ts` |
| 14 | Czytnik ekranu (VoiceOver albo TalkBack): przejdź menu, listę skoczni i strój | każdy przycisk i kolor ma nazwę, po zmianie ekranu czytany jest jego nagłówek | `a11y.spec.ts`, `keyboard.spec.ts` (fokus); mowa czytnika: tylko urządzenie |
| 15 | Z czytnikiem ekranu oddaj jeden skok | słychać „Skok rozpoczęty.”, potem lądowanie albo upadek z odległością, na końcu noty i wynik z przecinkiem dziesiętnym | treść komunikatów: `jump.spec.ts`; mowa czytnika: tylko urządzenie |
| 16 | Komputer: skok myszą (oba przyciski na progu), Esc w trakcie | mysz przechwycona na czas skoku, jedno Esc zatrzymuje skok i otwiera menu | `input.spec.ts`; zachowanie Esc w prawdziwym przechwyceniu myszy: tylko urządzenie |
| 17 | Komputer: przejdź całą grę samą klawiaturą; powiększ stronę do 200% | fokus zawsze widoczny, nic nie ucieka poza ekran | `keyboard.spec.ts`, `reflow.spec.ts` |
| 18 | Telefon: dodaj grę do ekranu głównego i uruchom ją z ikony | ikona ze skoczkiem bez białych rogów i bez ucięcia postaci, nazwa „Telemark”, gra bez paska adresu | manifest i ikony: `pnpm test:scripts`; instalacja i wygląd ikony: tylko urządzenie |
| 19 | Poczekaj w menu na „Gotowe do gry bez internetu.”, zamknij grę, włącz tryb samolotowy, uruchom ją z ikony i oddaj skok | gra startuje, skok i rekord działają, dźwięk po pierwszym dotknięciu | `offline.spec.ts` (Chromium, Firefox, WebKit na komputerze); telefon: tylko urządzenie |
| 20 | Uruchomiona z ikony: obie orientacje, okolice wcięcia i paska gestów, pola L i P, pauza | nic pod wcięciem ani pod paskiem, czarne tło do krawędzi | `safe-area.spec.ts` (wcięcia podane przez test); prawdziwe wcięcia: tylko urządzenie |
| 21 | Po opublikowaniu nowego wydania: otwórz grę, poczekaj na „Nowa wersja jest gotowa.”, zamknij wszystkie okna gry i uruchom ją ponownie | do zamknięcia działa stare wydanie, potem nowe; ustawienia, rekordy i zapamiętane pliki gry zostają | `offline.spec.ts`; na telefonie i z prawdziwym plikiem gry: tylko urządzenie |
| 22 | Uruchomiona z ikony: przejdź do innej aplikacji i wróć; zablokuj i odblokuj ekran | gra wraca tam, gdzie była, bez białego ekranu i bez ponownego wczytywania w trakcie skoku | tylko urządzenie |
| 23 | Otwórz grę w przeglądarce telefonu z `?diag` na końcu adresu, oddaj trzy skoki i po trzecim zapisz liczby z nakładki w rogu obrazu | zgubione kroki 0.0; odstęp klatki zgodny z odświeżaniem ekranu (około 16.7 ms przy 60 Hz, 8.3 ms przy 120 Hz) | tylko urządzenie (działanie nakładki: `diagnostics.spec.ts`) |

Gra uruchomiona z ikony nie ma paska adresu, więc pomiar z punktu 23 robi się w karcie przeglądarki.

Przy odbiorze zapisz model urządzenia, wersję systemu, przeglądarkę z wersją i wydanie gry (commit z adresu
`/release.json`). Gdy coś zawiedzie, zanotuj: numer kroku, urządzenie i wersję systemu, przeglądarkę z wersją,
orientację, czy strona była otwarta z ekranu głównego, co było widać albo słychać (zrzut ekranu lub nagranie) oraz czy błąd
powtarza się po przeładowaniu strony.

## Pokrycie kodu symulacji

`pnpm test:coverage` uruchamia te same testy z pomiarem pokrycia (v8) i tak są uruchamiane w CI. Mierzone jest tylko
`src/sim`, bez testów, `src/sim/test-support` i `src/sim/data`. Progi (instrukcje, gałęzie, funkcje, linie) są
w `vite.config.ts`, ustawione dwa punkty poniżej wartości zmierzonych bez plików gry, bo tak działa CI; ze śladami
pokrycie jest wyższe. Progi są tylko podnoszone, gdy pokrycie rośnie, nigdy obniżane. Raport HTML trafia do
`coverage/`.

## Testy porównawcze z oryginałem

Zmienne środowiskowe:

- `DSJ2_TRACE_DIR`: katalog z plikami `<nazwa>.trace` albo `<nazwa>.trace.gz`, nazwanymi tak jak powtórka, którą
  zapisują.
- `DSJ2_GAME_DIR`: katalog z plikami `.rpl` (wyszukiwanie bez rozróżniania wielkości liter).
- `DSJ2_TRACE`: pojedynczy ślad, gdy nie podano katalogu.

```sh
DSJ2_TRACE_DIR=/ścieżka/traces DSJ2_GAME_DIR=/ścieżka/gra pnpm test
```

Żaden przypadek nie znika po cichu. Które pliki są wymagane, rozstrzyga `src/sim/test-support/golden-files.ts`
(testy w `golden-files.test.ts` działają wszędzie, na plikach tworzonych w katalogu tymczasowym):

| Ustawiono | Wymagane | Skutek braku |
|---|---|---|
| `DSJ2_TRACE_DIR` | katalog daje się odczytać i zawiera co najmniej jeden plik `.trace` | błąd w każdym teście korzystającym ze śladów |
| `DSJ2_TRACE_DIR` | `hills.hilltrace` oraz `Dsj.exe` i `Dsj.dat` w `DSJ2_GAME_DIR` | błąd w `original-hills.golden.test.ts` |
| `DSJ2_TRACE` (bez katalogu) | wskazany plik istnieje | błąd w każdym teście korzystającym ze śladów |
| dowolna zmienna śladów | `<nazwa>.rpl` w `DSJ2_GAME_DIR` dla każdego śladu `<nazwa>.trace` | błąd w `jump-sim.golden.test.ts` z listą śladów bez powtórki |
| `DSJ2_GAME_DIR` | `Dsj.exe` i `Dsj.dat` | błąd w `original-hills.golden.test.ts` |

Gdy ustawiono `DSJ2_TRACE_DIR`, zmienna `DSJ2_TRACE` nie jest brana pod uwagę, także wtedy, gdy katalogu nie da się
odczytać. Samo `DSJ2_GAME_DIR` (bez śladów) uruchamia tylko testy odczytu skoczni; porównanie profili ze śladem
`hills.hilltrace` jest wtedy pomijane. Każdy test śladu wymaga ponadto, żeby ze śladu wykonano co najmniej jedno
porównanie klatki; ślad bez pasujących par migawek kończy test błędem.

Zapis śladu (gra działa w emulatorze DOS z `tools/re`, bez DOSBoksa):

```sh
pip install -r tools/re/requirements-dev.txt
python3 -I tools/re/trace_capture.py <katalog-gry> <katalog-roboczy> <numer-powtórki> <wyjście.trace> [max-ticks]
```

`<numer-powtórki>` to pozycja na liście w studiu powtórek (od 0, alfabetycznie).

Ślad ma ok. 86 MB, a gzip zmniejsza go ok. 80 razy **[pomiar]**. Gdy nazwa wyjścia kończy się na `.gz`
(`<nazwa>.trace.gz`, `hills.hilltrace.gz`), `trace_capture.py` i `hill_capture.py` zapisują ślad skompresowany;
testy i `craft_replays.py set-distance` czytają obie postaci. Ten sam ślad w obu postaciach naraz w `DSJ2_TRACE_DIR`
to błąd (jedna z nich jest nieaktualna): testy przerywają się z nazwą śladu.

### Skocznie

```sh
python3 -I tools/re/hill_capture.py <gra> <katalog-roboczy> <DSJ2_TRACE_DIR>/hills.hilltrace.gz
```

Zapisuje stan oryginału po ustawieniu każdej z 37 skoczni (ok. 30 s na skocznię); test
`original-hills.golden.test.ts` porównuje z nim odczyt z `Dsj.exe`. Potrzebuje też `Dsj.exe` i `Dsj.dat`
w `DSJ2_GAME_DIR`.

### Powtórki dla dowolnej skoczni

Powtórki z dystrybucji obejmują 6 z 37 skoczni. Dla pozostałych powtórkę trzeba zrobić: wejście (klatki przycisków
i ruchu myszy) zależy od długości rozbiegu, więc planuje je port, a oryginał odtwarza gotową powtórkę.

```sh
# 1. Plan: port skacze na skoczni odczytanej z Dsj.exe gracza, wejście trafia do <plany>/HILLnn.json
node scripts/plan-replays.mjs <gra> <plany> [numer-skoczni ...]      # bez numerów: wszystkie 37
# 2. Powtórka z planu; powtórka bazowa (dowolna z gry) daje tylko nazwy i datę
python3 -I tools/re/craft_replays.py from-plan <gra>/Karpacz.rpl <plany>/HILL32.json <kopia-gry>/HILL32.RPL
# 3. Ślad: <kopia-gry> zawiera pliki gry i tę jedną powtórkę (numer 0)
python3 -I tools/re/trace_capture.py <kopia-gry> <katalog-roboczy> 0 <ślady>/HILL32.trace.gz
# 4. Odległość zmierzona przez oryginał trafia do powtórki
python3 -I tools/re/craft_replays.py set-distance <ślady>/HILL32.trace.gz <kopia-gry>/HILL32.RPL
# 5. Testy porównawcze
DSJ2_TRACE_DIR=<ślady> DSJ2_GAME_DIR=<kopia-gry> pnpm test
```

Plan (`src/sim/test-support/replay-plan.ts`) to wejście skoku w postaci, w jakiej trzyma je powtórka
(`docs/replay-format.md`): klatka startu, początek okna wybicia i jego 20 bajtów, ruch myszy z pierwszą i ostatnią
klatką, klatki przycisków lądowania, ziarno generatora i wiatr. Powstaje z przebiegu portu ze skryptowanym
graczem; wejście, którego powtórka nie pomieści, jest odrzucane. Plik planu zawiera też wynik portu (`expected`:
liczba klatek, odległość, typ upadku), czyli to, co powinien pokazać oryginał. Ziarno skoczni n to 21000 + n,
a wiatr jest losowany z tego ziarna tak jak w treningu, więc plany są powtarzalne.

`plan-replays.mjs` ładuje moduły TypeScript przez serwer modułów Vite (`scripts/lib/load-typescript.mjs`): źródła
importują się bez rozszerzeń, czego Node sam nie rozwiąże, a Vite jest już zależnością projektu. Skrypt czyta
`Dsj.exe` i `Dsj.dat` ze wskazanego katalogu i pisze tylko do katalogu planów.

`from-plan` nie wpisuje odległości: bez `set-distance` test całego skoku nie przejdzie, więc nie da się pomylić
odległości z portu z odległością z oryginału.

Sprawdzone na skoczni 32 (K250, największa) **[pomiar, 2026-10-12]**: oryginał przyjął powtórkę z planu, skok
miał w nim 1477 klatek i 249,69 m, tak jak w porcie, a pięć testów porównawczych ze śladem przeszło (krok skoczka:
1469 z 1469 klatek bit w bit). Zapis śladu trwał ok. 9 minut; ślad ma 5876 migawek i 1,6 MB po kompresji.

`trace_capture.py` kończy zapis, gdy pętla skoku się skończy, najpóźniej po `max-ticks` taktach zegara (piąty
argument, domyślnie 3000). Wcześniejszy limit 1500 wystarczał na ok. 990 klatek i urywał ślad długiego skoku
w locie **[pomiar]**.

### Spreparowane powtórki (upadki, telemark)

Powtórki z dystrybucji kończą się czystym lądowaniem, więc nie sprawdzają upadków. `tools/re/craft_replays.py`
tworzy z powtórki z Karpacza warianty o zmienionym wejściu:

| Nazwa | Zmiana wejścia | Co sprawdza w oryginale |
|---|---|---|
| NOLAND | bez przycisku lądowania | upadek typu 4, odbicia |
| WILD | bez lądowania, gwałtowne pochylenia w locie | upadek typu 4 przy innym przebiegu lotu |
| LATE | przycisk lądowania 8 klatek później | upadek typu 4 |
| EARLY | przyciski wybicia trzymane do oderwania, przygotowanie do lądowania tuż po wybiciu | fazy 6 i 9, upadek typu 2 |
| TELEMARK | drugi przycisk lądowania w powietrzu | faza 9, czyste lądowanie |

```sh
python3 -I tools/re/craft_replays.py make <gra>/Karpacz.rpl <wyjście>
# każdą powtórkę zapisać w osobnym katalogu gry (jedyna powtórka, numer 0), potem:
python3 -I tools/re/craft_replays.py set-distance <NAZWA.trace.gz> <NAZWA.RPL>
```

`set-distance` wpisuje do powtórki odległość zmierzoną przez oryginał (ostatnia migawka śladu), bo zmienione wejście
unieważnia odległość zapisaną w nagłówku.

Warianty wybrano, przeszukując wejścia w porcie (ok. 4600 kombinacji przycisków i pochyleń), a potem zapisując ślady
wybranych w oryginale.

### Wyszukiwanie upadków

Typ upadku (1..5) to numer składnika oceny lądowania, który razem ze średnią przekroczył próg 60; gdy przekroczyło
go kilka, zostaje najwyższy numer (`landClean` w `src/sim/jump-logic.ts`). Składniki: 1 siła uderzenia, 2 czas
przygotowania do lądowania (albo lądowanie przed progiem), 3 niedokończona postawa tułowia i goleni, 4 rozstaw
nóg (lądowanie bez przygotowania), 5 ugięte nogi.

```sh
node scripts/search-falls.mjs <gra> <plany>
```

Skrypt rozgrywa w porcie 257 wzorców wejścia na każdej z 37 skoczni (8 wariantów wybicia: w porę, za wcześnie,
dużo za wcześnie, późno, za progiem, jednym przyciskiem, z przytrzymaniem, bez wybicia; 4 warianty pochylenia:
do przodu, brak, do tyłu, gwałtowne; 8 wariantów lądowania: w porę, bez przycisku, tuż po wybiciu, za wcześnie,
późno, bardzo późno, po zetknięciu, telemark; do tego skoczek, który nie rusza z belki), wypisuje, ile skoków
skończyło się każdym typem upadku, i zapisuje plan jednego przypadku na typ jako `<plany>/FALLn.json`. Trwa ok.
3 minut. Z planu powstaje powtórka i ślad tak jak w sekcji „Powtórki dla dowolnej skoczni”.

Wynik **[pomiar w porcie, 2026-10-12]**: 9509 skoków, każde wejście mieści się w powtórce.

| Typ | Skoki (za progiem) | Skocznie | Wzorce | Przypadek zapisany jako plan |
|---|---|---|---|---|
| bez upadku | 2418 (2381) | 37 | 90 | |
| 1 | 285 (28) | 37 | 24 | `FALL1`: skocznia 4 (K220), wybicie w porę, pochylenie do tyłu, lądowanie w porę, 63,02 m |
| 2 | 2123 (1939) | 37 | 72 | `FALL2`: skocznia 1 (K105), wybicie w porę, pochylenie do przodu, lądowanie tuż po wybiciu, 53,89 m |
| 3 | 94 (24) | 31 | 16 | `FALL3`: skocznia 3 (K135), wybicie w porę, gwałtowne pochylenia, późne lądowanie, 63,71 m |
| 4 | 3405 (2547) | 37 | 121 | `FALL4`: skocznia 1 (K105), wybicie w porę, pochylenie do przodu, bez przycisku lądowania, 88,84 m |
| 5 | 1184 (1184) | 37 | 32 | `FALL5`: skocznia 1 (K105), bez wybicia, pochylenie do przodu, lądowanie w porę, 24,65 m |

„Za progiem” to skoki, które minęły próg; pozostałe kończą się na rozbiegu (zbyt wczesne wybicie) i mają 0 m.
Port osiąga więc wszystkie pięć typów, także 1, 3 i 5, których nie dało się wywołać zmianami powtórki z Karpacza.

W oryginale sprawdzono `FALL1` **[pomiar, 2026-10-12]**: upadek typu 1, 1574 klatki i 63,02 m, tak jak w porcie;
pięć testów porównawczych ze śladem przeszło (krok skoczka: 1567 z 1567 klatek bit w bit). `FALL2`..`FALL5` mają
plany i powtórki, ale nie mają jeszcze śladów; typy 3 i 5 nie były dotąd porównane z oryginałem.

## Testy mutacyjne (Stryker)

```sh
pnpm mutation
```

Raport HTML trafia do `reports/mutation/`. W CI uruchamiany ręcznie (workflow „Mutation testing”).
Bez plików gry fizykę sprawdzają tylko testy regresyjne, więc wynik lokalny ze śladami jest wyższy.

Wynik bez śladów (2026-10-11, 2700 mutantów) **[pomiar]**: 61,67% ogółem; najniższe `replay.ts` (0%, testują go tylko
testy porównawcze), `wind.ts` (32%) i `pose.ts` (56%).

Ograniczenia narzędzi (stan na 2026-10):

- Stryker 10 przełącza mutanty poprawnie dopiero z Vitest 4; z Vitest 5 testy przechodzą, ale żaden mutant nie ginie.
  Dlatego projekt używa Vitest 4.1.
- Stryker przepisuje odwołania między projektami w `tsconfig` przez API JavaScript TypeScriptu, którego
  TypeScript 7 nie ma. `tsconfigFile` w `stryker.config.json` wskazuje celowo nieistniejący plik, co pomija ten krok
  (projekt nie używa odwołań między projektami).
- Stryker używa osobnej, minimalnej konfiguracji `vitest.stryker.config.ts`.
