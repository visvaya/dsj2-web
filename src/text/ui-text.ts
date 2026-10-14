import type { CountryCode } from "../render/flags";

/**
 * Every text the player sees or hears, in Polish, grouped by where it appears. Texts with a value in them are
 * functions; how the value itself is written (decimal comma, digits) stays with the code that shows it.
 */
export const UI_TEXT = {
  appName: "Telemark",
  version: (version: string) => `wersja ${version}`,
  back: "Wstecz",
  /** A hill as the jump view and the page title name it. */
  hillLabel: (name: string, kPointM: number) => `${name} K${kPointM}`,

  pageTitle: {
    hills: "Wybór skoczni",
    outfit: "Strój",
    howTo: "Jak skakać",
    install: "Gra jako aplikacja",
    settings: "Ustawienia",
    replays: "Powtórki",
    jump: (hillLabel: string) => `Skok: ${hillLabel}`,
    /** The screen first, the name of the game after it. */
    withApp: (screen: string, app: string) => `${screen} · ${app}`,
  },

  menu: {
    subtitle: (versionLabel: string) => `Skoki narciarskie · ${versionLabel}`,
    navigation: "Główne menu",
    training: "Trening",
    replays: "Powtórki",
    outfit: "Strój",
    settings: "Ustawienia",
    howTo: "Jak skakać",
    install: "Gra jako aplikacja",
    loadFiles: "Wczytaj pliki gry",
    quit: "Wyłącz grę",
    /**
     * "|" marks where a long word may be divided at the end of a line and "~" keeps a one-letter word with the
     * next one; the menu turns them into a soft hyphen and a no-break space.
     */
    quitRefused:
      "Gra nie może za|mknąć tej karty sama. Za|mknij ją krzy|ży|kiem karty albo kla|wi|sza|mi Ctrl+W. Możesz wyjść z~trybu peł|no|ekra|no|we|go przy|ci|skiem F11.",
    filesHelp:
      "Skocznie z oryginału: wybierz Dsj.exe ze swojej kopii gry (zawiera skocznie). Dsj.dat jest opcjonalny: daje nazwy z Twojej wersji gry. Plik zostaje w przeglądarce, nic nie jest wysyłane.",
    originalCount: (count: number) => `Skocznie z oryginału: ${count}. `,
    filesRemembered: (withDat: boolean) =>
      `Pliki (${withDat ? "Dsj.exe, Dsj.dat" : "Dsj.exe"}) zapamiętane w tej przeglądarce.`,
    filesNotRemembered: "Ta przeglądarka nie pozwala ich zapamiętać: po zamknięciu strony wybierz je ponownie.",
    filesForgotten: "Zapomniano pliki gry.",
    forgetFiles: "Zapomnij pliki",
    notPersistent: "Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.",
  },

  /** What the phone shows of the game's sound outside the page (lock screen, control centre). */
  nowPlaying: {
    training: (hillLabel: string) => `Trening: ${hillLabel}`,
  },

  /** The screen for replays of the original game. */
  replays: {
    title: "Powtórki",
    intro:
      "Tu są powtórki rekordów skoczni, zachowane skoki i powtórki z DSJ2 (pliki .rpl z katalogu gry). Rekord skoczni zapisuje się sam; inny skok zachowasz w menu skoku: „Zachowaj ostatni skok”.",
    load: "Wczytaj powtórki (.rpl albo plik powtórek)",
    needsGame: "Powtórki z DSJ2 grają na skoczniach oryginału: najpierw wczytaj pliki gry w menu głównym.",
    notReplay: "To nie jest plik powtórki DSJ2 (.rpl).",
    damaged: "Plik powtórki jest uszkodzony: suma kontrolna się nie zgadza.",
    badValues: "Powtórka ma niepoprawne dane i nie da się jej odtworzyć.",
    noHill: (hillNumber: number) => `Wczytany Dsj.exe nie ma skoczni nr ${hillNumber}, z której jest ta powtórka.`,
    groups: { record: "Rekordy skoczni", kept: "Zachowane", recent: "Ostatnie skoki" },
    empty: "Nie ma jeszcze zapisanych powtórek.",
    /** One replay of the list: its result, its date and what it weighs. */
    row: (distance: string, points: string, date: string, size: string) =>
      `${distance} m · ${points} pkt · ${date} · ${size}`,
    fell: "upadek",
    sizeKb: (kb: string) => `${kb} KB`,
    watch: "Obejrzyj",
    keep: "Zachowaj",
    kept: "Zachowane",
    remove: "Usuń",
    confirmRemove: "Na pewno usunąć?",
    usage: (count: number, used: string, budget: string) => `Powtórek: ${count}; zajęte ${used} z ${budget}.`,
    removeOldest: "Usuń najstarsze",
    removeOldestCount: "Ile najstarszych usunąć (rekordy zostają)",
    removed: (count: number) => `Usunięto powtórek: ${count}.`,
    keptFull: "Miejsce na zachowane powtórki się skończyło (100). Usuń starsze, żeby zachować nowe.",
    alreadyKept: "Ten skok jest już zachowany.",
    keptDone: "Zachowano.",
    notReady: "Powtórki jeszcze się wczytują; spróbuj za chwilę.",
    removeArmed: "Dotknij jeszcze raz „Na pewno usunąć?”, żeby usunąć.",
    select: (replay: string) => `Zaznacz: ${replay}`,
    selectAll: "Zaznacz wszystkie",
    exportSelected: (count: number) => `Eksportuj zaznaczone (${count})`,
    removeSelected: (count: number) => `Usuń zaznaczone (${count})`,
    confirmRemoveSelected: (count: number) => `Na pewno usunąć ${count}?`,
    exportTitle: "Powtórki z gry Telemark",
    exported: { shared: "Udostępniono plik z powtórkami.", downloaded: "Zapisano plik z powtórkami.", cancelled: "" },
    imported: (added: number, already: number) =>
      already === 0 ? `Wczytano powtórek: ${added}.` : `Wczytano powtórek: ${added}; już zachowanych: ${already}.`,
    importUnreadable: (count: number) => `Nie dało się odczytać powtórek: ${count}.`,
    importUntrue: (count: number) => `Pominięte, bo nie grają do wyniku z pliku: ${count}.`,
    notReplayFile: "To nie jest plik powtórki DSJ2 (.rpl) ani plik powtórek tej gry.",
    keptOriginal: "Powtórka z pliku jest też w „Zachowanych”.",
    onlyForVisit: "Ta przeglądarka nie pozwala zapisać powtórek na stałe: znikną po zamknięciu strony.",
    budgetFull: "Powtórki zajmują już całe przewidziane miejsce. Usuń starsze, żeby zapisać nowe.",
    notTrue: "Ta powtórka nie pasuje do tej wersji gry albo jest uszkodzona, więc nie da się jej obejrzeć.",
    hillMissing: "Skoczni tej powtórki nie ma w grze: wczytaj pliki gry w menu głównym.",
  },

  gameFiles: {
    datOnly: "Wczytano Dsj.dat. Wybierz jeszcze Dsj.exe: w nim są skocznie.",
    noExe: "Wśród wybranych plików nie ma Dsj.exe.",
    loaded: (count: number) => `Wczytano skocznie: ${count}.`,
    loadedWithNames: (count: number) => `Wczytano skocznie: ${count} (nazwy z Dsj.dat).`,
    unreadable:
      "Nie udało się odczytać plików: to nie są pliki gry Deluxe Ski Jump 2 w wersji 2.10P albo są uszkodzone.",
  },

  hills: {
    title: "Wybierz skocznię do treningu",
    own: "Skocznie własne",
    original: "Skocznie z oryginału",
    kPoint: (kPointM: number) => `K${kPointM}`,
    record: (distance: string) => `rekord ${distance} m`,
  },

  flags: {
    unknownCountry: "Kraj nieznany",
    // oxfmt-ignore
    countryName: {
      AT: "Austria", AU: "Australia", BE: "Belgia", BY: "Białoruś", CA: "Kanada", CH: "Szwajcaria", CN: "Chiny",
      CZ: "Czechy", DE: "Niemcy", DK: "Dania", EE: "Estonia", ENG: "Anglia", FI: "Finlandia", FR: "Francja",
      HU: "Węgry", IE: "Irlandia", IS: "Islandia", IT: "Włochy", JP: "Japonia", KR: "Korea", KZ: "Kazachstan",
      LT: "Litwa", LV: "Łotwa", NL: "Holandia", NO: "Norwegia", PL: "Polska", RU: "Rosja", SE: "Szwecja",
      SI: "Słowenia", SK: "Słowacja", UA: "Ukraina", US: "USA",
    } satisfies Readonly<Record<CountryCode, string>>,
  },

  settings: {
    title: "Ustawienia",
    leanTilt: "Pochylanie: przechył",
    leanFinger: "Pochylanie: palec",
    sensitivityGroup: "Czułość sterowania",
    sensitivityDown: "Mniejsza czułość",
    sensitivityUp: "Większa czułość",
    /** What is kept of the replays besides the hill records, and what goes on its own. */
    replays: {
      group: "Powtórki",
      recent: (count: number) => (count === 0 ? "Zapisuj ostatnie skoki: wył." : `Zapisuj ostatnie skoki: ${count}`),
      maxAge: "Usuwaj powtórki starsze niż (dni)",
      maxSize: "Usuwaj najstarsze, gdy powtórki ważą więcej niż (MB)",
      recordsStay: "Rekordy skoczni nie są usuwane same.",
    },
    sensitivity: "Czułość: ",
    scenery: "Sceneria: ",
    sceneryName: { varied: "zmienna", day: "dzień", dusk: "zmierzch", night: "noc" },
    soundOn: "Dźwięk: wł.",
    soundOff: "Dźwięk: wył.",
    hintsOn: "Podpowiedzi na skoczni: wł.",
    hintsOff: "Podpowiedzi na skoczni: wył.",
    fullscreenOn: "Pełny ekran: wł.",
    fullscreenOff: "Pełny ekran: wył.",
    vibrationOn: "Wibracje: wł.",
    vibrationOff: "Wibracje: wył.",
    tiltRefused: "Brak zgody na czujnik ruchu: pochylanie palcem.",
    browserFullscreen: "Ten pełny ekran włączyła przeglądarka. Wyłączysz go klawiszem F11.",
  },

  outfit: {
    title: "Edycja kolorów stroju",
    /** Part labels as in the original's editor. */
    part: { pants: "Spodnie", sleeves: "Rękawy", gloves: "Rękawice", helmet: "Kask", skis: "Narty" },
    swatch: [
      "czarny",
      "szary",
      "oliwkowy",
      "pomarańczowy",
      "brązowy",
      "czerwony",
      "karmazynowy",
      "purpurowy",
      "fioletowy",
      "niebieski",
      "morski",
      "zielony",
    ],
    preview: "Podgląd skoczka w wybranym stroju",
  },

  install: {
    title: "Gra jako aplikacja",
    intro: "Telemark można dodać do ekranu głównego telefonu albo zainstalować na komputerze.",
    steps: [
      {
        title: "iPhone i iPad",
        text: "Otwórz grę w Safari, dotknij przycisku Udostępnij (kwadrat ze strzałką w górę), wybierz „Do ekranu początkowego” i potwierdź „Dodaj”.",
      },
      {
        title: "Android",
        text: "W Chrome otwórz menu (trzy kropki) i wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”.",
      },
      {
        title: "Komputer",
        text: "W Chrome albo Edge kliknij ikonę instalacji na końcu paska adresu albo wybierz w menu przeglądarki pozycję instalacji tej strony.",
      },
      {
        title: "Po instalacji",
        text: "Gra uruchamia się z własnej ikony, bez paska adresu, i działa bez internetu. Pierwszy raz otwórz ją z siecią, żeby pobrała się w całości.",
      },
    ],
  },

  howTo: {
    title: "Jak skakać",
    steering: (name: string) => `Sterowanie: ${name}`,
    steeringName: { mouse: "mysz i klawiatura", touch: "pola L i P", tilt: "przechylanie telefonu" },
    /** The moments of a jump, in the order they come, and what belongs to the screen around it. */
    stepTitles: ["Start", "Wybicie", "Lot", "Telemark", "Lądowanie na dwie nogi", "Następny skok", "Menu"],
    /** One text per step title, per way of steering. */
    steps: {
      mouse: [
        "Kliknij lewym przyciskiem myszy (albo naciśnij Z), gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem naciśnij oba przyciski myszy naraz (albo Z i X) i puść je po wybiciu. Jeden przycisk wybija słabiej.",
        "Ruch myszy do siebie i od siebie pochyla skoczka; to samo robią strzałki w górę i w dół.",
        "Tuż nad ziemią naciśnij lewy albo prawy przycisk; najlepiej około 0,4 sekundy przed lądowaniem. Drugi przycisk naciśnięty zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Naciśnij oba przyciski naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, kliknij lewym przyciskiem albo naciśnij R.",
        "Esc otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi. Pełny ekran włączysz w menu albo klawiszem F11 w przeglądarce.",
      ],
      touch: [
        "Dotknij pola L, gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem dotknij pól L i P naraz i puść je po wybiciu. Jedno pole wybija słabiej.",
        "Przesuwaj palec w górę i w dół po polu L. Palec może tam leżeć przez cały lot; możesz go też oderwać i przyłożyć ponownie.",
        "Tuż nad ziemią dotknij pola P; najlepiej około 0,4 sekundy przed lądowaniem. Drugie dotknięcie P zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Dotknij pól L i P naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, dotknij pola L.",
        "Przycisk pauzy w rogu ekranu otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi.",
      ],
      tilt: [
        "Dotknij ekranu, gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem dotknij ekranu dwoma kciukami naraz i puść je po wybiciu. Jeden kciuk wybija słabiej.",
        "Obracaj telefon do siebie i od siebie: skoczek pochyla się o tyle, o ile obrócisz telefon, i zostaje tak, gdy trzymasz go nieruchomo.",
        "Tuż nad ziemią dotknij ekranu jednym kciukiem; najlepiej około 0,4 sekundy przed lądowaniem. Drugi kciuk przyłożony zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Dotknij ekranu dwoma kciukami naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, dotknij ekranu.",
        "Przycisk pauzy w rogu ekranu otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi.",
      ],
    },
  },

  offline: {
    readiness: {
      preparing: "Przygotowywanie gry bez internetu.",
      ready: "Gotowe do gry bez internetu.",
      unavailable: "Gra bez internetu nie jest jeszcze gotowa.",
    },
    updateWaiting: "Nowa wersja jest gotowa. Zamknij wszystkie okna gry i uruchom ją ponownie.",
  },

  jumpScreen: {
    pause: "Pauza i ustawienia",
    pauseKey: "ESC: MENU",
    canvas: (hillLabel: string) =>
      `Skok na skoczni ${hillLabel}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, przycisk tuż nad ziemią: telemark, drugi przycisk zaraz po pierwszym daje wąski telemark, a później szerszy, oba naraz: lądowanie na dwie nogi, po skoku lewy przycisk: jeszcze raz, Esc: menu z ustawieniami i instrukcją.`,
    resume: "Wróć do gry",
    resumeKey: " (Esc)",
    again: "Skocz jeszcze raz",
    againKey: " (R)",
    changeHill: "Zmień skocznię",
    exit: "Wyjdź do menu głównego",
    /** Watching the last jump again. */
    replay: {
      watch: "Obejrzyj ostatni skok",
      speed: (speed: string) => `Tempo: ${speed}`,
      fromStart: "Obejrzyj od początku",
      end: "Wróć do skakania",
      resume: "Wróć do powtórki",
      other: "Wróć do powtórek",
      jumpHere: "Skacz na tej skoczni",
      keepLast: "Zachowaj ostatni skok",
      keptLast: "Ostatni skok jest zachowany na ekranie „Powtórki”.",
      alreadyKept: "Ten skok jest już zachowany.",
    },
    tiltHint: "Dotknij „Pochylanie”, aby włączyć przechył.",
    padKey: { left: "L", right: "P" },
    leftPadHints: ["przeciągnij: pochylenie"],
    rightPadHints: ["L+P: wybicie", "P: telemark", "szybko drugie P: wąski telemark", "L+P w locie: dwie nogi"],
    leftPadTilt: "Lewa połowa ekranu: pierwszy kciuk na ekranie to lewy przycisk, drugi to prawy",
    leftPad: "Lewy przycisk: start i wybicie; w locie przesuwanie w pionie pochyla skoczka",
    rightPadTilt: "Prawa połowa ekranu: pierwszy kciuk na ekranie to lewy przycisk, drugi to prawy",
    rightPad: "Prawy przycisk: wybicie razem z lewym; w locie telemark, a razem z lewym lądowanie na dwie nogi",
  },

  /** What a screen reader hears during a jump. */
  announcement: {
    jumpStarted: "Skok rozpoczęty.",
    replayStarted: "Powtórka skoku. Kliknięcie lub dotknięcie obrazu: pauza, Esc: menu.",
    /** Once a replay is over: what a press of the picture does now, after the player's own jump or a file. */
    replayOver: {
      own: "Koniec powtórki. Kliknięcie lub dotknięcie obrazu: nowy skok.",
      original: "Koniec powtórki. Kliknięcie lub dotknięcie obrazu: menu.",
    },
    nextJump: {
      mouse: "Lewy przycisk lub R: jeszcze raz.",
      touch: "Pole L: jeszcze raz.",
      tilt: "Dotknięcie ekranu: jeszcze raz.",
    },
    record: "Nowy rekord skoczni.",
    disqualified: "Dyskwalifikacja",
    distance: (distance: string) => `${distance} metra`,
    landing: (distance: string) => `Lądowanie: ${distance}`,
    fall: (distance: string) => `Upadek: ${distance}`,
    notes: (notes: string) => `Noty: ${notes}.`,
    points: (points: string) => `Wynik: ${points} punktu.`,
  },

  /** Drawn in the picture of the jump with the pixel font. */
  hud: {
    playerName: "GRACZ 1",
    newRecord: "NOWY REKORD SKOCZNI!",
    disqualified: "DYSKWALIFIKACJA",
    distance: (distance: string) => `${distance} M`,
    speed: (speed: string) => `${speed} KM/H`,
    /** A replay, with its tempo (1, 1/2, 1/4); the second while it is paused. */
    replay: (speed: string) => `POWTÓRKA ${speed}`,
    replayPaused: (speed: string) => `POWTÓRKA ${speed}: PAUZA`,
    phase: {
      crash: "UPADEK",
      gate: "BELKA",
      inrun: "NAJAZD",
      takeoff: "WYBICIE",
      flight: "LOT",
      landing: "LĄDOWANIE",
      outrun: "WYBIEG",
    },
    prompts: {
      mouse: {
        replay: "KLIKNIJ: PAUZA   ESC: MENU",
        replayMenu: "KLIKNIJ: MENU",
        nextJump: "KLIKNIJ: JESZCZE RAZ   ESC: MENU",
        start: "LEWY PRZYCISK: START",
        takeoff: "OBA PRZYCISKI NA PROGU",
        lean: "MYSZ: POCHYLENIE",
        telemark: "PRZYCISK TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO DRUGI PRZYCISK: WĄSKI TELEMARK",
        twoFeet: "OBA NARAZ: NA DWIE NOGI",
      },
      touch: {
        replay: "DOTKNIJ OBRAZU: PAUZA",
        replayMenu: "DOTKNIJ OBRAZU: MENU",
        nextJump: "L: JESZCZE RAZ",
        start: "L: START",
        takeoff: "L+P NA PROGU: WYBICIE",
        lean: "PRZECIĄGAJ W POLU L: POCHYLENIE",
        telemark: "P TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO ZNOWU P: WĄSKI TELEMARK",
        twoFeet: "L+P: NA DWIE NOGI",
      },
      tilt: {
        replay: "DOTKNIJ OBRAZU: PAUZA",
        replayMenu: "DOTKNIJ OBRAZU: MENU",
        nextJump: "DOTKNIJ EKRANU: JESZCZE RAZ",
        start: "DOTKNIJ EKRANU: START",
        takeoff: "DWA KCIUKI NA PROGU: WYBICIE",
        lean: "PRZECHYLAJ TELEFON: POCHYLENIE",
        telemark: "KCIUK TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO DRUGI: WĄSKI TELEMARK",
        twoFeet: "DWA KCIUKI NARAZ: NA DWIE NOGI",
      },
    },
  },

  /** The `?diag` overlay over the jump. */
  diagnostics: {
    rate: (framesPerS: string, versionLabel: string) => `${framesPerS} kl./s · ${versionLabel}`,
    interval: (spread: string) => `klatka ${spread} ms`,
    cost: (sim: string, draw: string) => `sym. ${sim} · rys. ${draw} ms`,
    losses: (dropped: string, long: number) => `zgubione kroki ${dropped} · długie klatki ${long}`,
  },
} as const;
