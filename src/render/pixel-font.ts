import type { FrameBuffer } from "./frame-buffer";
import { hudColour } from "./scene-palette";

/**
 * The picture's font, drawn for this project in the style of the original's: bold capitals in a 5x7 cell (stems
 * two pixels wide), digits and signs, with the lower and right edges of every stroke in a darker shade, which
 * gives the letters their relief. Letters with diacritics (Latin Extended capitals) are a base letter with a mark
 * above or below; lower-case letters are drawn as capitals.
 */
// oxfmt-ignore
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: [".###.", "##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
  B: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "####."],
  C: [".####", "##...", "##...", "##...", "##...", "##...", ".####"],
  D: ["####.", "##.##", "##.##", "##.##", "##.##", "##.##", "####."],
  E: ["#####", "##...", "##...", "####.", "##...", "##...", "#####"],
  F: ["#####", "##...", "##...", "####.", "##...", "##...", "##..."],
  G: [".####", "##...", "##...", "##.##", "##.##", "##.##", ".####"],
  H: ["##.##", "##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
  I: ["####", ".##.", ".##.", ".##.", ".##.", ".##.", "####"],
  J: ["..###", "...##", "...##", "...##", "...##", "##.##", ".###."],
  K: ["##.##", "##.##", "####.", "###..", "####.", "##.##", "##.##"],
  L: ["##...", "##...", "##...", "##...", "##...", "##...", "#####"],
  M: ["##.##", "#####", "#####", "##.##", "##.##", "##.##", "##.##"],
  N: ["##.##", "###.#", "#####", "#.###", "##.##", "##.##", "##.##"],
  O: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
  P: ["####.", "##.##", "##.##", "####.", "##...", "##...", "##..."],
  Q: [".###.", "##.##", "##.##", "##.##", "##.##", "##.#.", ".##.#"],
  R: ["####.", "##.##", "##.##", "####.", "##.#.", "##.##", "##.##"],
  S: [".####", "##...", "##...", ".###.", "...##", "...##", "####."],
  T: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  U: ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
  V: ["##.##", "##.##", "##.##", "##.##", "##.##", ".###.", "..#.."],
  W: ["##.##", "##.##", "##.##", "##.##", "#####", "#####", "##.##"],
  X: ["##.##", "##.##", ".###.", "..#..", ".###.", "##.##", "##.##"],
  Y: ["##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
  Z: ["#####", "...##", "..##.", ".##..", "##...", "##...", "#####"],
  "0": [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
  "1": [".##.", "###.", ".##.", ".##.", ".##.", ".##.", "####"],
  "2": [".###.", "##.##", "...##", "..##.", ".##..", "##...", "#####"],
  "3": ["####.", "...##", "...##", ".###.", "...##", "...##", "####."],
  "4": ["...##", "..###", ".####", "##.##", "#####", "...##", "...##"],
  "5": ["#####", "##...", "####.", "...##", "...##", "##.##", ".###."],
  "6": [".###.", "##...", "##...", "####.", "##.##", "##.##", ".###."],
  "7": ["#####", "...##", "...##", "..##.", "..##.", ".##..", ".##.."],
  "8": [".###.", "##.##", "##.##", ".###.", "##.##", "##.##", ".###."],
  "9": [".###.", "##.##", "##.##", ".####", "...##", "...##", ".###."],
  ".": ["..", "..", "..", "..", "..", "##", "##"],
  ",": ["..", "..", "..", "..", "##", "##", ".#"],
  ":": ["..", "##", "##", "..", "##", "##", ".."],
  ";": ["..", "##", "##", "..", "##", "##", ".#"],
  "/": ["...##", "...##", "..##.", "..#..", ".##..", "##...", "##..."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "!": ["##", "##", "##", "##", "##", "..", "##"],
  "?": [".###.", "##.##", "...##", "..##.", ".##..", ".....", ".##.."],
  "(": [".##", "##.", "##.", "##.", "##.", "##.", ".##"],
  ")": ["##.", ".##", ".##", ".##", ".##", ".##", "##."],
  "'": ["##", "##", ".#", "..", "..", "..", ".."],
  '"': ["##.##", "##.##", ".#..#", ".....", ".....", ".....", "....."],
  "%": ["##..#", "##.##", "..##.", ".##..", "##.##", "#..##", "....."],
  "·": ["..", "..", "..", "##", "##", "..", ".."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
};

/** The small "m" of metres after a distance, as the original writes it; a sign of its own so names are not affected. */
const METRE_SIGN = "ｍ";
const METRE_GLYPH = [".....", ".....", "####.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"];

/** Marks above a capital (two rows) and below it (two rows), five columns wide, centred on narrower letters. */
// oxfmt-ignore
const MARKS: Readonly<Record<string, readonly string[]>> = {
  acute: ["...##", "..##."],
  grave: ["##...", ".##.."],
  circumflex: ["..#..", ".#.#."],
  caron: [".#.#.", "..#.."],
  diaeresis: [".....", "##.##"],
  ring: [".###.", ".#.#."],
  tilde: [".##.#", "#.##."],
  doubleAcute: ["..#.#", ".#.#."],
  dot: [".....", "..##."],
  ogonek: ["...#.", "....#"],
  cedilla: ["..#..", ".##.."],
};

/** Capitals with a mark: the base letter and the mark above or below it. */
// oxfmt-ignore
const MARKED: Readonly<Record<string, readonly [string, string]>> = {
  À: ["A", "grave"], Á: ["A", "acute"], Â: ["A", "circumflex"], Ã: ["A", "tilde"], Ä: ["A", "diaeresis"],
  Å: ["A", "ring"], Ą: ["A", "ogonek"], Ă: ["A", "caron"],
  Ć: ["C", "acute"], Č: ["C", "caron"], Ç: ["C", "cedilla"],
  Ď: ["D", "caron"],
  È: ["E", "grave"], É: ["E", "acute"], Ê: ["E", "circumflex"], Ë: ["E", "diaeresis"], Ě: ["E", "caron"],
  Ę: ["E", "ogonek"], Ė: ["E", "dot"],
  Ğ: ["G", "caron"],
  Ì: ["I", "grave"], Í: ["I", "acute"], Î: ["I", "circumflex"], Ï: ["I", "diaeresis"], İ: ["I", "dot"],
  Į: ["I", "ogonek"],
  Ĺ: ["L", "acute"], Ľ: ["L", "caron"],
  Ń: ["N", "acute"], Ň: ["N", "caron"], Ñ: ["N", "tilde"],
  Ò: ["O", "grave"], Ó: ["O", "acute"], Ô: ["O", "circumflex"], Õ: ["O", "tilde"], Ö: ["O", "diaeresis"],
  Ő: ["O", "doubleAcute"],
  Ŕ: ["R", "acute"], Ř: ["R", "caron"],
  Ś: ["S", "acute"], Š: ["S", "caron"], Ş: ["S", "cedilla"], Ș: ["S", "cedilla"],
  Ť: ["T", "caron"], Ţ: ["T", "cedilla"], Ț: ["T", "cedilla"],
  Ù: ["U", "grave"], Ú: ["U", "acute"], Û: ["U", "circumflex"], Ü: ["U", "diaeresis"], Ů: ["U", "ring"],
  Ű: ["U", "doubleAcute"], Ų: ["U", "ogonek"],
  Ý: ["Y", "acute"], Ÿ: ["Y", "diaeresis"],
  Ź: ["Z", "acute"], Ž: ["Z", "caron"], Ż: ["Z", "dot"],
};
const BELOW = new Set(["ogonek", "cedilla"]);

/** Capitals with a stroke or of a shape of their own. */
// oxfmt-ignore
const OWN: Readonly<Record<string, readonly string[]>> = {
  Ł: ["##...", "##...", "##.#.", "###..", "##...", "##...", "#####"],
  Đ: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "####."].map((r, i) => (i === 3 ? "#####" : r)),
  Ø: [".####", "##.##", "##.##", "#.#.#", "##.##", "##.##", "####."],
  Æ: [".####", "##.#.", "##.#.", "#####", "##.#.", "##.#.", "##.##"],
};

const LETTER_SPACING = 1;
const MARK_ROWS = 2;

interface Glyph {
  rows: readonly string[];
  /** Row of the first line relative to the cap height (negative: a mark above it). */
  top: number;
}

/** A mark's rows fitted to a letter `width` columns wide. */
function fitMark(mark: readonly string[], width: number): string[] {
  const cut = Math.max(0, Math.floor((5 - width) / 2));
  return mark.map((r) => (".".repeat(width) + r.slice(cut, cut + width) + ".".repeat(width)).slice(width, 2 * width));
}

const glyphCache = new Map<string, Glyph>();

function glyphOf(ch: string): Glyph {
  const cached = glyphCache.get(ch);
  if (cached !== undefined) return cached;
  let glyph: Glyph;
  if (ch === METRE_SIGN) {
    glyph = { rows: METRE_GLYPH, top: 0 };
  } else {
    const up = ch === "ß" ? "SS" : ch.toUpperCase();
    const marked = MARKED[up];
    const own = OWN[up];
    if (own) {
      glyph = { rows: own, top: 0 };
    } else if (marked) {
      const [base, markName] = marked;
      const rows = GLYPHS[base] ?? [];
      const mark = fitMark(MARKS[markName] ?? [], rows[0]?.length ?? 5);
      glyph = BELOW.has(markName)
        ? { rows: [...rows, ...mark], top: 0 }
        : { rows: [...mark, ...rows], top: -MARK_ROWS };
    } else if (up.length > 1) {
      // A letter whose capital is two letters (ß): both, side by side.
      const parts = up.split("").map((c) => GLYPHS[c] ?? []);
      glyph = { rows: (parts[0] ?? []).map((_, i) => parts.map((p) => p[i] ?? "").join(".")), top: 0 };
    } else {
      glyph = { rows: GLYPHS[up] ?? GLYPHS["?"] ?? [], top: 0 };
    }
  }
  glyphCache.set(ch, glyph);
  return glyph;
}

export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (glyphOf(ch).rows[0]?.length ?? 0) + LETTER_SPACING;
  return Math.max(0, w - LETTER_SPACING);
}

/** Share of a flat colour kept in the darker edge of a stroke. */
const EDGE_SHADE = 0.58;

/**
 * How a text is coloured: one packed colour (its edges darker), or a ramp of the original's palette as its font
 * colours its letters (index `ramp` for the body, five lower for the edges, both a little lighter towards the lower
 * right of each letter).
 */
export type Ink = number | { ramp: number };

/** A packed colour darkened to `share` of itself. */
function darker(colour: number, share: number): number {
  const ch = (shift: number) => Math.round(((colour >>> shift) & 0xff) * share) << shift;
  return ((colour & 0xff000000) | ch(0) | ch(8) | ch(16)) >>> 0;
}

/** Steps of a ramp below the body's index for the edges, and the body's step below the ramp's index. */
const RAMP_EDGE_STEPS = 6;
const RAMP_BODY_STEPS = 1;

/** Whether pixel (x, y) of a glyph is on: inside its rows and drawn. */
const on = (rows: readonly string[], x: number, y: number) => rows[y]?.[x] === "#";

/**
 * Whether a glyph's pixel is on the darker edge of its stroke: the right side of a stroke two or more pixels wide,
 * or the lower side of one two or more pixels tall.
 */
const onEdge = (rows: readonly string[], x: number, y: number) =>
  (!on(rows, x + 1, y) && on(rows, x - 1, y)) || (!on(rows, x, y + 1) && on(rows, x, y - 1));

/**
 * Draws text with the font's relief and an optional one-pixel drop shadow (for text over the scene); returns the x
 * after the text.
 */
export function drawText(fb: FrameBuffer, x: number, y: number, text: string, ink: Ink, shadow?: number): number {
  const flat = typeof ink === "number" ? ink : null;
  const flatEdge = flat === null ? 0 : darker(flat, EDGE_SHADE);
  let cx = x;
  for (const ch of text) {
    const g = glyphOf(ch);
    const width = g.rows[0]?.length ?? 0;
    g.rows.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] !== "#") continue;
        const px = cx + gx;
        const py = y + g.top + gy;
        if (shadow !== undefined && !on(g.rows, gx + 1, gy + 1)) fb.put(px + 1, py + 1, shadow);
        const edge = onEdge(g.rows, gx, gy);
        if (flat !== null) {
          fb.put(px, py, edge ? flatEdge : flat);
        } else if (typeof ink !== "number") {
          const lighter = Math.floor((2 * (gy + 1) + (gx + 1)) / 6);
          fb.put(px, py, hudColour(ink.ramp - (edge ? RAMP_EDGE_STEPS : RAMP_BODY_STEPS) + lighter));
        }
      }
    });
    cx += width + LETTER_SPACING;
  }
  return cx;
}
