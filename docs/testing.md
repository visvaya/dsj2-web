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
| `e2e/*.spec.ts` | zbudowana gra w prawdziwych przeglądarkach (Playwright), opis niżej | CI: Chromium, Firefox, WebKit; lokalnie: Edge |

Testy porównawcze („golden”) są pomijane tylko wtedy, gdy nie ustawiono żadnej ze zmiennych opisanych niżej (tak
działa CI). Po ustawieniu zmiennej brak pliku, który ona zapowiada, kończy test błędem z nazwą brakującego pliku.
Ślady i pliki gry nie trafiają do repozytorium.

Celowa zmiana wyglądu wymaga odświeżenia migawki pikseli: `pnpm test -u src/render/jump-view.pixels.test.ts`.
Diff migawki pokazuje, które sceny się zmieniły; zmiana w scenie, której nie dotyczyła praca, to błąd.

## Testy w przeglądarkach

`pnpm test:browser` uruchamia Playwright na zbudowanej grze (`vite preview` na katalogu `dist/`, port 4317), nie na
serwerze deweloperskim. Każdy test zaczyna od czystego kontekstu przeglądarki i kończy się błędem, gdy strona zgłosi
nieobsłużony wyjątek albo wypisze błąd na konsoli. Środowisko jest ustalone w `playwright.config.ts`: język `pl-PL`,
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
| `smoke.spec.ts` | strona po polsku, przejścia menu, lista skoczni, skok i z powrotem; obraz narysowany, kwadratowe piksele gry (poza gęstymi ekranami w całkowitej liczbie pikseli urządzenia), brak przewijania na ekranie skoku | wszystkie |
| `jump.spec.ts` | cały skok wejściem urządzenia (przyciski myszy albo pola dotykowe), rekord na liście skoczni i w zapisie, także po przeładowaniu | wszystkie |
| `touch-layout.spec.ts` | pola L i P: co najmniej 44 px, poza obrazem, obok obrazu w poziomie i pod nim w pionie; przycisk pauzy | telefony i tablet |
| `keyboard.spec.ts` | obsługa samą klawiaturą: fokus zawsze na widocznym, niezasłoniętym elemencie z widocznym wskaźnikiem, nigdy na `<body>`; Enter i spacja uruchamiają, Esc wychodzi ze skoku | komputery |
| `a11y.spec.ts` | axe, WCAG 2.2 AA, zero naruszeń na każdym ekranie; test pilnuje, że żaden ekran nie został pominięty | `desktop-chromium`, `android-portrait` |
| `settings.spec.ts` | dźwięk i sceneria zostają po przeładowaniu | `desktop-chromium`, `android-portrait` |
| `sim-engines.spec.ts` | symulacja daje w silniku przeglądarki bit w bit wynik z migawki `jump-sim.regression.test.ts` (klatki, odległość, punkty, noty, typ upadku, skrót stanu) | komputery |
| `reflow.spec.ts` | menu, lista skoczni i strój przy szerokości 320 px i przy powiększeniu 200%: brak przewijania w bok, uciętych i nachodzących elementów; odstępy tekstu z WCAG 1.4.12; wymuszone kolory: kontrolki, kolory próbek i fokus widoczne | komputery, `android-portrait` |
| `layout-stability.spec.ts` | zmiana ustawienia oraz otwarcie i zamknięcie pauzy nie przesuwają obrazu ani pól dotykowych (różnice w pikselach trafiają do raportu); pierwszy ekran jest od razu narysowany czcionkami gry, a przeglądarka nie pobiera ich osobno; przyciski pod obrazem na komputerze przesuwają się przy zmianie etykiety: znany błąd, `test.fixme` | wszystkie |
| `targets.spec.ts` | każda kontrolka spełnia WCAG 2.5.8 (24 na 24 px albo odstęp) i nic jej nie zasłania; przy otwartej pauzie fokus klawiatury nie wchodzi pod nią | wszystkie; fokus: dotykowe |
| `input.spec.ts` | oba przyciski myszy jako akord w obu kolejnościach naciśnięcia i puszczenia; naciśnięcie krótsze niż krok symulacji; jedno Esc wychodzi ze skoku | komputery |
| `interruption.spec.ts` | obrót telefonu w trakcie skoku: poprawny układ i skok do końca; ukrycie strony: test pomija się sam, bo żaden silnik uruchamiany przez Playwrighta nie ukrywa strony | telefony; ukrycie: brak |
| `sound.spec.ts` | żaden kontekst audio nie działa przed pierwszym gestem, jeden po nim; wyłączony dźwięk to cisza na wyjściu, także po przeładowaniu (`AudioContext` obserwowany z testu) | wszystkie |
| `player-files.spec.ts` | plik, który nie jest grą: komunikat po polsku, nic nie zostaje zapisane, skocznia wbudowana dostępna | wszystkie |
| `page-basics.spec.ts` | osobny tytuł strony dla każdego ekranu; tło ustawione na `html` | wszystkie |

Skok trwa w czasie rzeczywistym (70 kroków symulacji na sekundę), więc test steruje nim według zegara strony,
liczonego od komunikatu „Skok rozpoczęty.” w regionie `aria-live` obok obrazu. Chwile naciśnięć leżą w środku okien
zmierzonych w symulacji na wielu ziarnach (opis w `e2e/support/jump.ts`). Skok zakończony upadkiem test powtarza,
najwyżej trzy razy, tak jak zrobiłby to gracz.

Scenariusze regresyjne symulacji są w `src/sim/test-support/regression-scenarios.ts`; korzysta z nich test Vitest
i strona testowa. Stronę buduje Vite projektu przed testami (`e2e/sim-harness.setup.ts`) do ignorowanego katalogu
`e2e/.sim-harness/`; do `dist/` nie trafia.

Wyniki axe oznaczone jako „incomplete” nie są ani naruszeniem, ani zaliczeniem: test zapisuje je do pliku
`axe-incomplete.json` w `test-results/` i dołącza do raportu.

### Lokalnie

```sh
pnpm test:browser:edge   # tylko projekty na Chromium, w zainstalowanym Microsoft Edge
```

Tryb lokalny (zmienna `BROWSER_TESTS_EDGE`) niczego nie pobiera: używa przeglądarki Edge z systemu i przed testami
buduje grę. Firefox i WebKit działają tylko w CI. `pnpm test:browser` bez zmiennej uruchamia wszystkie projekty
i wymaga przeglądarek Playwrighta (`pnpm exec playwright install chromium firefox webkit`); w CI testuje `dist/`
zbudowany wcześniejszym krokiem, poza CI buduje grę sam.
Raport HTML trafia do `playwright-report/`, ślady i zrzuty nieudanych testów do `test-results/`.

Emulacja to nie urządzenie: profile telefonów i tabletu ustawiają rozmiar okna, gęstość pikseli, dotyk i nagłówek
przeglądarki, ale silnik pozostaje desktopowy. Czego testy nie widzą, sprawdza się ręcznie (niżej).

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
| 6 | Skok z pochylaniem przechyłem telefonu | skoczek pochyla się zgodnie z ruchem telefonu w obu orientacjach | tylko urządzenie |
| 7 | Android: skok z włączonymi wibracjami, potem „Wibracje: wył.” | krótka wibracja przy starcie, wybiciu i lądowaniu; po wyłączeniu brak (iPhone nie wibruje) | tylko urządzenie |
| 8 | Cały skok polami L i P w pionie, potem w poziomie | pola nie zasłaniają obrazu, rekord pojawia się na liście skoczni | `jump.spec.ts`, `touch-layout.spec.ts` |
| 9 | Obróć telefon w trakcie najazdu | układ przestawia się, skok da się dokończyć | `interruption.spec.ts` |
| 10 | W poziomie obejrzyj okolice wycięcia ekranu i paska gestów | nic ważnego pod wycięciem ani pod paskiem, brak białych pasów obok obrazu | `page-basics.spec.ts` (tło); wycięcie i pasek: tylko urządzenie |
| 11 | W trakcie skoku przejdź do innej aplikacji na kilka sekund i wróć | dźwięk milknie od razu, po powrocie skok trwa dalej od tego samego miejsca | tylko urządzenie (`interruption.spec.ts` pomija ten test) |
| 12 | W trakcie skoku zablokuj ekran, odblokuj | jak w punkcie 11 | tylko urządzenie |
| 13 | Menu, „Wczytaj pliki gry”, wybierz `Dsj.exe` ze swojej kopii; zamknij przeglądarkę i otwórz stronę ponownie | 37 skoczni z oryginału na liście także po ponownym otwarciu | tylko urządzenie i własna kopia gry; odmowa dla obcego pliku: `player-files.spec.ts` |
| 14 | Czytnik ekranu (VoiceOver albo TalkBack): przejdź menu, listę skoczni i strój | każdy przycisk i kolor ma nazwę, po zmianie ekranu czytany jest jego nagłówek | `a11y.spec.ts`, `keyboard.spec.ts` (fokus); mowa czytnika: tylko urządzenie |
| 15 | Z czytnikiem ekranu oddaj jeden skok | słychać „Skok rozpoczęty.”, potem lądowanie albo upadek z odległością, na końcu noty i wynik z przecinkiem dziesiętnym | treść komunikatów: `jump.spec.ts`; mowa czytnika: tylko urządzenie |
| 16 | Komputer: skok myszą (oba przyciski na progu), Esc w trakcie | mysz przechwycona na czas skoku, jedno Esc wraca do listy skoczni | `input.spec.ts`; zachowanie Esc w prawdziwym przechwyceniu myszy: tylko urządzenie |
| 17 | Komputer: przejdź całą grę samą klawiaturą; powiększ stronę do 200% | fokus zawsze widoczny, nic nie ucieka poza ekran | `keyboard.spec.ts`, `reflow.spec.ts` |

Gdy coś zawiedzie, zanotuj: numer kroku, urządzenie i wersję systemu, przeglądarkę z wersją, orientację, czy
strona była otwarta z ekranu głównego, co było widać albo słychać (zrzut ekranu lub nagranie) oraz czy błąd
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
