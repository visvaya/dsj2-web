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

Nagłówek po odszyfrowaniu to 13 znaków bez bajtu długości: `//DSJ_v2.00//` (DS:14D2) albo `//DSJ_v2.1P//`
(DS:14E0) **[pomiar: 6 plików z dystrybucji]**.

- Zapis (190d:03e4) wybiera znacznik po numerze skoczni: `//DSJ_v2.00//` dla skoczni 1..32, `//DSJ_v2.1P//`
  dla 33..37 **[kod: 190d:05ca]**.
- Odczyt (190d:060d) przyjmuje każdy z dwóch znaczników, bez związku z numerem skoczni, i dopiero wtedy czyta
  rekord **[kod: 190d:0662..06b1]**; wynik to zgodność sumy kontrolnej **[kod: 1b8f:0308]**. Innych pól przy
  odczycie nie sprawdza.

## Rekord (1205 B, offsety szesnastkowo)

| Offset | Typ | Znaczenie |
|---|---|---|
| 00 | 8 × Single | stan wiatru na starcie (DS:4D10..4D2F): x, y, zmienność, prędkość, kierunek, kierunek wskaźnika, prędkość obrotu wskaźnika, jej limit |
| 20 | byte | numer skoczni (1..37) |
| 21 | Single | rekord skoczni w chwili skoku: kopia `DS:543B + 21 * numer` (84,58 dla Karpacza) **[kod: 190d:0052]** |
| 25 | string[6] | odległość jako tekst, np. `89.92` |
| 2C | LongInt | `RandSeed` na początku skoku |
| 30.. | ShortInt[] | ruch myszy w pionie (mickeye, przycięte do -128..127) w klatkach od `dy_start`; indeks `klatka - dy_start + 1`, liczony od 2F |
| 449 | byte | kopia DS:4D30; czyta ją tylko kod rysujący (0baf:3359) **[kod]** |
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

## Powtórka dla innej skoczni

Co decyduje o tym, czy gra odtworzy powtórkę na wybranej skoczni:

- **Numer skoczni (20).** Studio powtórek przekazuje go wprost do procedury ustawiającej skocznię (0baf:631c),
  bez sprawdzania zakresu **[kod: 003f:8951]**. Ta sama procedura ustawia skocznię w treningu, więc profil jest
  taki jak w `docs/hill-format.md`.
- **Znacznik nagłówka.** Dowolny z dwóch (wyżej). `tools/re/craft_replays.py from-plan` wpisuje ten, który
  zapisałaby gra.
- **Pole 21.** Przy odczycie niesprawdzane. Przy odtwarzaniu trafia do 0baf:9303, która wylicza z niego położenie
  znacznika rekordu na zeskoku; 0 jest zamieniane na 10000 m, czyli poza skocznię **[kod: 0baf:9311..9435,
  0baf:ccec, 0baf:d0ed]**. Tabelę `DS:543B` zmienia kod pod 0baf:b462..b544 **[znaczenie: hipoteza, zapis nowego
  rekordu po skoku]**. `from-plan` wpisuje 0.
- **Pole 449.** Tylko rysowanie; `from-plan` wpisuje 0.
- **Odległość (25).** Tekst do wyświetlenia; gra liczy skok od nowa. `from-plan` zostawia go pustym, a po
  zapisaniu śladu wpisuje go `set-distance`.
- **Licencja.** Po udanym odczycie studio pyta 1a7f:029e; gdy wynik to 0, a numer skoczni jest większy niż 4,
  zamiast ekranu powtórki woła 003f:114c **[kod: 003f:8f42..8f68]**. Ta sama funkcja wybiera przy zapisie nazwę
  licencjobiorcy (49B) **[kod: 190d:0568]**, więc niezarejestrowana kopia odtwarza zapewne tylko skocznie 1..4
  **[hipoteza: nie sprawdzono na takiej kopii]**.
- **Wejście.** Klatki wejścia zależą od długości rozbiegu, więc nie da się ich przenieść z innej skoczni; plan
  wejścia powstaje w porcie (`docs/testing.md`, „Powtórki dla dowolnej skoczni”).

Sprawdzenie **[pomiar, 2026-10-12]**: powtórka dla skoczni 32 (K250) zrobiona z planu, ze znacznikiem
`//DSJ_v2.00//`, zerami w polach 21 i 449 i pustą odległością, została przyjęta przez oryginał (kopia z licencją)
i odtworzona na skoczni K250. Skok trwał 1477 klatek i miał 249,69 m, tyle samo co w porcie; testy porównawcze
przeszły na jej śladzie. Znacznika `//DSJ_v2.1P//` dla skoczni 1..32 ani `//DSJ_v2.00//` dla 33..37 nie
sprawdzano w grze (wynika tylko z kodu odczytu).
