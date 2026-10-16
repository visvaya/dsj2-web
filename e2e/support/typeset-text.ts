/**
 * Framed notes carry soft hyphens where a word may be divided at a line end and no-break spaces after one-letter
 * words (src/ui/typeset.ts). Neither changes what the note says, so a test names the text plainly and matches it
 * however the words are divided.
 */

const SOFT_HYPHEN = "­";
const SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** The source of a pattern that matches `text` with a soft hyphen after any character and any kind of space. */
export function setPatternSource(text: string): string {
  return Array.from(text, (ch) => (ch === " " ? "[  ]" : `${ch.replace(SPECIAL, "\\$&")}${SOFT_HYPHEN}?`)).join("");
}

/** The whole of `text` as a framed note shows it. */
export const asSet = (text: string): RegExp => new RegExp(`^${setPatternSource(text)}$`);

/** `text` as a framed note shows it, anywhere in a longer text. */
export const setWithin = (text: string): RegExp => new RegExp(setPatternSource(text));
