import type { FrameBuffer } from "./frame-buffer";
import { hudColour } from "./scene-palette";

/**
 * The picture's font, drawn for this project in the style of the original's: bold capitals with a body five
 * columns wide and six rows tall (stems two pixels wide), digits and signs. Every glyph casts a shadow one row down
 * onto the empty pixels under it (inside counters, in inner corners and in a row under the letter), which gives the
 * letters their relief. Letters with diacritics (Latin Extended capitals) are a base letter with a mark in two rows
 * above it, or below it for ogonek, cedilla and comma; lower-case letters are drawn as capitals. Every glyph takes
 * the same advance, as in the original.
 */
// oxfmt-ignore
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: [".###.", "##.##", "#####", "##.##", "##.##", "##.##"],
  B: ["####.", "##.##", "##.##", "####.", "##.##", "####."],
  C: [".####", "##...", "##...", "##...", "##...", ".####"],
  D: ["###..", "##.#.", "##.##", "##.##", "##.#.", "###.."],
  E: ["#####", "##...", "##...", "####.", "##...", "#####"],
  F: ["#####", "##...", "##...", "####.", "##...", "##..."],
  G: [".####", "##...", "##.##", "##.##", "##.##", ".####"],
  H: ["##.##", "##.##", "##.##", "#####", "##.##", "##.##"],
  I: ["####.", ".##..", ".##..", ".##..", ".##..", "####."],
  J: ["...##", "...##", "...##", "...##", "##.##", ".###."],
  K: ["##.##", "##.##", "####.", "####.", "##.##", "##.##"],
  L: ["##...", "##...", "##...", "##...", "##...", "#####"],
  M: ["##.##", "#####", "#####", "#.#.#", "##.##", "##.##"],
  N: ["##.##", "###.#", "#####", "#.###", "##.##", "##.##"],
  O: ["#####", "##.##", "##.##", "##.##", "##.##", "#####"],
  P: ["####.", "##.##", "####.", "##...", "##...", "##..."],
  Q: [".###.", "##.##", "##.##", "##.##", "##.#.", ".##.#"],
  R: ["####.", "##.##", "####.", "###..", "##.##", "##.##"],
  S: [".####", "##...", ".###.", "...##", "...##", "####."],
  T: ["#####", "..##.", "..##.", "..##.", "..##.", "..##."],
  U: ["##.##", "##.##", "##.##", "##.##", "##.##", "#####"],
  V: ["##.##", "##.##", "##.##", ".###.", ".###.", "..#.."],
  W: ["##.##", "##.##", "##.##", "#####", "#####", "##.##"],
  X: ["##.##", "##.##", ".###.", ".###.", "##.##", "##.##"],
  Y: ["##.##", "##.##", ".####", "..##.", "..##.", "..##."],
  Z: ["#####", "...##", "..##.", ".##..", "##...", "#####"],
  "0": [".###.", "##..#", "##.##", "##.##", "#..##", ".###."],
  "1": ["..##.", ".###.", "..##.", "..##.", "..##.", ".####"],
  "2": [".###.", "##.##", "...##", "..##.", ".##..", "#####"],
  "3": ["####.", "...##", ".###.", "...##", "...##", "####."],
  "4": ["...##", "..###", ".####", "##.##", "#####", "...##"],
  "5": ["#####", "##...", "####.", "...##", "...##", "####."],
  "6": [".###.", "##...", "####.", "##.##", "##.##", ".###."],
  "7": ["#####", "...##", "..##.", "..##.", ".##..", ".##.."],
  "8": [".###.", "##.##", "##.##", ".###.", "##.##", ".###."],
  "9": [".###.", "##.##", "##.##", ".####", "...##", ".###."],
  ".": [".....", ".....", ".....", ".....", "..##.", "..##."],
  ",": [".....", ".....", ".....", "..##.", "..##.", ".##.."],
  ":": [".....", "..##.", "..##.", ".....", "..##.", "..##."],
  ";": [".....", "..##.", "..##.", ".....", "..##.", ".##.."],
  "/": ["...##", "...##", "..##.", ".##..", "##...", "##..."],
  "+": [".....", "..##.", "..##.", "#####", "..##.", "..##."],
  "-": [".....", ".....", "####.", "####.", ".....", "....."],
  "=": [".....", "#####", ".....", "#####", ".....", "....."],
  "!": [".###.", ".###.", "..##.", "..#..", ".....", "..##."],
  "?": [".###.", "##.##", "..##.", "..##.", ".....", "..##."],
  "(": ["..##.", ".##..", "##...", "##...", ".##..", "..##."],
  ")": [".##..", "..##.", "...##", "...##", "..##.", ".##.."],
  "'": ["...#.", "..##.", "..#..", ".....", ".....", "....."],
  '"': ["##.##", "##.##", ".#..#", ".....", ".....", "....."],
  "%": ["##..#", "##.##", "..##.", ".##..", "##.##", "#..##"],
  "·": [".....", ".....", ".###.", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", "....."],
};

/** The small "m" of metres after a distance, as the original writes it; a sign of its own so names are not affected. */
const METRE_SIGN = "ｍ";
const METRE_GLYPH = [".....", ".....", "####.", "#.#.#", "#.#.#", "#.#.#"];

/** Marks above a capital (two rows) and below it (two rows), five columns wide. */
// oxfmt-ignore
const MARKS: Readonly<Record<string, readonly string[]>> = {
  acute: ["...##", "....."],
  grave: ["##...", ".##.."],
  circumflex: ["..#..", ".#.#."],
  caron: [".#.#.", "..#.."],
  diaeresis: ["##.##", "....."],
  ring: [".###.", ".#.#."],
  breve: ["#...#", ".###."],
  tilde: [".##.#", "#.##."],
  doubleAcute: ["..#.#", ".#.#."],
  dot: ["..##.", "....."],
  ogonek: ["...#.", "....#"],
  cedilla: ["..#..", ".##.."],
  commaBelow: ["..##.", ".##.."],
};

/** Capitals with a mark: the base letter and the mark above or below it. */
// oxfmt-ignore
const MARKED: Readonly<Record<string, readonly [string, string]>> = {
  À: ["A", "grave"], Á: ["A", "acute"], Â: ["A", "circumflex"], Ã: ["A", "tilde"], Ä: ["A", "diaeresis"],
  Å: ["A", "ring"], Ą: ["A", "ogonek"], Ă: ["A", "breve"],
  Ć: ["C", "acute"], Č: ["C", "caron"], Ç: ["C", "cedilla"],
  Ď: ["D", "caron"],
  È: ["E", "grave"], É: ["E", "acute"], Ê: ["E", "circumflex"], Ë: ["E", "diaeresis"], Ě: ["E", "caron"],
  Ę: ["E", "ogonek"], Ė: ["E", "dot"],
  Ğ: ["G", "breve"],
  Ì: ["I", "grave"], Í: ["I", "acute"], Î: ["I", "circumflex"], Ï: ["I", "diaeresis"], İ: ["I", "dot"],
  Į: ["I", "ogonek"],
  Ĺ: ["L", "acute"], Ľ: ["L", "caron"],
  Ń: ["N", "acute"], Ň: ["N", "caron"], Ñ: ["N", "tilde"],
  Ò: ["O", "grave"], Ó: ["O", "acute"], Ô: ["O", "circumflex"], Õ: ["O", "tilde"], Ö: ["O", "diaeresis"],
  Ő: ["O", "doubleAcute"],
  Ŕ: ["R", "acute"], Ř: ["R", "caron"],
  Ś: ["S", "acute"], Š: ["S", "caron"], Ş: ["S", "cedilla"], Ș: ["S", "commaBelow"],
  Ť: ["T", "caron"], Ţ: ["T", "cedilla"], Ț: ["T", "commaBelow"],
  Ù: ["U", "grave"], Ú: ["U", "acute"], Û: ["U", "circumflex"], Ü: ["U", "diaeresis"], Ů: ["U", "ring"],
  Ű: ["U", "doubleAcute"], Ų: ["U", "ogonek"],
  Ý: ["Y", "acute"], Ÿ: ["Y", "diaeresis"],
  Ź: ["Z", "acute"], Ž: ["Z", "caron"], Ż: ["Z", "dot"],
};
const BELOW = new Set(["ogonek", "cedilla", "commaBelow"]);

/** Capitals with a stroke or of a shape of their own, and the sharp s (one glyph, not two letters). */
// oxfmt-ignore
const OWN: Readonly<Record<string, readonly string[]>> = {
  Ł: ["##...", "##.#.", "###..", "##...", "##...", "#####"],
  Đ: ["###..", "##.#.", "####.", "##.##", "##.#.", "###.."],
  Ø: [".####", "##.##", "#.#.#", "#.#.#", "##.##", "####."],
  Æ: [".####", "#.#..", "#####", "#.#..", "#.#..", "#.###"],
  ß: ["###..", "##.#.", "####.", "##..#", "##.##", "##.#."],
};

/** Columns of every glyph and the gap after it. */
const GLYPH_WIDTH_PX = 5;
const LETTER_SPACING_PX = 1;
const ADVANCE_PX = GLYPH_WIDTH_PX + LETTER_SPACING_PX;
/** Rows of a mark above a capital. */
const MARK_ROWS = 2;

/** What a glyph's pixel is: the letter's body or its shadow (0: empty). */
const BODY = 2;
const SHADE = 1;

interface Glyph {
  /** Pixel kinds row by row (`BODY`, `SHADE` or 0), the shadow already cast. */
  cells: readonly (readonly number[])[];
  /** Row of the first line relative to the cap height (negative: a mark above it). */
  top: number;
}

/** A glyph's body rows with its shadow cast one row down onto the empty pixels under it (and one row below). */
function withShadow(rows: readonly string[]): number[][] {
  const body = (x: number, y: number) => rows[y]?.[x] === "#";
  return Array.from({ length: rows.length === 0 ? 0 : rows.length + 1 }, (_row, y) =>
    Array.from({ length: GLYPH_WIDTH_PX }, (_cell, x) => (body(x, y) ? BODY : body(x, y - 1) ? SHADE : 0)),
  );
}

/** Combining marks draw nothing and take no room; the lower-case dotted I (i and a combining dot) is drawn as İ. */
const COMBINING = /^\p{M}$/u;
const DOTTED_I = /i̇/gu;
const letters = (text: string) => Array.from(text.replace(DOTTED_I, "İ"));

function bodyOf(ch: string): { rows: readonly string[]; top: number } {
  if (ch === METRE_SIGN) return { rows: METRE_GLYPH, top: 0 };
  if (COMBINING.test(ch)) return { rows: [], top: 0 };
  // The sharp s keeps a glyph of its own: its capital is two letters.
  const up = ch === "ß" ? ch : ch.toUpperCase();
  const own = OWN[up];
  if (own) return { rows: own, top: 0 };
  const marked = MARKED[up];
  if (marked) {
    const [base, markName] = marked;
    const rows = GLYPHS[base] ?? [];
    const mark = MARKS[markName] ?? [];
    return BELOW.has(markName) ? { rows: [...rows, ...mark], top: 0 } : { rows: [...mark, ...rows], top: -MARK_ROWS };
  }
  return { rows: GLYPHS[up] ?? GLYPHS["?"] ?? [], top: 0 };
}

const glyphCache = new Map<string, Glyph>();

function glyphOf(ch: string): Glyph {
  const cached = glyphCache.get(ch);
  if (cached !== undefined) return cached;
  const { rows, top } = bodyOf(ch);
  const glyph = { cells: withShadow(rows), top };
  glyphCache.set(ch, glyph);
  return glyph;
}

export function textWidth(text: string): number {
  const chars = letters(text).filter((ch) => !COMBINING.test(ch)).length;
  return Math.max(0, chars * ADVANCE_PX - LETTER_SPACING_PX);
}

/** Share of a flat colour kept in the shadow of its letters. */
const SHADE_SHARE = 0.5;

/**
 * How a text is coloured: one packed colour (its shadow darker), or a ramp of the original's palette as its font
 * colours its letters (index `ramp - 1` for the body, `ramp - 6` for the shadow, both a little lighter towards the
 * lower right of each letter).
 */
export type Ink = number | { ramp: number };

/** A packed colour darkened to `share` of itself. */
function darker(colour: number, share: number): number {
  const ch = (shift: number) => Math.round(((colour >>> shift) & 0xff) * share) << shift;
  return ((colour & 0xff000000) | ch(0) | ch(8) | ch(16)) >>> 0;
}

/** Steps of a ramp below its index for the body and for the shadow. */
const RAMP_BODY_STEPS = 1;
const RAMP_SHADE_STEPS = 6;

/** Ramp steps added towards the lower right at column `gx` and row `gy` of a glyph (counted from 1 in the rule). */
const lighterAt = (gx: number, gy: number) => Math.max(0, Math.floor((2 * (gy + 1) + (gx + 1)) / 6));

/**
 * Draws text with the font's relief and an optional one-pixel drop shadow (for text over the scene); returns the x
 * after the text.
 */
export function drawText(fb: FrameBuffer, x: number, y: number, text: string, ink: Ink, shadow?: number): number {
  const flatShade = typeof ink === "number" ? darker(ink, SHADE_SHARE) : 0;
  let cx = x;
  for (const ch of letters(text)) {
    const g = glyphOf(ch);
    g.cells.forEach((row, cy) => {
      const gy = g.top + cy;
      row.forEach((kind, gx) => {
        if (kind === 0) return;
        const px = cx + gx;
        const py = y + gy;
        if (shadow !== undefined && (g.cells[cy + 1]?.[gx + 1] ?? 0) === 0) fb.put(px + 1, py + 1, shadow);
        if (typeof ink === "number") {
          fb.put(px, py, kind === BODY ? ink : flatShade);
        } else {
          const steps = kind === BODY ? RAMP_BODY_STEPS : RAMP_SHADE_STEPS;
          fb.put(px, py, hudColour(ink.ramp - steps + lighterAt(gx, gy)));
        }
      });
    });
    if (g.cells.length > 0) cx += ADVANCE_PX;
  }
  return cx;
}
