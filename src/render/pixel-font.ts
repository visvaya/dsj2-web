import type { FrameBuffer } from "./frame-buffer";

/** 5x7 bitmap font drawn for this project (capitals, digits, a few signs). */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": ["...", "...", "...", "...", "...", ".##", ".##"],
  ",": ["...", "...", "...", "...", ".##", "..#", ".#."],
  ":": ["..", ".#", ".#", "..", ".#", ".#", ".."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  "!": [".#.", ".#.", ".#.", ".#.", ".#.", "...", ".#."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
};

export const GLYPH_HEIGHT = 7;
const LETTER_SPACING = 1;

interface Glyph {
  rows: readonly string[];
  /** Row of the first line relative to the cap height (negative: an accent above it). */
  top: number;
}

const ACUTE = ["...#.", "..#.."];
const DOT = [".....", "..#.."];
const OGONEK = ["...#.", "....#"];
const blank = (width: number) => ".".repeat(width);

/** Polish capitals: base letter plus an accent above or an ogonek below; Ł has its own shape. */
const POLISH: Readonly<Record<string, { base: string; above?: readonly string[]; below?: readonly string[] }>> = {
  Ą: { base: "A", below: OGONEK },
  Ć: { base: "C", above: ACUTE },
  Ę: { base: "E", below: OGONEK },
  Ń: { base: "N", above: ACUTE },
  Ó: { base: "O", above: ACUTE },
  Ś: { base: "S", above: ACUTE },
  Ź: { base: "Z", above: ACUTE },
  Ż: { base: "Z", above: DOT },
};
const L_STROKE = ["#....", "#....", "#.#..", "##...", "#....", "#....", "#####"];

function glyphOf(ch: string): Glyph {
  const up = ch.toUpperCase();
  if (up === "Ł") return { rows: L_STROKE, top: 0 };
  const polish = POLISH[up];
  if (polish) {
    const base = GLYPHS[polish.base] ?? [];
    const width = base[0]?.length ?? 5;
    const pad = (rows: readonly string[]) => rows.map((r) => (r + blank(width)).slice(0, width));
    if (polish.above) return { rows: [...pad(polish.above), ...base], top: -polish.above.length };
    return { rows: [...base, ...pad(polish.below ?? [])], top: 0 };
  }
  return { rows: GLYPHS[up] ?? GLYPHS["?"] ?? [], top: 0 };
}

export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (glyphOf(ch).rows[0]?.length ?? 0) + LETTER_SPACING;
  return Math.max(0, w - LETTER_SPACING);
}

/** Draws text with an optional one-pixel drop shadow; returns the x after the text. */
export function drawText(fb: FrameBuffer, x: number, y: number, text: string, color: number, shadow?: number): number {
  const passes: [number, number, number][] =
    shadow === undefined
      ? [[0, 0, color]]
      : [
          [1, 1, shadow],
          [0, 0, color],
        ];
  let end = x;
  for (const [ox, oy, c] of passes) {
    let cx = x;
    for (const ch of text) {
      const g = glyphOf(ch);
      g.rows.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] === "#") fb.put(cx + gx + ox, y + g.top + gy + oy, c);
        }
      });
      cx += (g.rows[0]?.length ?? 0) + LETTER_SPACING;
    }
    end = cx;
  }
  return end;
}
