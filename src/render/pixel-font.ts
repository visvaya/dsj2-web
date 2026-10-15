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
  "!": ["..##.", "..##.", "..##.", "..##.", ".....", "..##."],
  "?": [".###.", "##.##", "..##.", "..##.", ".....", "..##."],
  "(": ["..##.", ".##..", "##...", "##...", ".##..", "..##."],
  ")": [".##..", "..##.", "...##", "...##", "..##.", ".##.."],
  "'": ["...#.", "..##.", "..#..", ".....", ".....", "....."],
  '"': ["##.##", "##.##", ".#..#", ".....", ".....", "....."],
  "%": ["##..#", "##.##", "..##.", ".##..", "##.##", "#..##"],
  "·": [".....", ".....", ".###.", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", "....."],
};

/**
 * Small letters of units: the "m" of metres after a distance, as the original writes it, and in the same thin
 * style this project's "km/h" and "pkt". Signs of their own (full-width forms), so names are not affected; the
 * "p" reaches into the two rows under the capitals.
 */
// oxfmt-ignore
const UNIT_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "ｍ": [".....", ".....", "####.", "#.#.#", "#.#.#", "#.#.#"],
  "ｋ": ["#....", "#....", "#..#.", "###..", "#.#..", "#..#."],
  "ｐ": [".....", ".....", "###..", "#..#.", "#..#.", "###..", "#....", "#...."],
  "ｔ": [".#...", ".#...", "###..", ".#...", ".#...", "..##."],
  "ｈ": ["#....", "#....", "###..", "#..#.", "#..#.", "#..#."],
  "／": ["....#", "...#.", "...#.", "..#..", ".#...", "#...."],
};
/**
 * The gap between a number and its unit: a thin space, so "m", "km/h" and "pkt" stand the same three pixels from
 * the number. Units are set tighter than capitals, each as wide as its body and one pixel.
 */
const UNIT_GAP = "\u2009";
const UNIT_GAP_PX = 2;

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
  /** Pixels to the next character's start. */
  advance: number;
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
  const unit = UNIT_GLYPHS[ch];
  if (unit) return { rows: unit, top: 0 };
  if (COMBINING.test(ch) || ch === UNIT_GAP) return { rows: [], top: 0 };
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

function advanceOf(ch: string, rows: readonly string[]): number {
  if (ch === UNIT_GAP) return UNIT_GAP_PX;
  if (rows.length === 0) return 0;
  if (UNIT_GLYPHS[ch] === undefined) return ADVANCE_PX;
  return Math.max(...rows.map((row) => row.lastIndexOf("#"))) + 1 + LETTER_SPACING_PX;
}

const glyphCache = new Map<string, Glyph>();

function glyphOf(ch: string): Glyph {
  const cached = glyphCache.get(ch);
  if (cached !== undefined) return cached;
  const { rows, top } = bodyOf(ch);
  const glyph = { cells: withShadow(rows), top, advance: advanceOf(ch, rows) };
  glyphCache.set(ch, glyph);
  return glyph;
}

/** Rows of a capital's body. */
const CAP_ROWS = 6;

/**
 * The frame every glyph is given in for a generator of other fonts (tools/font): `rows` rows from `topRow`
 * relative to the cap height (the two mark rows above the capitals) down to the shadow under a mark below them,
 * `width` columns, and the advance in pixels. The body's last row is row `CAP_ROWS - 1`, on the baseline.
 */
export const GLYPH_FRAME = {
  topRow: -MARK_ROWS,
  rows: MARK_ROWS + CAP_ROWS + MARK_ROWS + 1,
  width: GLYPH_WIDTH_PX,
  advance: ADVANCE_PX,
  baselineRow: CAP_ROWS - 1,
} as const;

/** Every character the font draws a glyph of its own for (upper case; lower case is drawn as these). */
export function fontCharacters(): string[] {
  return [...Object.keys(GLYPHS), ...Object.keys(MARKED), ...Object.keys(OWN), ...Object.keys(UNIT_GLYPHS)];
}

/**
 * A character's pixels in `GLYPH_FRAME`, row by row: `#` the body, `o` its shadow, `.` empty. The same pixels
 * `drawText` puts on the picture in a flat colour.
 */
export function glyphPixels(ch: string): string[] {
  const g = glyphOf(ch);
  return Array.from({ length: GLYPH_FRAME.rows }, (_row, r) => {
    const cells = g.cells[r + GLYPH_FRAME.topRow - g.top];
    return Array.from({ length: GLYPH_FRAME.width }, (_cell, x) => {
      const kind = cells?.[x] ?? 0;
      return kind === BODY ? "#" : kind === SHADE ? "o" : ".";
    }).join("");
  });
}

export function textWidth(text: string): number {
  const advances = letters(text).reduce((sum, ch) => sum + glyphOf(ch).advance, 0);
  return Math.max(0, advances - LETTER_SPACING_PX);
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

/** Ramp steps from the shadow's lowest index to the brightest body pixel. */
const RAMP_SPAN = RAMP_SHADE_STEPS + 6;
const rampCache = new Map<number, Uint32Array>();

/** The colours of a ramp from its shadow's lowest index up, looked up once rather than for every pixel. */
function rampColours(ramp: number): Uint32Array {
  let colours = rampCache.get(ramp);
  if (colours === undefined) {
    colours = Uint32Array.from({ length: RAMP_SPAN + 1 }, (_, k) => hudColour(ramp - RAMP_SHADE_STEPS + k));
    rampCache.set(ramp, colours);
  }
  return colours;
}

/**
 * Draws text with the font's relief and an optional one-pixel drop shadow (for text over the scene); returns the x
 * after the text.
 */
export function drawText(fb: FrameBuffer, x: number, y: number, text: string, ink: Ink, shadow?: number): number {
  const flatShade = typeof ink === "number" ? darker(ink, SHADE_SHARE) : 0;
  const ramp = typeof ink === "number" ? null : rampColours(ink.ramp);
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
        } else if (ramp !== null) {
          const steps = kind === BODY ? RAMP_BODY_STEPS : RAMP_SHADE_STEPS;
          fb.put(px, py, ramp[RAMP_SHADE_STEPS - steps + lighterAt(gx, gy)] ?? 0);
        }
      });
    });
    cx += g.advance;
  }
  return cx;
}
