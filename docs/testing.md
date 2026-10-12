# Testy

## Rodzaje testów

| Plik | Co sprawdza | Gdzie działa |
|---|---|---|
| `src/sim/*.test.ts` | testy jednostkowe (generator, profil skoczni, funkcje deterministyczne) | wszędzie |
| `src/sim/jump-sim.regression.test.ts` | pełny skok na syntetycznej skoczni ze skryptowanym wejściem; wyniki i skrót stanu z każdej klatki w migawce; sprawdza też, że krok symulacji nie zmienia stanu, który dostał | wszędzie, także w CI |
| `src/sim/*.golden.test.ts` | porównanie z oryginalną grą klatka po klatce | tylko z plikami gry i śladami |
| `src/render/jump-view.pixels.test.ts` | skróty wszystkich pikseli całych klatek (14 momentów skoku, pory dnia, pogoda, szerokości widoku) w migawce | wszędzie, także w CI |
| `src/sim/test-support/replay-plan.test.ts` | plan powtórki: wejście skryptowanego gracza na syntetycznej skoczni wraca z planu klatka w klatkę | wszędzie, także w CI |
| `src/sim/test-support/dsj-trace.test.ts` | odczyt i wyszukiwanie śladów (zwykłych i gzip) na małych, sztucznych śladach | wszędzie, także w CI |
| `tools/re/test_tools.py` | narzędzia analizy (FPU, kodek powtórek, powtórka z planu, zapis śladów) | wszędzie |

Testy porównawcze („golden”) są pomijane tylko wtedy, gdy nie ustawiono żadnej ze zmiennych opisanych niżej (tak
działa CI). Po ustawieniu zmiennej brak pliku, który ona zapowiada, kończy test błędem z nazwą brakującego pliku.
Ślady i pliki gry nie trafiają do repozytorium.

Celowa zmiana wyglądu wymaga odświeżenia migawki pikseli: `pnpm test -u src/render/jump-view.pixels.test.ts`.
Diff migawki pokazuje, które sceny się zmieniły; zmiana w scenie, której nie dotyczyła praca, to błąd.

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
wybranych w oryginale. Na Karpaczu tym sposobem nie udało się wywołać upadków typu 1, 3 i 5.

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
