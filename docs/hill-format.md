# Skocznie w plikach oryginału (v2.10P)

Geometria skoczni nie jest w `Dsj.dat`, tylko w kodzie `Dsj.exe`, jako stałe przekazywane do procedur
ustawiających profil i scenerię. `Dsj.dat` dostarcza nazwy (oraz grafikę i dźwięki). Odczyt: `src/original/`
(profil: `hill-table.ts`, wygląd: `hill-look-reader.ts`). Jak oryginał rysuje z tych danych scenę: `jump-scene.md`.

## Tabela skoczni w `Dsj.exe`

Procedura 0baf:631c (argument: numer skoczni 1..37) porównuje numer z kolejnymi wartościami:

```
cmp al, N ; je +3 ; jmp <następne porównanie>
push ... ; call 1eee:051f      ; rozbieg
push ... ; call 1eee:06e1      ; zeskok i wybieg
push ... ; call 1eee:0437      ; podpory najazdu
push ... ; call 003f:9da5      ; kolor nieba
push ... ; call 0baf:1c31      ; fale terenu w tle
call 0baf:1e89                 ; tablice warstw sceny (bez argumentów)
push ... ; call 0baf:602e      ; drzewa
[pętle chowające drzewa]       ; tylko skocznie 4 i 9
jmp 0baf:8843                  ; ostatnia gałąź (37) przechodzi tam bez skoku
```

Parametry to argumenty natychmiastowe instrukcji PUSH. Pascal odkłada argumenty od lewej do prawej, Single
jako słowo starsze, potem młodsze. `push imm8` jest rozszerzane ze znakiem.

### 1eee:051f, rozbieg (20 słów)

| Słowa | Typ | Pole | Uwagi |
|---|---|---|---|
| 0-1 | Single | `45C2` | tył platformy startowej (m) |
| 2-3 | Single | koniec płaskiego odcinka | `inrunFlatEndXM` |
| 4-5 | Single | koniec prostej | `inrunLineEndXM` |
| 6-7 | Single | próg | `takeoffXM` |
| 8-9 | Single | start | `startXM` |
| 10 | bajt | `45E7` | kolor belki startowej (indeks palety; bliższa połowa: następny indeks) |
| 11-12 | Single | nachylenie prostej | `inrunLineSlope` |
| 13-14 | Single | wyraz wolny prostej | `inrunLineInterceptM` |
| 15-16 | Single | współczynnik paraboli | `inrunCurveA` |
| 17 | słowo | `45DE` | wysokość bliższej ściany nad torem (piksele); `45E2` = round(`45DE`·p19/p21) |
| 18 | słowo | `45E0` | bliższa ściana pod torem i czoło progu (piksele); `45E4` = round(`45E0`·p19/p21) |
| 19 | bajt | `45E6` | kolor ścian najazdu (najciemniejszy indeks rampy) |

Wyliczane: `B = slope - 2*A*lineEnd`, `C = slope*lineEnd + intercept - A*lineEnd*lineEnd - B*lineEnd`
(ciągłość wysokości i nachylenia na końcu prostej); tarcie 0,02.

### 1eee:06e1, zeskok (21 słów)

| Słowa | Typ | Pole | Uwagi |
|---|---|---|---|
| 0-1 | Single | środek tanh, x | `landingCenterXM` |
| 2-3 | Single | środek tanh, y | `landingCenterYM` |
| 4-5 | Single | amplituda | `landingAmplitudeM` |
| 6-7 | Single | szerokość | zapisywana jako odwrotność, `landingInvWidthPerM` |
| 8-9 | Single | początek wybiegu | `outrunStartXM` |
| 10-11 | Single | współczynnik paraboli wybiegu | `outrunCurveA` |
| 12 | słowo | `4648` | odległość pierwszej linii co 5 m przed punktem K |
| 13 | słowo | `464A` | liczba tych linii, najwyżej 13 |
| 14 | słowo | punkt K w metrach | `464C` |
| 15 | słowo | `464E` = round(dno paraboli wybiegu + słowo 15) | wysokość bazowa terenu w tle |
| 16 | bajt | `4650` | kolor płotów (najciemniejszy indeks) |
| 17-18 | Single | `4651` | przesunięcie początku płotów za progiem (m) |
| 19-20 | Single | wtopienie kształtu rozbiegu w zeskok poniżej progu | `knollBlend` (`4655`) |

Wyliczane: `B = landing_slope(x0) - 2*A*x0`, `C = landing_y(x0) - A*x0*x0 - B*x0` dla `x0` = początek wybiegu
(ciągłość z profilem tanh); tarcie 0,05.

Symulacja (0baf:9c52, 1c06:02a1) czyta z tych danych tylko profil i punkt K **[kod]**. Pozostałe pola czyta
wyłącznie kod sceny (0baf:1e89, 0baf:344c), poza symulacją; ich znaczenie wynika z tego kodu **[kod]**
i z porównania z pamięcią gry (`jump-scene.md`).

### Scenografia (pozostałe wywołania gałęzi)

| Procedura | Argumenty | Znaczenie |
|---|---|---|
| 1eee:0437 | 6 rekordów: Single x0, Single x1, bajt c0, bajt c1 | podpory najazdu od x0 do x1 (m), kolor boków c0, kolor frontu od c0 do c1; x0 = 0: rekord nieużywany |
| 003f:9da5 | bajty R, G, B | kolor nieba przy horyzoncie (6 bitów na składową); zmienia wpisy palety 240..255 |
| 0baf:1c31 | słowo ziarno, słowo A | ziarno generatora i amplituda fal terenu w tle |
| 0baf:1e89 | brak | buduje tablice warstw z profilu i powyższych danych |
| 0baf:602e | słowa a1, a2, xmin, xmax, ziarno | drzewa: round(0,8·a1) świerków i round(0,8·a2) sosen od xmin do xmax (m) |

Skocznie 4 i 9 po rozstawieniu drzew wykonują własne pętle `for i := a to b do x[warstwa][i] := -200`, które
chowają kilka drzew poza ekran (skocznia 4: warstwa 3 rekordy 1..3 i warstwa 9 rekordy 3..5, skocznia 9:
warstwa 5 rekordy 1..3). Port odczytuje je z kodu gałęzi.

## `Dsj.dat`

Odczyt zasobu (1bc6:0039): `u32` przesunięcie pod indeksem·4 (0 = brak zasobu), pod przesunięciem `u16`
długość i dane. Katalog kończy się tam, gdzie zaczyna się pierwszy zasób (v2.10P: 1000 pozycji, 62 zasoby).

Zasób 220 to teksty interfejsu (polskie): tablica `u16` przesunięć; przesunięcie wskazuje bajt za bajtem
długości, tekst w stronie kodowej 852. Nazwa skoczni n to tekst 198 + n (1..32: nazwy krajów, 33..37: polskie
skocznie).

Zasoby 100..121 to bitmapy drzew sceny (dwa gatunki po 11 rozmiarów, kodowanie ciągami: `u16` długość, pole
`x0, y0, x1, y1, kotwica x, kotwica y`, potem odcinki `u16` przesunięcie, `u16` liczba, bajty indeksów palety,
aż do przesunięcia `FFFF`). Port ich nie czyta: rysuje własne drzewa w tych samych miejscach i rozmiarach.

## Weryfikacja

`tools/re/hill_capture.py` uruchamia grę dla każdej skoczni i zapisuje stan po ustawieniu profilu
**[pomiar]**: profil (20 pól) i punkt K wszystkich 37 skoczni odczytanych z `Dsj.exe` zgadzają się
z oryginałem bit w bit, łącznie ze współczynnikami wyliczanymi w podwójnej precyzji. Z tego samego zapisu
`src/render/hill-scene.golden.test.ts` sprawdza dla 37 skoczni scenografię: paletę, fale tła, wysokość bazową,
linie, początki płotów, ściany i podpory najazdu, belkę i drzewa (`jump-scene.md`, „Weryfikacja”).
