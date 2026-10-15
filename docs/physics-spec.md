# DSJ2: model fizyki skoczka (specyfikacja robocza)

Źródło: analiza `Dsj.exe` z DSJ2 v2.10P (Borland Pascal 7, DOS). Moduł fizyki to segment `1c06`
(funkcje `jumper_reset` 1c06:0010 i `jumper_step` 1c06:02a1). Adresy danych odnoszą się do segmentu
danych gry (22F2h). Oznaczenia pewności: **[kod]** odczytane z kodu, **[pomiar]** zaobserwowane
w emulacji podczas odtwarzania `KARPACZ.RPL`, **[hipoteza]** do potwierdzenia.

## Krok czasowy i jednostki

- `jumper_step` wywoływana raz na klatkę; `dt = 1/70 s` (zmienna `DS:14EE` = 0,0142857) **[pomiar]**.
  70 Hz to częstotliwość odświeżania trybu VGA 13h **[hipoteza: synchronizacja z pionowym powrotem]**.
- Wszystkie zmienne stanu to `Single` (float32); każde przypisanie zaokrągla do float32, obliczenia
  pośrednie biegną w precyzji x87 (80 bitów) **[kod]**.
- Jednostki: metry, sekundy, kilogramy, radiany. `g = 9.81`, masa `m = 60` (`DS:52E0`) **[kod]**.

## Stan

| Adres | Nazwa | Znaczenie |
|---|---|---|
| 5298 | `x` | pozycja pozioma |
| 52A0 | `y` | wysokość (rośnie w górę) |
| 52A4 | `vx` | prędkość pozioma |
| 52A8 | `vy` | prędkość pionowa, dodatnia w dół |
| 52AC | `speed` | moduł prędkości (na torze: prędkość wzdłuż toru) |
| 52B0 | `track_angle` | kąt toru użyty w kroku naziemnym |
| 52B4, 52B8 | `prev_x`, `prev_y` | pozycja z poprzedniej klatki |
| 5296 | `airborne` | 0 na torze, 1 w locie |
| 5297 | `contact_event` | ustawiane przy wybiciu z progu i przy zmianie fazy |
| 52D8 | `ref_y` | wysokość odniesienia bilansu energii |
| 52DC | `ref_speed` | prędkość odniesienia bilansu energii |
| 52E4 | `energy_lost` | energia rozproszona od chwili `ref_*` (J) |
| 52FA | `pose_id` | numer pozy szkieletu (moduł 1cb6, ustawia 1cb6:0d15); pozy 8, 9 i 100 dokładają hamowanie |

Parametry skoczni (Karpacz K85, **[pomiar]**): start `x = 11.4` (`45B2`), próg `x = 44.0` (`45CE`),
współczynnik tarcia rozbiegu `0.02` (`45B6`), zeskoku `0.05` (`4624`). Wiatr: prędkość `4D1C`,
kierunek (kąt) `4D20`, zmienne w czasie **[pomiar]**. `4D06` = 0,5 (współczynnik powierzchni
nośnej sylwetki, ustawiany także w `0baf`) **[hipoteza co do znaczenia]**.

Profile terenu: `hill_y(x)` = 1eee:0000 dla `x <= takeoff_x` (rozbieg), 1eee:015e dla `x > takeoff_x`
(zeskok), 1eee:0627 zwraca wysokość terenu do bilansu przy lądowaniu **[kod; implementacja profili
do odczytania]**.

## Faza naziemna (`airborne = 0`): bilans energii

1. `track_angle = -inrun_slope_angle` (`52F2`; na K85 rozbieg ma -π/4).
2. Jeśli `speed == 0`, to `speed = 0.0001`.
3. `mu = x < takeoff_x ? mu_inrun : mu_land`.
4. Prędkość względem wiatru wzdłuż toru:
   `v_rel = max(0, speed - 0.2 * wind_speed * cos(wind_dir) * cos(track_angle))`.
5. Strata energii w klatce (droga `speed * dt`):
   `energy_lost += |speed * dt * (mu * m * g * cos(track_angle) + 0.583 * k_4D06 * v_rel^2)|`.
6. Dodatkowe hamowanie zależne od `pose_id`: dla 8 i 100 dodaje
   `|speed * dt * mu * 10 * m * g * cos(track_angle)|`, dla 9 to samo z mnożnikiem 20.
7. Ograniczenie: `energy_lost <= m*g*(ref_y - y) + 0.5*m*ref_speed^2`.
8. Nowa prędkość z zasady zachowania energii:
   `speed = sqrt(|2 * (m*g*ref_y + 0.5*m*ref_speed^2 - energy_lost - m*g*y) / m|)`.
9. `vy = sin(track_angle) * speed`, `vx = cos(track_angle) * speed`, `x += vx * dt`.
10. Przekroczenie progu w tej klatce (`x_przed_ruchem < takeoff_x` i `x > takeoff_x`) ustawia `contact_event = 1`
    i pomija przyklejenie do terenu; w przeciwnym razie `y = hill_y(x)`.

Uwaga: `y` z kroku 8 pochodzi z poprzedniej klatki (przed przesunięciem `x`) **[kod]**.

## Faza lotu (`airborne = 1`)

1. Wiatr poziomy `w = wind_speed * cos(wind_dir)`; prędkość względna `u = vx - w`.
2. Kąt napływu `alpha = |u| > 0.0001 ? atan(vy / u) : pi/2`; moduł `V = sqrt(u^2 + vy^2)`.
3. Siły od sylwetki i nart (`body_angle` = `4CBC`, kąty nart `5314`, `5340`):
   - `F_body = 0.53 * 1.1 * k_4D06 * V^2 * sin(0.35 + body_angle + alpha)`
   - `F_ski1 = 0.139284 * V^2 * sin(alpha + ski1_angle)`
   - `F_ski2 = 0.139284 * V^2 * sin(alpha + ski2_angle)`
4. Składowe (wartości bezwzględne każdego składnika):
   - `Fy = |cos(0.35 + body_angle) * F_body| + |cos(ski1) * F_ski1| + |cos(ski2) * F_ski2| + 0.1166 * vy^2`
   - `Fx = |sin(0.35 + body_angle) * F_body| + |sin(ski1) * F_ski1| + |sin(ski2) * F_ski2| + 0.1166 * vx^2`
   - `Fy = min(Fy, m*g)`
5. Całkowanie (jawny Euler, kolejność ma znaczenie):
   `vy += (g - Fy/m) * dt`; `vx -= (Fx/m) * dt`; `x += vx * dt`; `y -= vy * dt`.

Uwaga: człon `0.1166 * v^2` używa prędkości absolutnych, nie względem wiatru **[kod]**.

## Przejścia faz

- Na torze, gdy teren pod skoczkiem jest niżej niż `y` (`hill_y(x) < y`): `airborne = 1`,
  `contact_event = 1`; po upadku (`4D04 != 0`, typ upadku) dodatkowo losowe zaburzenie pozy (1cb6:0457).
- W locie, gdy `hill_y(x) >= y` (lądowanie): `energy_lost = 0`, `ref_y = terrain_y(x)` (1eee:0627),
  kąt uderzenia `beta = |atan(-vy/vx) - inrun_slope_angle|` (lub `pi - inrun_slope_angle` gdy `vx = 0`),
  `ref_speed = cos(beta) * sqrt(vx^2 + vy^2)`, `y = ref_y`, `speed = ref_speed`, `airborne = 0`,
  `landed = 1` (`52E8`).
  Prędkość prostopadła do zeskoku jest tracona.

## Koniec kroku: wybicie i nachylenie terenu

- Jeśli `contact_event = 1`: `contact_event = 0`, `airborne = 1`, `track_angle = -slope_angle`,
  `vy = sin(track_angle) * speed - impulse_y / m`, `vx = cos(track_angle) * speed + impulse_x / m`,
  następnie `impulse_x = impulse_y = 0` (`4CD4`, `4CD8`, N·s) **[kod]**.
- Zawsze na końcu: `slope_angle = atan(teren'(x))` (1eee:0676; rozbieg dla `x <= takeoff_x`).
  W fazie naziemnej i przy lądowaniu używany jest więc kąt z poprzedniej klatki **[kod]**.

## Profil skoczni (moduł 1eee)

Parametry ustawiają 1eee:051f (rozbieg) i 1eee:06e1 (zeskok) przy wczytaniu skoczni.

- Rozbieg `inrun_y(x)`: dla `x < x1` stała `a*x1 + b`; dla `x1 <= x <= x2` prosta `a*x + b`;
  dla `x > x2` parabola `c*x^2 + d*x + e`, gdzie `d = a - 2c*x2`, `e = a*x2 + b - c*x2^2 - d*x2`
  (ciągłość wartości i nachylenia w `x2`). Pochodna odpowiednio 0, `a`, `2c*x + d`.
- Zeskok `landing_y(x)`: dla `x <= x_t` profil `B + A * (e^{-u} - e^{u}) / (e^{u} + e^{-u})`,
  `u = (x - x0) * k` (czyli `B - A*tanh(u)`), dla `x > x_t` parabola wybiegu, której współczynniki
  liczone są z ciągłości w `x_t`. Pochodna części tanh: `-4*A*k / (e^{u} + e^{-u})^2`.
- Pod progiem (`x <= takeoff_x`) do zeskoku dodawany jest kształt rozbiegu z wagą `knoll_blend` (`4655`):
  `y -= inrun_curve(takeoff_x) * w`, potem `y += (x <= x2 ? a*x + b : inrun_curve(x)) * w`.
- Wysokość terenu przy lądowaniu (1eee:0627) używa `x < takeoff_x` (ostra nierówność), a funkcje kroku
  `x <= takeoff_x`; port zachowuje obie wersje.
- Długość łuku zeskoku (1eee:0830): całkowanie metodą punktu środkowego ze stałym krokiem,
  `L += sqrt(teren'(x + krok/2)^2 + 1) * krok`; ostatni krok skracany do końca przedziału.
  Służy do pomiaru odległości **[kod; parametry wywołania do ustalenia]**.

## Wiatr (0baf:976a, raz na klatkę przed krokiem fizyki)

Co 10 klatek (`round(frame * dt * 70) mod 10 = 0`, zaokrąglenie do parzystej):

- `wy += G * zmienność`, potem `wx += G * zmienność`, gdzie `G` to średnia pięciu `Random(65535)`
  przeskalowana do [-1, 1] (`(suma/5/65534)*2 - 1`).
- Kierunek: `atan(wy/wx)` dla `wx > 0`, `atan(wy/wx) + pi` dla `wx < 0`, `±pi/2` dla `wx = 0`.
  Prędkość `sqrt(wy^2 + wx^2)`; powyżej 3,8 m/s obie składowe mnożone przez `1 - (v - 3.8)/50`.
- Wskaźnik kierunku goni kierunek wiatru z przyspieszeniem 0,05 rad i limitem 0,2 rad na aktualizację
  (strefa martwa `|sin(różnica)| <= 0.05`).

Weryfikacja: zgodność bit w bit ze stanem gry, łącznie z `RandSeed`, w 876 klatkach `KARPACZ.RPL` **[pomiar]**.

## Fazy skoku i sterowanie (0baf:9c52, odczyt częściowy)

Zmienna fazy `4CBB`: 1 belka, 2 zjazd, 3 kucanie, 4 okno wybicia, 5 po wybiciu, 6–7 lot, 8 przygotowanie
do lądowania, 9 i 11 lądowanie, 12 upadek **[kod; nazwy faz 3, 5, 9, 11: hipoteza]**.

- Start (faza 1 → 2): lewy przycisk po klatce 65; `ref_speed = speed = 1` m/s, poza 2.
- Faza 2 → 3 po ponad 20 klatkach zjazdu bez wciśniętych przycisków; 3 → 4 po wciśnięciu przycisku
  (zapis klatki `button_start` w powtórce); `lift_factor = 1`, poza 4.
- Wybicie (faza 4, dopóki `x < takeoff_x`): co klatkę
  `F = (lewy + prawy) * 1275 * dt * cos(((knee/1.08 - 0.5)/0.5) * pi/2)`, gdzie `knee` = `5300`
  (kąt w szkielecie skoczka); `impulse_x -= sin(slope) * F`, `impulse_y += cos(slope) * F`;
  licznik czasu wybicia `4CB7 += (lewy + prawy) * dt / 2`.
- Gdy `knee > 1.07`: jeśli skoczek jest jeszcze przed progiem, wymuszone wybicie (`contact_event = 1`)
  i korekta licznika czasu; faza 5.
- Lot (fazy 6–7): `body_angle -= dy_myszy * dt * 1.5`; losowe zakłócenia (każde `Random(n) = 1`):
  z p = 1/30 `body_angle += (7 - wiatr_x) * dt / 10`, oraz drgania kończyn `4CC0..4CCC`
  (Random(5), Random(60), Random(100), Random(10)); ograniczenie `body_angle` do ±0,6.
  Kąty nart `5314`, `5340` pochodzą z modułu szkieletu `1cb6`.
- Faza 7 → 8 po wciśnięciu przycisku: `body_angle = 0.75`, poza 6. Przycisk wybiera nogę wysuniętą do przodu
  (prawy: noga 0, lewy: noga 1); obie drogi prowadzą do tego samego przygotowania do telemarku **[kod]**.
  Wcześniejsza hipoteza „prawy to telemark, lewy na dwie nogi” nie znajduje potwierdzenia w kodzie.
  Czas przygotowania rośnie do 0,6 s i zatrzymuje się po wciśnięciu drugiego przycisku albo przy dotknięciu zeskoku;
  kara w notach rośnie z `(0.4 - czas)²`, więc najlepiej wcisnąć przycisk około 0,4 s przed ziemią, a długie
  przygotowanie zwiększa składową upadku `czas * 92` **[kod]**.

Ziarno generatora jest zapamiętywane przed odczytem wejścia i odtwarzane po nim (0baf:9a3c),
więc odczyt wejścia nie zmienia sekwencji losowej **[kod]**.

## Szkielet skoczka (moduł 1cb6)

Dwie nogi, każda z dwoma długościami odcinków (górny do 1,08 m, dolny do 0,74 m) i dziewięcioma kątami stawów.
Każdy kanał ma wartość bieżącą, docelową i prędkość; co klatkę wartość zbliża się do celu o `prędkość * dt`
(albo przeskakuje na cel, gdy jest bliżej). Poza (1cb6:0d15) ustawia cele i prędkości z tabeli; prędkość 0 oznacza
natychmiastowe ustawienie, wartość -99 kąta oznacza „nachylenie terenu”. Fizykę zasilają: kąt nart (staw 2 obu nóg)
i długość górnego odcinka pierwszej nogi („kolano”, siła wybicia). Pozostałe stawy służą rysowaniu i ocenie stylu.

- Na torze narty dążą do kąta terenu (1cb6:0315), w locie do kąta zależnego od sylwetki i losowych drgań, przy ziemi
  mieszanego z nachyleniem terenu proporcjonalnie do bliskości ziemi (`2A0E`).
- Uderzenie (upadek w locie, lądowanie przy upadku, odbicia) losowo zaburza pozę (1cb6:0457): stawy 0, 1, 2, 4, 5
  i 6 obu nóg oraz długości odcinków, zużywając generator losowy.
- Przed przyziemieniem długości nóg dopasowują się tak, by obie stopy dotykały zeskoku (zmienne `5420..5438`).

## Lądowanie, odległość i noty

- W klatce przyziemienia liczonych jest pięć składowych „uderzenia” (kąt i prędkość uderzenia, czas przygotowania,
  ułożenie tułowia i nóg, rozstaw nart, ugięcie nóg) i ich średnia; składowa + średnia > 60 oznacza upadek danego typu.
- Odległość: długość łuku zeskoku od progu do `x - czas_przygotowania`, krok 0,1 m, obcięta do centymetrów; do punktów
  zaokrąglona w dół do pół metra. Punkty za odległość: `60 + (d - K) * 2` dla K <= 90, `* 1.8` dla K < 145,
  `120 + (d - K) * 1.2` powyżej.
- Pięciu sędziów: nota 20 minus kary (rozstaw nóg, upadek, spóźnione przygotowanie, czas wybicia, styl lotu) z
  losowymi wagami i szumem, zaokrąglenie do pół punktu; skrajne noty odrzucane.

## Weryfikacja

Ślady stanu oryginalnej gry z sześciu powtórek z dystrybucji (Karpacz, REC-FIN, Szczyrk, Wisła, Zakopane 1 i 2)
**[pomiar]**:

- Krok fizyki, wiatr, logika klatki i szkielet: zgodność we wszystkich klatkach wszystkich sześciu skoków
  (tolerancja względna 1e-6), w większości bit w bit, łącznie ze stanem generatora losowego.
- Pełna symulacja uruchomiona tylko z pliku `.rpl` (oraz geometrii skoczni) odtwarza każdą klatkę oryginału
  i dokładnie zapisaną odległość (np. 89,92 m w Karpaczu), noty i punkty.
- Jedyna znana różnica co do bitu: prędkość bliska zeru na końcu wybiegu (oryginał liczy w 80 bitach).
- Ścieżki upadków nie występują w powtórkach z dystrybucji. Pięć spreparowanych powtórek (`docs/testing.md`)
  pokrywa upadek przy lądowaniu (typy 2 i 4) z przejściem w pozę upadku, odbicia (do trzech), fazy 6 i 9
  oraz telemark z dwoma przyciskami; port odtwarza każdą ich klatkę i odległość zmierzoną przez oryginał.
- Ślady FALL1..FALL5 (plany z wyszukiwania upadków, `docs/testing.md`, „Wyszukiwanie upadków”) pokrywają każdy
  z pięciu typów upadku po jednym skoku; port odtwarza każdą ich klatkę i odległość zmierzoną przez oryginał.
- Niesprawdzone śladem: dotknięcie zeskoku przed progiem.

## Do ustalenia

Dane skoczni i format `Dsj.dat`: `docs/hill-format.md`.

- Sterowanie komputerowych zawodników (0baf:8ee4) i tryb zawodów.
