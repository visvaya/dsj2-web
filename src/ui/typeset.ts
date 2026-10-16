/** Written by number: as characters in the source they could not be told from nothing and from a space. */
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

/**
 * The text of a framed note as the page sets it. Framed notes are set flush to both edges of their frame, so their
 * texts mark where a long word may be divided at the end of a line ("|", shown as a hyphen only where the word is
 * divided) and keep a one-letter word with the word after it ("~"). Browsers divide Polish words on their own only
 * where they have a dictionary for it, which not every one has; without these places a justified line of the pixel
 * font gets gaps of several spaces. A screen reader reads the soft hyphens and no-break spaces as nothing and as a
 * space, so the same text serves both.
 */
export function typeset(text: string): string {
  return text.replaceAll("|", SOFT_HYPHEN).replaceAll("~", NO_BREAK_SPACE);
}
