/** The part of `document.fonts` that loading needs. */
export interface FontLoader {
  load(font: string, text?: string): Promise<unknown>;
}

/**
 * The faces every screen is laid out in (src/ui/fonts.css), each with a text that falls into its unicode range:
 * a face is loaded only for characters it declares.
 */
const WEB_FONT_REQUESTS = [
  { font: '1em "Silkscreen"', text: "Telemark" },
  { font: '1em "Silkscreen"', text: "Ā" },
  { font: '1em "Telemark Polish"', text: "ą" },
  { font: '1em "Telemark Screen"', text: "Telemark" },
] as const;

/**
 * How long the first screen waits for the fonts. They are inside the stylesheet, so loading them is decoding
 * them; the limit only keeps a browser that never answers from holding the game back.
 */
export const FONT_WAIT_LIMIT_MS = 1000;

type Wait = (ms: number) => Promise<void>;

const waitWithTimer: Wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Resolves when the web fonts can be drawn, or after the limit. It never rejects: a font that fails to load
 * leaves the fallback font in place for good, which moves nothing later, so the game starts either way.
 */
export async function webFontsReady(
  fonts: FontLoader | undefined,
  limitMs: number = FONT_WAIT_LIMIT_MS,
  wait: Wait = waitWithTimer,
): Promise<void> {
  if (!fonts) return;
  const loaded = Promise.allSettled(WEB_FONT_REQUESTS.map(async ({ font, text }) => fonts.load(font, text)));
  await Promise.race([loaded, wait(limitMs)]);
}
