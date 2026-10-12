const APP_NAME = "Telemark";

/** What the title needs to know about the screen shown (the screens of the application fit this shape). */
export type TitledScreen =
  | { kind: "menu" }
  | { kind: "hills" }
  | { kind: "outfit" }
  | { kind: "jump"; hill: { name: string; kPointM: number } };

/**
 * Title of the page for a screen. Each screen has its own, so a browser tab, the history and a screen reader say
 * where the player is; the name of the game comes last, after what changes.
 */
export function screenTitle(screen: TitledScreen): string {
  if (screen.kind === "menu") return APP_NAME;
  if (screen.kind === "hills") return `Wybór skoczni · ${APP_NAME}`;
  if (screen.kind === "outfit") return `Strój · ${APP_NAME}`;
  return `Skok: ${screen.hill.name} K${screen.hill.kPointM} · ${APP_NAME}`;
}
