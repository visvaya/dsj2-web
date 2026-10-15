# Scena skoku (v2.10P)

Jak oryginał rysuje skocznię i tło (0baf:344c, tablice z 0baf:1e89) i jak robi to port: `src/render/jump-view-scene.ts`
oraz moduły `scene-*.ts` i `hill-layer-tables.ts`. Dane każdej skoczni: `hill-format.md`, figura skoczka:
`jumper-figure.md`.

## Rzut: warstwy w perspektywie

Oryginał nie ma jednego rzutu sceny. Rysuje ją z warstw 1..24, każda w skali `p` (tablica Single pod `DS:14EE`;
port: `LAYER_SCALE`), wokół punktu zbiegu blisko górnego brzegu ekranu:

```
X = 160 + p·(14·(x − x_skoczka) − 9)
Y = 12 + p·(14·200/240·(y_skoczka − y) + 58)
```

Dalekie warstwy (`p` < 1) przesuwają się wolno, bliskie szybko. Warstwy samej skoczni:

| Warstwa | p | Co leży |
|---|---|---|
| 17 | 0,933 | dalsza krawędź zeskoku i dalszy płot |
| 19 | 1,182 | dalsza strona rynny najazdu |
| 20 | 1,33 | płaszczyzna skoczka (ślady nart, cień, belka) |
| 21 | 1,52 | bliższa strona rynny najazdu i bliższa ściana |
| 23 | 2,313 | bliższa krawędź zeskoku i bliższy płot |

Zeskok jest więc pasem między dwiema kopiami tego samego profilu w różnych skalach, a linie odległości łączą
ten sam punkt profilu na warstwie 17 i na warstwie 23. Pochylenie linii zależy od tego, jak daleko przed albo
za kamerą leży punkt: linia pod kamerą jest pionowa, przed nią pochyla się w prawo, za nią w lewo.

Kamera: `camX = 14·x_skoczka + 9`, `camY = 14·200/240·y_skoczka + 70` (przesunięcia `DS:4D36`, `4D3A` działają
tylko w kamerach studia powtórek). Przesunięcie warstwy: `trunc(p·camX)` i `trunc(p·camY − 12·(p − 1))`.
Tablica warstwy: indeks `j` to `x = (j − 160)/(14·p)`, wartość to `−round(14·p·h(x)·200/240)`; kolumna ekranu
`sx` pokazuje indeks `przesunięcie + sx`.

Figura skoczka ma skalę 1 (14 px/m), a stoi w miejscu warstwy 20: stopa w kolumnie 148, w wierszu 87.

## Kolejność rysowania

Scena składa się z kolumn: procedura 0baf:2f7f wypełnia odcinek kolumny indeksami palety od jednego do drugiego
(wartości 8.8; krok to różnica przez liczbę wierszy, pierwszy wiersz dostaje już jeden krok).

1. Niebo: 16 pasów po 3 wiersze, indeksy 240..255, nieruchome.
2. Tło: pasy śniegu między warstwami 1, 2, 4, 7, 11 i 17 (każdy ucięty dalszą krawędzią zeskoku), między nimi
   drzewa warstw 1..16.
3. Zeskok: od warstwy 17 do 23, kolory `20·cos(atan(14·nachylenie)) + 32` i `15·cos(...) + 48`.
4. Linie: co 5 m od `4648` (zielone, indeks 84), punkt K (czerwona, 75), rekord skoczni (niebieska, 107).
   Miejsce: punkt profilu po łuku od progu o odległość + 0,15 m (rekord + 0,25 m), 1eee:08fb.
5. Dalszy płot: 5 wierszy nad warstwą 17, słupek co 60 indeksów; od progu + 1 m + `4651`.
6. Podpory najazdu, potem rynna (dalsza listwa, tor, platforma startowa z tylną ścianą, koniec toru z czołem
   progu), ślady nart (przyciemnione indeksy śniegu dwa wiersze nad i pod linią skoczka).
7. Cień, dalsza połowa belki, skoczek, bliższa połowa belki.
8. Bliższa ściana rynny (przed skoczkiem), bliższy płot (11 wierszy nad warstwą 23, słupek co 130 indeksów),
   śnieg przed bliższą krawędzią.

## Paleta

Budowana wzorem (003f:9df1): 13 ramp od czarnego przez barwę do bieli; środek rampy przesunięty ku szarości
(`c·0,85 + suma·0,05` w arytmetyce 80-bitowej oryginału, z zaokrągleniem połówek do parzystej). Od skoczni
zależy tylko niebo (003f:9da5): wpisy 241..255 przechodzą do koloru nieba skoczni. Port: `scene-palette.ts`.

## Tło

Pięć warstw tła miesza profil skoczni z falami sinusów (0baf:1c31: 5 zestawów po 4 fale z ziarna skoczni;
oryginał liczy też średnie fazy i częstotliwości, po czym od razu je nadpisuje nowymi losowaniami):

| Warstwa | Wysokość | Kolor |
|---|---|---|
| 1 | 0,03·profil + 0,97·(fale 1 + D) | stały, 62 → 58 |
| 2 | 0,4·profil + 0,6·(fale 2 + D) | stały, 58 |
| 4 | 0,6·profil + 0,4·(fale 3 / 1,5 + D) | `8·cos(...) + 46` |
| 7 | 0,8·profil + 0,2·(fale 4 / 2,5 + D) | `12·cos(...) + 38` |
| 11 | 0,95·profil + 0,05·(fale 5 / 2,5 + D) | `18·cos(...) + 34` |

`D` to wysokość bazowa `464E`.

## Drzewa

0baf:602e rozstawia raz na skocznię, z jej ziarna, świerki i sosny na warstwach 2..15 (rozmiar `t` od 2 do 12,
na warstwach 12..15 największy), najwyżej 20 na warstwę; od 30 m przed progiem do 20 m za nim tylko na
warstwach poniżej 11. Wysokość podstawy: tablica warstwy albo mieszanka dwóch sąsiednich tablic kluczowych
według `p`. Oryginał rysuje bitmapy z `Dsj.dat` (zasoby 100..121); port rysuje własne drzewa (`scene-trees.ts`)
w tych samych miejscach i rozmiarach.

## Różnice portu (świadome)

- Widok ma kwadratowe piksele i szerokość od 256 do 432 kolumn: kolumna portu odpowiada 6/5 kolumny oryginału
  (`SQUARE_PIXEL_WIDTH`), środki ekranów się pokrywają; tablice liczone są także poza zakresem oryginału.
- Drzewo, którego tablica kluczowa w oryginale nie sięga (daleko za belką), dostaje u oryginału wysokość spoza
  tablicy; port stawia je na ziemi.
- Linia wychodząca poza ekran: oryginał przycina tylko jej wiersze (zmienia nachylenie), port rysuje ją całą
  i obcina piksele.
- Dodatki portu: pora dnia i pogoda, rękawy wiatru i maszty na dalszym płocie, lampki na najeździe, gwiazdy,
  księżyc, ptaki, duch rekordu (`scene-extras.ts`, `jump-view-ghost.ts`). Śnieg oryginału (pojedyncze piksele na
  warstwach, natężenie losowane przy wejściu na skocznię i zapisywane w powtórce) port zastępuje własnym.

## Weryfikacja

- **[pomiar]** Scena narysowana przez port w geometrii oryginału (320 kolumn, 14 px/m) zgadza się piksel w piksel
  ze zrzutami emulatora (`tools/re`) dla Karpacza, Anglii K50, Niemiec K120, Zakopanego 1 i Słowenii K250, poza
  drzewami, interfejsem i kolorami stroju (porównanie 2026-10-15).
- **[pomiar]** `src/render/hill-scene.golden.test.ts` porównuje z zapisanym stanem oryginału po ustawieniu każdej
  z 37 skoczni: paletę (768 bajtów), fale tła, wysokość bazową, linie, początki płotów, ściany i podpory najazdu,
  belkę i drzewa (miejsce, rozmiar, wysokość; bez drzew opisanych wyżej).
