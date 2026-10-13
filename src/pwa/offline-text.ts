import type { OfflineState } from "./offline-state";

/** What the menu says about playing without a network. */
export const OFFLINE_TEXT: Readonly<Record<OfflineState["readiness"], string>> = {
  preparing: "Przygotowywanie gry bez internetu.",
  ready: "Gotowe do gry bez internetu.",
  unavailable: "Gra bez internetu nie jest jeszcze gotowa.",
};

export const UPDATE_WAITING_TEXT = "Nowa wersja jest gotowa. Zamknij wszystkie okna gry i uruchom ją ponownie.";
