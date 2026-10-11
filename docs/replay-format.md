# DSJ2: format powtórek `.rpl` (v2.x)

Źródło: moduł `190d` (rekord powtórki) i `1b8f` (szyfrowany zapis) w `Dsj.exe` v2.10P.
Dekoder: `tools/re/rpl_codec.py`. Wszystkie pliki `.rpl` z dystrybucji (5 × `/DSJ_v2.1P//`,
1 × `/DSJ_v2.00//`) dekodują się z poprawną sumą kontrolną **[pomiar]**.

## Plik

Rozmiar 1222 B = 13 B nagłówka + 1205 B rekordu (szyfrowane) + 4 B sumy kontrolnej (jawne, LE).

Szyfr strumieniowy oparty na generatorze `Random` Borland Pascala:

- `RandSeed := $26B51B17`; `checksum := random31()`, gdzie `random31() = Random($8000) * 65536 + Random($FFFF)`.
- Dla każdego bajtu jawnego `p`: `k := Random(256)`, `c := (p + k) mod 256` (zapisywany),
  `RandSeed := RandSeed + c`, `checksum := checksum + (c - 1) * (random31() shr 8)` (mod 2^32).
- `Random`: `RandSeed := RandSeed * $08088405 + 1`, `Random(n) = (RandSeed * n) shr 32`.

Nagłówek po odszyfrowaniu to `string[12]` z wersją; gra przyjmuje `/DSJ_v2.1P//` lub drugi znacznik
(zależnie od numeru skoczni).

## Rekord (1205 B, offsety szesnastkowo)

| Offset | Typ | Znaczenie |
|---|---|---|
| 00 | 8 × Single | stan wiatru na starcie (DS:4D10..4D2F): x, y, zmienność, prędkość, kierunek, kierunek wskaźnika, prędkość obrotu wskaźnika, jej limit |
| 20 | byte | numer skoczni |
| 21 | Single | wartość z tabeli skoczni dla tego numeru (84,58 dla Karpacza) **[znaczenie: hipoteza, rekord skoczni]** |
| 25 | string[6] | odległość jako tekst, np. `89.92` |
| 2C | LongInt | `RandSeed` na początku skoku |
| 30.. | ShortInt[] | ruch myszy w pionie (mickeye, przycięte do -128..127) w klatkach od `dy_start`; indeks `klatka - dy_start + 1`, liczony od 2F |
| 449 | byte | kopia DS:4D30 |
| 44A | LongInt | klatka startu z belki (lewy przycisk) |
| 44E | LongInt | `button_start`: pierwsza klatka okna wybicia |
| 452 | LongInt | `dy_start`: pierwsza klatka zapisu ruchu |
| 456.. | byte[20] | przyciski w oknie wybicia, indeks `klatka - button_start + 1` od 455: 0 brak, >0 lewy, >1 także prawy |
| 46A | LongInt | klatka lewego przycisku przy lądowaniu (0 = brak) |
| 46E | LongInt | klatka prawego przycisku przy lądowaniu (0 = brak) |
| 472 | LongInt | `dy_end`: ostatnia klatka zapisu ruchu |
| 476 | string[25] | nazwa zawodnika |
| 490 | string[10] | data `RRRR/MM/DD` |
| 49B | string[25] | nazwa licencjobiorcy |

Pozycja X myszy nie jest zapisywana. Odtworzenie skoku wymaga więc: stanu wiatru, ziarna generatora,
numeru skoczni i powyższego wejścia. Symulacja jest deterministyczna; przewijanie powtórki w grze
przelicza skok od początku **[kod: 0baf:ca5b]**.

Przykład (`KARPACZ.RPL`): skocznia 35, ziarno `$2F4B0829`, start 74, okno wybicia od 308, ruch 322..614,
prawy przycisk przy lądowaniu w klatce 595, odległość 89,92 m **[pomiar]**.
