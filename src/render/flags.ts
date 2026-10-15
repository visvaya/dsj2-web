/**
 * Pixel flags (15 x 10) for the hill list. Drawn for this project in the game's low-resolution style,
 * simplified where a real flag has more detail than 150 pixels can hold; flags with an emblem are drawn pixel
 * by pixel.
 */

export const FLAG_WIDTH_PX = 15;
export const FLAG_HEIGHT_PX = 10;

// oxfmt-ignore
export type CountryCode =
  | "AT" | "AU" | "BE" | "BY" | "CA" | "CH" | "CN" | "CZ" | "DE" | "DK" | "EE" | "ENG" | "FI" | "FR" | "HU" | "IE"
  | "IS" | "IT" | "JP" | "KR" | "KZ" | "LT" | "LV" | "NL" | "NO" | "PL" | "RU" | "SE" | "SI" | "SK" | "UA" | "US";

/** One CSS colour per pixel, row by row. */
export type FlagPixels = readonly (readonly string[])[];

const C = {
  white: "#f4f4f4",
  red: "#d42c20",
  darkRed: "#a0303c",
  blue: "#1c4cb0",
  navy: "#14246c",
  sky: "#34a8d8",
  teal: "#00a8c8",
  green: "#209040",
  darkGreen: "#14743c",
  yellow: "#f8d038",
  orange: "#f08820",
  black: "#141414",
} as const;

/** A flag being drawn; every drawing call returns the same grid, so calls chain. */
interface Grid {
  readonly px: FlagPixels;
  rect: (x: number, y: number, w: number, h: number, c: string) => Grid;
  set: (x: number, y: number, c: string) => Grid;
  disc: (cx: number, cy: number, r: number, c: string) => Grid;
}

function grid(fill: string): Grid {
  const px = Array.from({ length: FLAG_HEIGHT_PX }, () => Array.from({ length: FLAG_WIDTH_PX }, () => fill));
  const put = (x: number, y: number, c: string): void => {
    const row = px[y];
    if (row && x >= 0 && x < FLAG_WIDTH_PX) row[x] = c;
  };
  const self: Grid = {
    px,
    rect(x, y, w, h, c) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
      return self;
    },
    set(x, y, c) {
      put(x, y, c);
      return self;
    },
    disc(cx, cy, r, c) {
      for (let y = 0; y < FLAG_HEIGHT_PX; y++) {
        for (let x = 0; x < FLAG_WIDTH_PX; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, c);
      }
      return self;
    },
  };
  return self;
}

/** A flag drawn pixel by pixel: one string per row, each character a colour of `colours` ("." the background). */
function pixelArt(background: string, colours: Readonly<Record<string, string>>, rows: readonly string[]): Grid {
  const g = grid(background);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colours[row[x] ?? "."];
      if (c !== undefined) g.set(x, y, c);
    }
  });
  return g;
}

/** Three horizontal bands of 3, 4 and 3 rows. */
const horizontal = (a: string, b: string, c: string) => grid(b).rect(0, 0, 15, 3, a).rect(0, 7, 15, 3, c);
/** Three vertical bands of 5 columns. */
const vertical = (a: string, b: string, c: string) => grid(b).rect(0, 0, 5, 10, a).rect(10, 0, 5, 10, c);
/** Nordic cross (2 pixels thick), or a 4-pixel cross with a 2-pixel inner one. */
function nordic(field: string, cross: string, inner?: string): Grid {
  if (inner === undefined) return grid(field).rect(4, 0, 2, 10, cross).rect(0, 4, 15, 2, cross);
  return grid(field)
    .rect(3, 0, 4, 10, cross)
    .rect(0, 3, 15, 4, cross)
    .rect(4, 0, 2, 10, inner)
    .rect(0, 4, 15, 2, inner);
}

const FLAGS: Readonly<Record<CountryCode, () => Grid>> = {
  AT: () => horizontal(C.red, C.white, C.red),
  AU: () =>
    grid(C.navy)
      .rect(0, 1, 7, 3, C.white)
      .rect(2, 0, 3, 5, C.white)
      .rect(0, 2, 7, 1, C.red)
      .rect(3, 0, 1, 5, C.red)
      .set(3, 7, C.white)
      .set(11, 2, C.white)
      .set(13, 4, C.white)
      .set(10, 6, C.white)
      .set(12, 8, C.white),
  BE: () => vertical(C.black, C.yellow, C.red),
  BY: () => {
    const g = grid(C.red).rect(0, 7, 15, 3, C.green).rect(0, 0, 3, 10, C.white);
    for (let y = 0; y < 10; y++) g.set(1, y, C.red).set(y % 2 === 0 ? 0 : 2, y, C.red);
    return g;
  },
  CA: () =>
    pixelArt(C.white, { R: C.red }, [
      "RRRR.......RRRR",
      "RRRR...R...RRRR",
      "RRRR..RRR..RRRR",
      "RRRR.R.R.R.RRRR",
      "RRRR.RRRRR.RRRR",
      "RRRR..RRR..RRRR",
      "RRRR.RRRRR.RRRR",
      "RRRR..RRR..RRRR",
      "RRRR...R...RRRR",
      "RRRR.......RRRR",
    ]),
  CH: () => grid(C.red).rect(6, 2, 3, 6, C.white).rect(4, 4, 7, 2, C.white),
  CN: () =>
    grid(C.red)
      .rect(2, 2, 3, 2, C.yellow)
      .set(3, 1, C.yellow)
      .set(2, 4, C.yellow)
      .set(4, 4, C.yellow)
      .set(6, 1, C.yellow)
      .set(7, 2, C.yellow)
      .set(7, 4, C.yellow)
      .set(6, 5, C.yellow),
  CZ: () => {
    const g = grid(C.white).rect(0, 5, 15, 5, C.red);
    for (let y = 0; y < 10; y++) {
      const reach = Math.round(7 * (1 - Math.abs(y - 4.5) / 5));
      g.rect(0, y, reach, 1, C.blue);
    }
    return g;
  },
  DE: () => horizontal(C.black, C.red, C.yellow),
  DK: () => nordic(C.red, C.white),
  EE: () => horizontal(C.sky, C.black, C.white),
  ENG: () => grid(C.white).rect(6, 0, 3, 10, C.red).rect(0, 4, 15, 2, C.red),
  FI: () => nordic(C.white, C.blue),
  FR: () => vertical(C.blue, C.white, C.red),
  HU: () => horizontal(C.red, C.white, C.green),
  IE: () => vertical(C.green, C.white, C.orange),
  IS: () => nordic(C.blue, C.white, C.red),
  IT: () => vertical(C.green, C.white, C.red),
  JP: () => grid(C.white).disc(7, 4.5, 3, C.red),
  KR: () =>
    pixelArt(C.white, { R: C.red, B: C.blue, K: C.black }, [
      "...............",
      "..K.........K..",
      ".K.K..RRR..K.K.",
      "..K..RRRRR..K..",
      "....RRRRRRR....",
      "....RRRRRBB....",
      "..K.RRBBBBB.K..",
      ".K.K.BBBBB.K.K.",
      "..K...BBB...K..",
      "...............",
    ]),
  KZ: () =>
    pixelArt(C.teal, { Y: C.yellow, T: C.teal }, [
      "TYTTTTTTTTTTTTT",
      "YTYTTTTTYTTTTTT",
      "TYTTTTYTTTYTTTT",
      "YTYTTTTYYYTTTTT",
      "TYTTTYTYYYTYTTT",
      "YTYTTTTYYYTTTTT",
      "TYTTTTYTTTYTTTT",
      "YTYTYYTTYTTYYTT",
      "TYTTTTYYYYYTTTT",
      "YTYTTTTTTTTTTTT",
    ]),
  LT: () => horizontal(C.yellow, C.darkGreen, C.red),
  LV: () => grid(C.darkRed).rect(0, 4, 15, 2, C.white),
  NL: () => horizontal(C.red, C.white, C.blue),
  NO: () => nordic(C.red, C.white, C.navy),
  PL: () => grid(C.white).rect(0, 5, 15, 5, C.red),
  RU: () => horizontal(C.white, C.blue, C.red),
  SE: () => nordic(C.blue, C.yellow),
  SI: () =>
    pixelArt(C.white, { R: C.red, B: C.blue, Y: C.yellow, W: C.white }, [
      "...............",
      "..RRRRRR.......",
      "..RYBBYR.......",
      "..RBWWBR.......",
      "BBRWWWWRBBBBBBB",
      "BBRBWBWRBBBBBBB",
      "BBBRBBRBBBBBBBB",
      "RRRRRRRRRRRRRRR",
      "RRRRRRRRRRRRRRR",
      "RRRRRRRRRRRRRRR",
    ]),
  SK: () =>
    pixelArt(C.white, { R: C.red, B: C.blue, W: C.white }, [
      "...............",
      "..WWWWWWW......",
      "..WRRWRRW......",
      "BBWRWWWRWBBBBBB",
      "BBWRRWRRWBBBBBB",
      "BBWWWWWWWBBBBBB",
      "BBWRRWRRWBBBBBB",
      "RRWBBBBBWRRRRRR",
      "RRRWBBBWRRRRRRR",
      "RRRRWWWRRRRRRRR",
    ]),
  UA: () => grid(C.blue).rect(0, 5, 15, 5, C.yellow),
  US: () => {
    const g = grid(C.white);
    for (let y = 0; y < 10; y += 2) g.rect(0, y, 15, 1, C.red);
    g.rect(0, 0, 7, 5, C.navy);
    for (let y = 1; y < 5; y += 2) for (let x = 1; x < 7; x += 2) g.set(x, y, C.white);
    return g;
  },
};

/** A question mark, 3 x 5 pixels, for hills without a country. */
const QUESTION_MARK = ["###", "..#", ".#.", "...", ".#."];

/** Flag of a hill with no country: grey with a question mark. */
export function unknownFlagPixels(): FlagPixels {
  const g = grid("#6c6c78");
  QUESTION_MARK.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") g.set(6 + x, 2 + y, C.white);
  });
  return g.px;
}

/** Pixels of a flag, row by row. */
export function flagPixels(code: CountryCode): FlagPixels {
  return FLAGS[code]().px;
}

// oxfmt-ignore
export const COUNTRY_CODES: readonly CountryCode[] = [
  "AT", "AU", "BE", "BY", "CA", "CH", "CN", "CZ", "DE", "DK", "EE", "ENG", "FI", "FR", "HU", "IE",
  "IS", "IT", "JP", "KR", "KZ", "LT", "LV", "NL", "NO", "PL", "RU", "SE", "SI", "SK", "UA", "US",
];
