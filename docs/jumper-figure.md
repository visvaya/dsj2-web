# Figura skoczka (v2.10P)

Oryginał nie ma sprite'ów skoczka: rysuje go z pozy (`src/sim/pose.ts`) jako szkielet 3D w rzucie ukośnym.
Port: `src/render/jumper-skeleton.ts`, rysowanie: `src/render/jump-view.ts`.

## Znaczenie pól pozy

Każda „noga” w `PoseState` to połowa ciała (0 i 1):

| Pole | Znaczenie |
|---|---|
| odcinek 0 | noga, biodro do stopy (do 1,08 m) |
| odcinek 1 | ręka, bark do dłoni (do 0,74 m) |
| staw 0 | rozchylenie narty (V) |
| staw 1 | kąt narty |
| stawy 2, 3 | kierunek nogi i jej odchylenie w bok |
| stawy 6, 7 | kierunek ręki i jej odchylenie w bok |
| staw 4 (połowa 0) | tułów |
| staw 5 (połowa 0) | głowa |
| staw 8 (połowa 0) | obrót całej figury |

## Kinematyka (1cb6:1418)

21 punktów (z w bok, x w przód, y w górę) względem stopy nogi przedniej (`DS:4CDC` = noga przednia + 1),
zapisywanych od `DS:4456` co 12 bajtów. Miednica leży na końcu nogi przedniej; tułów 0,49 m, barki ±0,22 m,
głowa 0,24 m od szyi; narty: 1 m za wiązaniem, 1,628 m przed nim, czubek 1,648 m odgięty o 0,04 rad.
Kolano i łokieć: połowa odcinka (0,54 i 0,37 m) pod kątem kierunku kończyny minus albo plus zgięcie
`arccos(i/100)`, gdzie `i` to długość odcinka w procentach maksimum (tablica `DS:42C2`, wypełniana przez
1cb6:2291).

## Rzut i rysowanie (1cb6:20e1, 1f8b:00dc)

`x_ekr = (x − 0,15·z)·14`, `y_ekr = 200 − (y − 0,5·z)·14·200/240`: 14 px/m w poziomie i 11,67 px/m w pionie
na ekranie 320×200 o proporcjach 4:3, czyli po wyrównaniu proporcji 11,67 px/m w obu osiach (tę skalę
przyjmuje nasz renderer). 16 kości w stałej kolejności (dalsza połowa, tułów i głowa, bliższa połowa); każda
ma część stroju (kombinezon, spodnie, rękawy, rękawice, kask, narty) i odcień. Pędzel 2×2 piksele albo
plamka 4×4 dla kości grubych; kość z punktu do niego samego to kropka (dłonie, głowa, czubki nart).

Cień (1cb6:1d2a) to te same kości jednym kolorem, rzucone na płaszczyznę terenu pod skoczkiem.

## Weryfikacja

**[pomiar]** Punkty liczone przez port z pozy zapisanej w śladzie zgadzają się z punktami zapisanymi przez
oryginał we wszystkich klatkach 11 śladów (różnica poniżej 0,1 mm; `jumper-skeleton.golden.test.ts`).
Kolory stroju i wygląd najazdu są własne.
