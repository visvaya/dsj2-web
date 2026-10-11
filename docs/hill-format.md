# Skocznie w plikach oryginału (v2.10P)

Geometria skoczni nie jest w `Dsj.dat`, tylko w kodzie `Dsj.exe`, jako stałe przekazywane do procedur
ustawiających profil. `Dsj.dat` dostarcza nazwy (oraz grafikę i dźwięki). Odczyt: `src/original/`.

## Tabela skoczni w `Dsj.exe`

Procedura 0baf:631c (argument: numer skoczni 1..37) porównuje numer z kolejnymi wartościami:

```
cmp al, N ; je +3 ; jmp <następne porównanie>
push ... ; call 1eee:051f      ; rozbieg
push ... ; call 1eee:06e1      ; zeskok i wybieg
push ... ; call 1eee:0437      ; dekoracje (do ustalenia)
push ... ; call 003f:9da5, 0baf:1c31, 0baf:1e89, 0baf:602e   ; kolory i grafika (do ustalenia)
jmp 0baf:8843                  ; ostatnia gałąź (37) przechodzi tam bez skoku
```

Parametry to argumenty natychmiastowe instrukcji PUSH. Pascal odkłada argumenty od lewej do prawej, Single
jako słowo starsze, potem młodsze. `push imm8` jest rozszerzane ze znakiem.

### 1eee:051f, rozbieg (20 słów)

| Słowa | Typ | Pole | Uwagi |
|---|---|---|---|
| 0-1 | Single | `45C2` | grafika |
| 2-3 | Single | koniec płaskiego odcinka | `inrunFlatEndXM` |
| 4-5 | Single | koniec prostej | `inrunLineEndXM` |
| 6-7 | Single | próg | `takeoffXM` |
| 8-9 | Single | start | `startXM` |
| 10 | bajt | `45E7` | grafika |
| 11-12 | Single | nachylenie prostej | `inrunLineSlope` |
| 13-14 | Single | wyraz wolny prostej | `inrunLineInterceptM` |
| 15-16 | Single | współczynnik paraboli | `inrunCurveA` |
| 17 | słowo | `45DE` | grafika |
| 18 | słowo | `45E0`, `45E2`, `45E4` | grafika |
| 19 | bajt | `45E6` | grafika |

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
| 12 | słowo | `4648` | grafika |
| 13 | słowo | `464A` | najwyżej 13; grafika i komputerowi zawodnicy |
| 14 | słowo | punkt K w metrach | `464C` |
| 15 | słowo | nieużywane | |
| 16 | bajt | `4650` | grafika |
| 17-18 | Single | `4651` | grafika |
| 19-20 | Single | wtopienie kształtu rozbiegu w zeskok poniżej progu | `knollBlend` (`4655`) |

Wyliczane: `B = landing_slope(x0) - 2*A*x0`, `C = landing_y(x0) - A*x0*x0 - B*x0` dla `x0` = początek wybiegu
(ciągłość z profilem tanh); tarcie 0,05.

Symulacja (0baf:9c52, 1c06:02a1) czyta z tych danych tylko profil i punkt K **[kod]**. Pola opisane jako
„grafika” czyta wyłącznie kod pod adresami 0baf:1f10..0baf:5449, poza symulacją; ich znaczenie to
przypuszczenie. Pole `464A` czyta też sterowanie komputerowych zawodników (0baf:9333).

## `Dsj.dat`

Odczyt zasobu (1bc6:0039): `u32` przesunięcie pod indeksem·4 (0 = brak zasobu), pod przesunięciem `u16`
długość i dane. Katalog kończy się tam, gdzie zaczyna się pierwszy zasób (v2.10P: 1000 pozycji, 62 zasoby).

Zasób 220 to teksty interfejsu (polskie): tablica `u16` przesunięć; przesunięcie wskazuje bajt za bajtem
długości, tekst w stronie kodowej 852. Nazwa skoczni n to tekst 198 + n (1..32: nazwy krajów, 33..37: polskie
skocznie).

## Weryfikacja

`tools/re/hill_capture.py` uruchamia grę dla każdej skoczni i zapisuje stan po ustawieniu profilu
**[pomiar]**: profil (20 pól) i punkt K wszystkich 37 skoczni odczytanych z `Dsj.exe` zgadzają się
z oryginałem bit w bit, łącznie ze współczynnikami wyliczanymi w podwójnej precyzji.
