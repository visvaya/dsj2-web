# Testy

## Rodzaje testów

| Plik | Co sprawdza | Gdzie działa |
|---|---|---|
| `src/sim/*.test.ts` | testy jednostkowe (generator, profil skoczni, funkcje deterministyczne) | wszędzie |
| `src/sim/jump-sim.regression.test.ts` | pełny skok na syntetycznej skoczni ze skryptowanym wejściem; wyniki i skrót stanu z każdej klatki w migawce; sprawdza też, że krok symulacji nie zmienia stanu, który dostał | wszędzie, także w CI |
| `src/sim/*.golden.test.ts` | porównanie z oryginalną grą klatka po klatce | tylko z plikami gry i śladami |
| `src/render/jump-view.pixels.test.ts` | skróty wszystkich pikseli całych klatek (14 momentów skoku, pory dnia, pogoda, szerokości widoku) w migawce | wszędzie, także w CI |
| `tools/re/test_tools.py` | narzędzia analizy (FPU, kodek powtórek) | wszędzie |

Testy porównawcze („golden”) są pomijane, gdy nie ma śladów. Ślady i pliki gry nie trafiają do repozytorium.

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

- `DSJ2_TRACE_DIR`: katalog z plikami `<nazwa>.trace`, nazwanymi tak jak powtórka, którą zapisują.
- `DSJ2_GAME_DIR`: katalog z plikami `.rpl` (wyszukiwanie bez rozróżniania wielkości liter).
- `DSJ2_TRACE`: pojedynczy ślad, gdy nie podano katalogu.

```sh
DSJ2_TRACE_DIR=/ścieżka/traces DSJ2_GAME_DIR=/ścieżka/gra pnpm test
```

Zapis śladu (gra działa w emulatorze DOS z `tools/re`, bez DOSBoksa):

```sh
pip install -r tools/re/requirements-dev.txt
python3 -I tools/re/trace_capture.py <katalog-gry> <katalog-roboczy> <numer-powtórki> <wyjście.trace>
```

`<numer-powtórki>` to pozycja na liście w studiu powtórek (od 0, alfabetycznie).

### Skocznie

```sh
python3 -I tools/re/hill_capture.py <gra> <katalog-roboczy> <DSJ2_TRACE_DIR>/hills.hilltrace
```

Zapisuje stan oryginału po ustawieniu każdej z 37 skoczni (ok. 30 s na skocznię); test
`original-hills.golden.test.ts` porównuje z nim odczyt z `Dsj.exe`. Potrzebuje też `Dsj.exe` i `Dsj.dat`
w `DSJ2_GAME_DIR`.

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
python3 -I tools/re/craft_replays.py set-distance <NAZWA.trace> <NAZWA.RPL>
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
