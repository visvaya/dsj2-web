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
| `release.json` | commit źródła (`sourceSha`) i identyfikator zawartości (`contentId`) |
| `sw.js` | service worker z listą plików wydania i ich skrótami SHA-256 |
| `_headers` | nagłówki odpowiedzi dla hostingu; host nie serwuje tego pliku |

Obok powstaje `dist.sha256`: skróty wszystkich plików pakietu w formacie `sha256sum --check`.

Kolejność kroku wydania: wynik bundlera i pliki z `public/` są wejściem; z nich powstaje `contentId` (skróty
i ścieżki plików wejściowych oraz źródło workera), potem `release.json`, potem lista plików dla workera, na końcu
`sw.js`. Nic nie zależy od czasu uruchomienia: to samo źródło daje te same bajty. Commit, który nie zmienia gry
(dokumentacja, testy), daje ten sam `contentId`.

`pnpm check:dist` (`scripts/lib/dist-rules.mjs`) wymaga, żeby w `dist/` były wszystkie pliki z listy i nic poza
nimi, bez plików oryginalnej gry, w budżetach rozmiaru (paczki, worker, ikony). Podgląd jednoplikowy
(`pnpm build:single`) trafia do `dist-single/` i nie jest częścią pakietu: nie ma manifestu, ikon ani workera.

## Service worker

Źródło: `scripts/lib/service-worker-template.js`; krok wydania wpisuje do niego listę plików. Zasady:

- **Instalacja** pobiera każdy plik wydania, porównuje jego SHA-256 z listą i dopiero potem zapisuje wszystko do
  własnego cache (`telemark-shell-<id>`). Brak pliku, inna treść, przekierowanie albo brak miejsca kończy
  instalację błędem i nie zostawia żadnej części wydania; działające wcześniej wydanie zostaje nietknięte.
- **Nowe wydanie czeka.** Worker nie woła `skipWaiting()` ani `clients.claim()`, a strona nigdy sama się nie
  przeładowuje. Strona dostaje dokument i skrypty zawsze z jednego wydania, a skok nie jest przerywany. Nowe
  wydanie przejmuje stronę przy kolejnym uruchomieniu po zamknięciu wszystkich okien gry; menu pokazuje wtedy
  „Nowa wersja jest gotowa. Zamknij wszystkie okna gry i uruchom ją ponownie.”
- **Aktywacja** usuwa cache innych wydań, tylko z prefiksem gry. Zapis gracza (localStorage, IndexedDB) nie jest
  nigdy czytany ani zmieniany przez workera.
- **Obsługa żądań:** tylko GET z własnego adresu i tylko pliki z listy wydania; `/` i `/index.html` dają stronę
  startową, parametry zapytania są ignorowane. Nieznana ścieżka nie dostaje strony w zastępstwie.
- **Rejestracja** (`src/pwa/`, `src/ui/use-offline-state.ts`): tylko w buildzie produkcyjnym, pod bezpiecznym
  adresem i gdy strona ma znacznik `<meta name="telemark-offline">`. Podgląd jednoplikowy go nie ma. Menu pokazuje
  „Gotowe do gry bez internetu.” dopiero wtedy, gdy aktywny worker potwierdzi komplet plików.
- Pierwsza strona pierwszej wizyty nie jest przejmowana przez workera; gra startuje bez sieci od następnego
  uruchomienia.
- Uruchomienie tuż po zamknięciu ostatniego okna może jeszcze raz wystartować ze starego wydania, zanim
  przeglądarka przełączy workera (zaobserwowane w Chromium); nowe działa od kolejnego uruchomienia. Strona
  ładuje wtedy wszystkie swoje pliki ze starego wydania, a gra niczego nie doładowuje później, więc wydania się
  nie mieszają. Przy podziale kodu na części ładowane w trakcie gry trzeba do tego wrócić.

Gdy skryptu gry nie da się pobrać (strona z jednego wydania, skrypt już z następnego), zostaje statyczny tekst
z `index.html` z linkiem ponownego wczytania. Strona nie przeładowuje się sama.

## Nagłówki

Jedno źródło: `public/_headers` (format statycznych zasobów Cloudflare). Serwer testów
(`scripts/serve-dist.mjs`) stosuje ten sam plik, więc testy przeglądarkowe działają pod produkcyjną polityką.

- Wszystkie odpowiedzi: `Content-Security-Policy` (tylko własny adres, bez skryptów i stylów wpisanych w stronę,
  czcionki wyłącznie jako `data:`), `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`.
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
2. `web` buduje pakiet raz, sprawdza go, testuje w przeglądarkach i zapisuje jako artefakt
   `telemark-dist-<commit>` razem z `dist.sha256`. `deploy` pobiera ten artefakt, sprawdza skróty, komplet plików
   i commit w `release.json`; niczego nie buduje.
3. Jeśli `master` ma już nowszy commit, przebieg kończy się bez publikacji. Jeśli wdrożona zawartość ma ten sam
   `contentId`, publikacji nie ma (gracze nie pobierają gry drugi raz), a kontrola HTTP sprawdza to, co jest
   wdrożone.
4. Publikuje Wrangler przypięty w `deploy/` (własny lockfile, instalacja w trybie frozen). Jego wynik nie
   trafia do logu wprost (`scripts/run-wrangler.mjs`): po sukcesie tylko identyfikator wersji, po błędzie
   tekst bez identyfikatorów konta.
5. Kontrola HTTP (`scripts/check-deployment.mjs`): każdy plik pakietu odpowiada tymi samymi bajtami, z typem
   i nagłówkami z `_headers`; paczki są skompresowane; `release.json` wskazuje ten commit; `/index.html`
   przekierowuje na `/`; nieznane ścieżki i `_headers` dają 404; adres HTTP przekierowuje na HTTPS. Wyjątek:
   adres w domenie najwyższego poziomu, którą przeglądarki otwierają wyłącznie przez HTTPS (lista HSTS preload,
   np. `.dev`), może odpowiadać po HTTP bez przekierowania. Tak robi `workers.dev`, gdzie nie ma ustawienia
   wymuszającego przekierowanie; kontrola odnotowuje to wtedy w raporcie jako uwagę.
6. Podsumowanie zadania podaje commit, `contentId`, skrót listy `dist.sha256` i identyfikator wersji do wycofania.

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

Skutki dla graczy: zapis nie jest ruszany. Gracz, który ma już nowsze wydanie, dostaje starsze jako kolejną
aktualizację, po zamknięciu wszystkich okien gry. Wycofanie nie usuwa kopii, które już działają offline.
Wydania przed i po muszą czytać ten sam zapis; wycofanie przez zmianę schematu zapisu wymaga osobnego testu.

## Lokalnie

```sh
pnpm build                              # pakiet w dist/ i dist.sha256
pnpm check:dist
node scripts/serve-dist.mjs             # dist/ pod http://127.0.0.1:4317, z nagłówkami z _headers
node scripts/check-deployment.mjs http://127.0.0.1:4317   # ta sama kontrola co po wdrożeniu
node scripts/make-icons.mjs             # ikony od nowa, po zmianie obrazka (src/pwa/icon-picture.ts)
```

## Czego nie sprawdza automat

- Instalacji na ekranie głównym, uruchomienia z ikony, trybu bez paska przeglądarki i prawdziwych wcięć ekranu:
  żaden silnik w testach tego nie ma; lista ręcznego odbioru jest w `docs/testing.md`.
- Zachowania hosta, którego serwer testów tylko naśladuje. Kontrola HTTP po wdrożeniu jest dowodem dla
  prawdziwego hosta; wypisuje też jako uwagę, jaki `Cache-Control` dostaje odpowiedź 404 pod `/assets/`.
- Tego, czy wycofanie wersji na hoście przywraca także zasoby statyczne tej wersji: do wykazania na dwóch
  wersjach przed pierwszym użyciem w razie awarii.
