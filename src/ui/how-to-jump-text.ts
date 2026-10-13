/** The way the game is played: it decides what the instructions name. */
export type Steering = "mouse" | "touch" | "tilt";

interface Step {
  title: string;
  text: string;
}

export const STEERING_NAME: Readonly<Record<Steering, string>> = {
  mouse: "mysz i klawiatura",
  touch: "pola L i P",
  tilt: "przechylanie telefonu",
};

/** The moments of a jump, in the order they come, and what belongs to the screen around it. */
const TITLES = ["Start", "Wybicie", "Lot", "Telemark", "Lądowanie na dwie nogi", "Następny skok", "Menu"] as const;

const TEXTS: Readonly<Record<Steering, readonly string[]>> = {
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
};

/** How to play a jump, step by step, in the words of one way of steering. */
export function howToJump(steering: Steering): readonly Step[] {
  const texts = TEXTS[steering];
  return TITLES.map((title, index) => ({ title, text: texts[index] ?? "" }));
}
