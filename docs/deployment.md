# Wydanie, tryb offline i wdrożenie

Gra jest zbiorem plików statycznych: nie ma serwera aplikacji, kont ani analityki, a dane gracza zostają
w przeglądarce. Ten dokument opisuje, z czego składa się wydanie, jak gra działa bez sieci i jak aktualizuje
się u gracza, jak wydanie trafia na hosting (Cloudflare Workers ze statycznymi zasobami) i jak je wycofać.

## Pakiet

`pnpm build` kończy się krokiem wydania (`scripts/write-release.mjs`) i zostawia w `dist/` dokładnie to, co jest
wdrażane:

| Plik | Rola |
|---|---|
| `index.html`, `assets/*.js`, `assets/*.css` | strona i paczki z hashem treści w nazwie; czcionki są w arkuszu stylów |
| `manifest.webmanifest`, `icons/*.png` | instalacja na ekranie głównym; ikony rysuje renderer gry (`scripts/make-icons.mjs`) |
| `licenses/silkscreen-ofl.txt` | licencja czcionek rozpowszechnianych w arkuszu stylów |
| `release.json` | wersja (`version`), commit źródła (`sourceSha`) i identyfikator zawartości (`contentId`) |
| `sw.js` | service worker z listą plików wydania i ich skrótami SHA-256 |
| `_headers` | nagłówki odpowiedzi dla hostingu; host nie serwuje tego pliku |

Obok powstaje `dist.sha256`: skróty wszystkich plików pakietu w formacie `sha256sum --check`.

Kolejność kroku wydania: wynik bundlera i pliki z `public/` są wejściem; z nich powstaje `contentId` (skróty
i ścieżki plików wejściowych oraz źródło workera), potem `release.json`, potem lista plików dla workera, na końcu
`sw.js`. Nic nie zależy od czasu uruchomienia: to samo źródło daje te same bajty. Commit, który nie zmienia gry
(dokumentacja, testy), daje ten sam `contentId`.

## Wersja

Numer wersji ma jedno źródło: pole `version` w `package.json`, w postaci trzech liczb (`0.4.2`). Build wpisuje go
do gry (`vite.config.ts`, `src/game/version.ts`), gdzie widać go w nagłówku menu głównego, w menu skoku
i w nakładce `?diag`, oraz do `release.json`. Publikacja oznacza opublikowany commit tagiem `v<wersja>` i zakłada
wydanie na GitHubie z listą PR od poprzedniego (zadanie `release`).

PR, który zmienia grę, podnosi numer o krok, który wskazuje jego tytuł (Conventional Commits): `feat` środkową
liczbę, każdy inny typ ostatnią, zmiana łamiąca (`!`) pierwszą, a przed 1.0 środkową. PR, który gry nie zmienia
(dokumentacja, testy, workflow, narzędzia), numeru nie rusza. Grę zmieniają pliki, z których powstaje pakiet:
`src/` (bez testów), `public/`, `index.html`, konfiguracja Vite i TypeScriptu, `package.json` poza samym numerem,
lockfile, `deploy/wrangler.jsonc` i krok wydania (`scripts/lib/version-rules.mjs`).

```sh
pnpm version:bump "feat(ui): tytuł PR"   # ustawia numer względem origin/master; ponowne uruchomienie nic nie zmienia
```

Pilnują tego dwie kontrole: `hygiene` w PR (`scripts/check-version.mjs`: numer zgodny z tytułem i zmienionymi
plikami) i `deploy` przed publikacją (`scripts/compare-release.mjs`: zmieniona gra musi mieć numer wyższy niż
wdrożona, inaczej nic nie jest publikowane). Dwa PR zmieniające grę, scalone jeden po drugim bez odświeżenia
drugiego, mogą nieść ten sam numer; wtedy publikację zatrzymuje druga kontrola i trzeba podnieść numer w nowym PR.

`pnpm check:dist` (`scripts/lib/dist-rules.mjs`) wymaga, żeby w `dist/` były wszystkie pliki z listy i nic poza
nimi, bez plików oryginalnej gry, w budżetach rozmiaru (paczki, worker, ikony). Podgląd jednoplikowy
(`pnpm build:single`) trafia do `dist-single/` i nie jest częścią pakietu: nie ma manifestu, ikon ani workera.

## Service worker

Źródło: `scripts/lib/service-worker-template.js`; krok wydania wpisuje do niego listę plików. Zasady:

- **Instalacja** pobiera każdy plik wydania, porównuje jego SHA-256 z listą i dopiero potem zapisuje wszystko do
  własnego cache (`telemark-shell-<id>`). Brak pliku, inna treść, przekierowanie albo brak miejsca kończy
  instalację błędem i nie zostawia żadnej części wydania; działające wcześniej wydanie zostaje nietknięte.
- **Nowe wydanie czeka.** Worker nie woła sam `skipWaiting()` ani nigdy `clients.claim()`, a strona nie
  przeładowuje się bez prośby gracza. Strona dostaje dokument i skrypty zawsze z jednego wydania, a skok nie jest przerywany. Nowe
  wydanie przejmuje stronę przy kolejnym uruchomieniu po zamknięciu wszystkich okien gry. Menu główne (u góry)
  i menu skoku pokazują wtedy w ramce „Jest nowa wersja gry: <numer>. Zamknij grę całkowicie [...] i uruchom ją
  ponownie”; numer podaje czekający worker (`version` w danych wydania i w odpowiedzi na pytanie strony
  o wydanie), worker sprzed 0.10 go nie zna i wtedy komunikat jest bez numeru. Komunikat pojawia się dopiero po
  1,5 s oczekiwania: przy pierwszym uruchomieniu po aktualizacji przeglądarka potrafi przez chwilę zgłaszać nowe
  wydanie jako czekające, zanim przejmie ono stronę, a komunikat na tę chwilę migałby.
- **Sprawdzenie i instalacja na żądanie.** Menu główne ma pod numerem wersji przycisk „Sprawdź aktualizację”
  (`registration.update()`); wynik pojawia się obok w regionie `role="status"`: „Sprawdzam...”, „Masz najnowszą
  wersję.”, „Jest nowa wersja gry. Pobieram ją.” albo „Brak połączenia: nie można sprawdzić.” (przeglądarka nie
  odróżnia braku sieci od braku odpowiedzi serwera). Kolejne naciśnięcia w trakcie sprawdzania nic nie robią.
  Bez workera (podgląd jednoplikowy, serwer deweloperski, niebezpieczny adres) przycisku nie ma: nie ma czego
  sprawdzać. W menu głównym ramka czekającego wydania jest krótka: „Jest nowa wersja gry: <numer>.”, przycisk „Zainstaluj teraz” i pod nim „Albo zamknij wszystkie okna gry i uruchom ją ponownie.”; linia obok przycisku sprawdzania przestaje wtedy mówić o nowej wersji. Po naciśnięciu „Zainstaluj teraz” strona wysyła do
  czekającego workera komunikat `telemark:take-over`, worker woła `skipWaiting()`, a strona przeładowuje się raz,
  gdy ten worker jest aktywny (śledzony po własnym stanie, nie po zmianie kontrolera strony, więc działa też na
  stronie wczytanej z pominięciem workera, np. po Ctrl+Shift+R). Menu skoku przycisku nie ma: przeładowanie
  przerwałoby skok. Inne otwarte okna gry nie są przeładowywane: przechodzą pod nowego workera, dalej działają
  na kodzie, z którym wystartowały; zamiast ramki czekającego wydania pokazują „Gra zaktualizowała się w innym oknie: przeładuj, żeby jej używać.”, w menu głównym z przyciskiem „Przeładuj” (w menu skoku bez niego). Okno rozpoznaje to po tym, że wydanie czekało, gdy stronę obsługiwał starszy worker, a ta strona o instalację nie prosiła. Strona startowa nowego
  wydania usuwa przy tym cache poprzedniego; okno starego wydania ma cały kod wczytany (gra nie doczytuje
  modułów), a plik, którego nowe wydanie nie ma, dostałoby z sieci.
- **Poprzednie wydanie zostaje zapisane, dopóki nie wystartuje strona nowego.** Przejęcie przez nowego workera
  niczego nie usuwa. Cache innych wydań (tylko z prefiksem gry) znika, gdy worker poda własną stronę startową
  z własnego cache, o ile żadne nowsze wydanie właśnie się nie zapisuje ani nie czeka: jego cache musi zostać.
  Zapis gracza (localStorage, IndexedDB) nie jest nigdy czytany ani zmieniany przez workera.
- **Obsługa żądań:** tylko GET z własnego adresu; `/` i `/index.html` dają stronę startową, parametry
  zapytania są ignorowane. Plik z listy wydania pochodzi z jego cache. Plik spoza listy, dopóki zapisane jest
  jeszcze inne wydanie, pochodzi z tamtego wydania, a gdy go tam nie ma, z sieci; strona (nawigacja) nigdy nie
  pochodzi z innego wydania. Gdy zapisane jest tylko własne wydanie, żądania spoza listy worker zostawia
  przeglądarce. Nieznana ścieżka nie dostaje strony w zastępstwie.
- **Rejestracja** (`src/pwa/`, `src/ui/use-offline-state.ts`): tylko w buildzie produkcyjnym, pod bezpiecznym
  adresem i gdy strona ma znacznik `<meta name="telemark-offline">`. Podgląd jednoplikowy go nie ma. Menu pokazuje
  „Gotowe do gry bez internetu.” dopiero wtedy, gdy aktywny worker potwierdzi komplet plików.
- Pierwsza strona pierwszej wizyty nie jest przejmowana przez workera; gra startuje bez sieci od następnego
  uruchomienia.
- Uruchomienie tuż po zamknięciu ostatniego okna może jeszcze raz dostać stronę starego wydania, a przeglądarka
  przełącza pod nią workera (zaobserwowane w Chromium). Skrypt tej strony podaje wtedy nowy worker z zapisanego
  jeszcze starego wydania, bo serwer już go nie ma; nowe wydanie działa od kolejnego uruchomienia. Gra niczego
  nie doładowuje później, więc wydania się nie mieszają; przy podziale kodu na części ładowane w trakcie gry
  trzeba do tego wrócić. Znana luka: dwa okna uruchomione w tej samej chwili, z których pierwsze dostało starą
  stronę, a drugie już nową; start drugiego usuwa stare wydanie i pierwsze może nie dostać skryptu (zostaje
  wtedy tekst z linkiem ponownego wczytania).

Gdy skryptu gry nie da się pobrać (strona z jednego wydania, skrypt już z następnego), zostaje statyczny tekst
z `index.html` z linkiem ponownego wczytania. Strona nie przeładowuje się sama.

## Nagłówki

Jedno źródło: `public/_headers` (format statycznych zasobów Cloudflare). Serwer testów
(`scripts/serve-dist.mjs`) stosuje ten sam plik, więc testy przeglądarkowe działają pod produkcyjną polityką.

- Wszystkie odpowiedzi: `Content-Security-Policy` (tylko własny adres, bez skryptów i stylów wpisanych w stronę,
  czcionki wyłącznie jako `data:`), `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- `/assets/*`: `Cache-Control: no-cache`, jak reszta plików. Długi cache (`immutable`) został zdjęty: host dokleja
  nagłówek także do odpowiedzi 404, a przez kilka sekund po wdrożeniu plik nowego wydania może być niedostępny na
  serwerze, który akurat odpowiada (zaobserwowane); przeglądarka trzymałaby taką odpowiedź rok. Po pierwszej
  wizycie te pliki i tak podaje service worker.
- Strona, `sw.js`, `release.json`, manifest, ikony, licencja: `Cache-Control: no-cache`.
- Reguły pasujące do tej samej ścieżki sumują się, a ten sam nagłówek z dwóch reguł zostałby sklejony
  przecinkiem, więc żadne dwie reguły nie ustawiają tego samego nagłówka dla jednej ścieżki (pilnuje tego test).

Konfiguracja hostingu (`deploy/wrangler.jsonc`): same zasoby statyczne, `html_handling: "auto-trailing-slash"`
(`/` zwraca stronę, `/index.html` przekierowuje na `/`; w trybie `"none"` host nie zwraca strony pod `/`),
`not_found_handling: "none"` (nieznana ścieżka to 404), adresy podglądu wersji wyłączone.

## Wdrożenie z CI

Workflow `CI` (`.github/workflows/ci.yml`), zadanie `deploy`:

1. Uruchamia się po `push` do `master` albo po ręcznym uruchomieniu workflow na `master`, tylko gdy zmienna
   repozytorium `DEPLOY_ENABLED` ma wartość `true`, i dopiero po zielonych `web`, `tools` i `hygiene` tego samego
   przebiegu. PR i harmonogram nigdy nie wdrażają.
2. Zadanie `build` buduje pakiet raz, sprawdza go i zapisuje jako artefakt `telemark-dist-<commit>` razem
   z `dist.sha256`. Zadania macierzy `browser` (silniki przeglądarek i tryb pomiarowy) testują ten artefakt
   równolegle, obok nich zadanie `checks` uruchamia kontrole kodu i testy jednostkowe, a zbiorcze `web` jest
   zielone tylko wtedy, gdy wszystkie przeszły. `deploy` pobiera ten sam
   artefakt, sprawdza skróty, komplet plików i commit w `release.json`; niczego nie buduje.
3. Jeśli `master` ma już nowszy commit, przebieg kończy się bez publikacji. Jeśli wdrożona zawartość ma ten sam
   `contentId`, publikacji nie ma (gracze nie pobierają gry drugi raz), a kontrola HTTP sprawdza to, co jest
   wdrożone. Zmieniona gra z numerem nie wyższym niż wdrożony kończy zadanie błędem bez publikacji.
4. Publikuje Wrangler przypięty w `deploy/` (własny lockfile, instalacja w trybie frozen). Jego wynik nie
   trafia do logu wprost (`scripts/run-wrangler.mjs`): po sukcesie tylko identyfikator wersji, po błędzie
   tekst bez identyfikatorów konta.
5. Kontrola HTTP (`scripts/check-deployment.mjs`): każdy plik pakietu odpowiada tymi samymi bajtami, z typem
   i nagłówkami z `_headers`; paczki są skompresowane; `release.json` wskazuje ten commit i tę wersję; `/index.html`
   przekierowuje na `/`; nieznane ścieżki i `_headers` dają 404; adres HTTP przekierowuje na HTTPS. Wyjątek:
   adres w domenie najwyższego poziomu, którą przeglądarki otwierają wyłącznie przez HTTPS (lista HSTS preload,
   np. `.dev`), może odpowiadać po HTTP bez przekierowania. Tak robi `workers.dev`, gdzie nie ma ustawienia
   wymuszającego przekierowanie; kontrola odnotowuje to wtedy w raporcie jako uwagę.
6. Podsumowanie zadania podaje commit, `contentId`, skrót listy `dist.sha256` i identyfikator wersji do wycofania.
7. Po publikacji osobne zadanie `release` (prawo zapisu do repozytorium, bez poświadczeń hostingu) zakłada tag
   `v<wersja>` na opublikowanym commicie i wydanie na GitHubie. Tag, który już jest na tym commicie, zostaje;
   tag na innym commicie (ponowna publikacja po wycofaniu) daje ostrzeżenie bez nowego wydania.

Ustawienia repozytorium, których używa workflow:

| Nazwa | Rodzaj | Cel |
|---|---|---|
| `DEPLOY_ENABLED` | zmienna repozytorium | `true` włącza automatyczną publikację; inna wartość ją wstrzymuje |
| `PRODUCTION_URL` | zmienna repozytorium | publiczny adres gry, bez ścieżki |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | sekrety środowiska `production` | publikacja i wycofanie; środowisko ograniczone do gałęzi `master` |

Pull request, który zmienia `deploy/` albo workflow, sprawdza narzędzie bez poświadczeń: instalacja z lockfile'a
i `wrangler deploy --dry-run` na zbudowanym pakiecie.

## Wycofanie wydania

Workflow `Rollback` (`.github/workflows/rollback.yml`), uruchamiany ręcznie na `master`:

1. Wstrzymać automatyczną publikację: `DEPLOY_ENABLED` na wartość inną niż `true`. Workflow odmawia pracy, gdy
   publikacja jest włączona, bo następny push wdrożyłby nowsze wydanie ponownie.
2. Uruchomić workflow z identyfikatorem wersji (z podsumowania jej wdrożenia) i commitem, z którego powstała.
   Host przywraca wersję, którą już ma; nic nie jest budowane od nowa.
3. Kontrola HTTP sprawdza wdrożenie względem wydania zapisanego w serwowanym `sw.js`: każdy plik z jego listy
   odpowiada bajtami o podanym skrócie, a `release.json` wskazuje podany commit.
4. Włączenie publikacji z powrotem jest osobnym, świadomym krokiem, gdy `master` zawiera wydanie do publikacji.

Sprawdzone próbą 2026-10-13 (cofnięcie o jedną wersję i powrót, każde około 30 s): host przywraca wersję razem
z jej plikami statycznymi. Po cofnięciu `/release.json` podawał commit i zawartość wcześniejszego wydania,
a strona wskazywała jego skrypt, który odpowiadał kodem 200.

Skutki dla graczy: zapis nie jest ruszany. Gracz, który ma już nowsze wydanie, dostaje starsze jako kolejną
aktualizację, po zamknięciu wszystkich okien gry. Wycofanie nie usuwa kopii, które już działają offline.
Wydania przed i po muszą czytać ten sam zapis; wycofanie przez zmianę schematu zapisu wymaga osobnego testu.

## Monitor

Workflow `Monitor` (`.github/workflows/monitor.yml`) sprawdza opublikowaną grę spoza hostingu cztery razy na dobę
(01:23, 07:23, 13:23 i 19:23 UTC) oraz na żądanie. Uruchamia `scripts/monitor-deployment.mjs`, który tylko czyta:

1. `release.json` pod adresem gry podaje commit. Musi to być commit z historii `master`; wydanie przywrócone
   wycofaniem też spełnia ten warunek. Raport podaje, ile commitów `master` ma po nim. Jeśli wydanie podaje
   wersję, tag `v<wersja>` musi wskazywać ten commit (tag powstaje około minuty po publikacji, więc przebieg
   w tej minucie zgłosi jego brak); wydania sprzed numerów wersji go nie mają.
2. Kontrola HTTP względem wydania zapisanego w serwowanym `sw.js` (ta sama co po wycofaniu), z plikiem
   `public/_headers` z commita wydania: bajty każdego pliku, typ, kompresja paczek i nagłówki, także dla `sw.js`;
   nieznane ścieżki dają 404, `/index.html` przekierowuje na `/`. Trwające wdrożenie: kontrola czeka do 120 s,
   a gdy wydanie zmieni się w trakcie, zaczyna raz od nowa.
3. Certyfikat jest zaufany, wystawiony na nazwę hosta i ma co najmniej 14 dni do końca.
4. Strona startowa odpowiada w czasie: mediana z 5 prób do 1500 ms.

Nieudany przebieg to alarm. GitHub powiadamia osobę, która ostatnio zmieniła harmonogram w pliku workflow (przy
ręcznym uruchomieniu: tę, która je uruchomiła), według jej ustawień powiadomień Actions. Próba alarmu bez
ruszania gry: `gh workflow run monitor.yml -f address=https://example.com`.

Ograniczenia:

- Zaplanowane przebiegi startują z opóźnieniem, a w repozytorium publicznym GitHub wyłącza je po 60 dniach bez
  aktywności w repozytorium.
- Monitor pyta z centrum danych i bez service workera: nie widzi tego, co widzi gracz z zainstalowaną grą.
- Treść jest porównywana z wydaniem, które adres sam podaje, nie z pakietem zbudowanym od nowa; zgodność pakietu
  z commitem sprawdza zadanie `deploy` przy publikacji.
- Progi (14 dni, 1500 ms) są w `scripts/lib/monitor-rules.mjs`; próg czasu jest ustawiony z zapasem na adres,
  który ledwo odpowiada, a nie na wolniejszy dzień.

## Lokalnie

```sh
pnpm build                              # pakiet w dist/ i dist.sha256
pnpm check:dist
node scripts/serve-dist.mjs             # dist/ pod http://127.0.0.1:4317, z nagłówkami z _headers
node scripts/check-deployment.mjs http://127.0.0.1:4317   # ta sama kontrola co po wdrożeniu
node scripts/monitor-deployment.mjs <adres gry>           # to, co robi workflow Monitor; same odczyty
node scripts/make-icons.mjs             # ikony od nowa, po zmianie obrazka (src/pwa/icon-picture.ts)
node scripts/export-screen-glyphs.mjs glyphs.json   # czcionka ekranów od nowa, po zmianie src/render/pixel-font.ts,
python tools/font/make_screen_font.py glyphs.json src/ui/fonts/telemark-screen.woff2   # potem ten krok
```

## Czego nie sprawdza automat

- Instalacji na ekranie głównym, uruchomienia z ikony, trybu bez paska przeglądarki i prawdziwych wcięć ekranu:
  żaden silnik w testach tego nie ma; lista ręcznego odbioru jest w `docs/testing.md`.
- Zachowania hosta, którego serwer testów tylko naśladuje. Kontrola HTTP po wdrożeniu jest dowodem dla
  prawdziwego hosta; wypisuje też jako uwagę, jaki `Cache-Control` dostaje odpowiedź 404 pod `/assets/`.
- Tego, jak wycofanie dociera do gracza z zainstalowanym nowszym wydaniem na prawdziwym telefonie (w testach
  robi to `offline.spec.ts`), i wycofania o więcej niż jedną wersję.
