import { FrameBuffer, type Rgb } from "./frame-buffer";

const sixBit = (v: number) => Math.min(252, Math.max(0, Math.round(v / 4) * 4));

/** Rounds each channel to the 6-bit levels of a VGA DAC. */
export function vga(r: number, g: number, b: number): Rgb {
  return [sixBit(r), sixBit(g), sixBit(b)];
}

// Scene colours sampled from screenshots of the original (sky, backdrop slope, fences, distance lines, notes).
const RGB = {
  sky1: vga(100, 100, 242),
  sky2: vga(112, 136, 242),
  farSnow: vga(218, 218, 246),
  farSnowShade: vga(184, 186, 222),
  backdropLight: vga(206, 206, 234),
  backdropDark: vga(146, 150, 162),
  bird: vga(92, 60, 28),
  nearFence: vga(190, 137, 16),
  nearFenceDark: vga(117, 85, 12),
  kLine: vga(20, 93, 24),
  recordLine: vga(234, 80, 89),
  bestLine: vga(85, 85, 238),
  noteBox: vga(28, 28, 36),
  noteBorder: vga(72, 72, 76),
  noteDropped: vga(190, 137, 16),
  bar: vga(16, 16, 24),
  haze1: vga(200, 204, 224),
  snow1: vga(236, 236, 244),
  snow3: vga(196, 196, 212),
  snow4: vga(172, 172, 192),
  shadow: vga(124, 124, 148),
  inrunRim: vga(84, 84, 96),
  inrunInner: vga(116, 116, 128),
  trackFar: vga(156, 156, 168),
  trackNear: vga(188, 188, 198),
  inrunHighlight: vga(212, 212, 222),
  wallLight: vga(176, 176, 186),
  wallDark: vga(92, 92, 104),
  towerLight: vga(150, 150, 160),
  towerDark: vga(96, 96, 108),
  endLight: vga(200, 200, 208),
  endDark: vga(150, 150, 160),
  steel1: vga(150, 150, 162),
  steel2: vga(112, 112, 124),
  steel3: vga(84, 84, 96),
  fence: vga(168, 112, 44),
  fenceDark: vga(112, 72, 24),
  post: vga(28, 24, 16),
  tree1: vga(12, 44, 24),
  tree2: vga(24, 76, 36),
  tree3: vga(44, 104, 52),
  trunk: vga(84, 52, 24),
  black: vga(0, 0, 0),
  yellow: vga(248, 208, 56),
  white: vga(244, 244, 244),
  red: vga(212, 36, 28),
  redDark: vga(140, 20, 16),
  blue: vga(36, 52, 172),
  suitDark: vga(20, 32, 112),
  suitLight: vga(72, 100, 228),
  sleeveDark: vga(150, 150, 170),
  sleeveLight: vga(250, 250, 252),
  gloveDark: vga(150, 110, 20),
  gloveLight: vga(252, 220, 80),
  helmetDark: vga(170, 120, 10),
  helmetLight: vga(252, 216, 64),
  grey: vga(120, 120, 132),
  green: vga(60, 180, 76),
  lampLight: vga(252, 248, 224),
  lampGlow: vga(150, 150, 120),
  moon: vga(236, 232, 208),
  moonShade: vga(196, 192, 172),
  star: vga(220, 224, 252),
  flake: vga(244, 246, 252),
  flakeFar: vga(204, 208, 224),
} as const;

export type ColorName = keyof typeof RGB;

/** Lighting of the scene; night is derived from the day palette, so every hill gets it without extra art. */
export type Lighting = "day" | "night";

/** Far scenery (sky, hillside, forest): at night only moonlight reaches it. */
const BACKDROP: ReadonlySet<ColorName> = new Set<ColorName>([
  "sky1", "sky2", "farSnow", "farSnowShade", "backdropLight", "backdropDark", "bird", "haze1",
  "tree1", "tree2", "tree3", "trunk",
]);
/** Interface colours keep their look at any time of day. */
const INTERFACE: ReadonlySet<ColorName> = new Set<ColorName>([
  "black", "yellow", "white", "red", "grey", "green", "noteBox", "noteBorder", "noteDropped", "bar",
  "lampLight", "lampGlow", "moon", "moonShade", "star",
]);
/** Night sky colours are set rather than derived (a darkened blue reads as grey). */
const NIGHT_OVERRIDE: Partial<Record<ColorName, Rgb>> = {
  sky1: vga(4, 6, 24),
  sky2: vga(14, 20, 56),
  farSnow: vga(58, 64, 100),
  farSnowShade: vga(40, 44, 76),
};

function lit(name: ColorName, lighting: Lighting): Rgb {
  const [r, g, b] = RGB[name];
  if (lighting === "day" || INTERFACE.has(name)) return RGB[name];
  const override = NIGHT_OVERRIDE[name];
  if (override) return override;
  // Moonlit backdrop: dark and blue. Floodlit hill (slope, inrun, fences, jumper): a little dimmer and cooler.
  if (BACKDROP.has(name)) return vga(r * 0.2 + 4, g * 0.24 + 6, b * 0.36 + 20);
  return vga(r * 0.8, g * 0.82, b * 0.9);
}

let lighting: Lighting = "day";

/** Runs `draw` with the given lighting; colours looked up inside follow it. */
export function withLighting<T>(next: Lighting, draw: () => T): T {
  const previous = lighting;
  lighting = next;
  try {
    return draw();
  } finally {
    lighting = previous;
  }
}

const packed = new Map<string, number>();

/** Packed RGBA value of a palette entry under the current lighting. */
export function color(name: ColorName): number {
  const key = `${lighting}:${name}`;
  let v = packed.get(key);
  if (v === undefined) {
    v = FrameBuffer.pack(lit(name, lighting));
    packed.set(key, v);
  }
  return v;
}

const ramps = new Map<string, Uint32Array>();

/** The bands of a ramp, index 0 = `a`, index `steps` = `b`; fetch once outside per-pixel loops. */
export function rampTable(a: ColorName, b: ColorName, steps: number): Uint32Array {
  const key = `${lighting}:${a}>${b}>${steps}`;
  let table = ramps.get(key);
  if (table === undefined) {
    const ca = lit(a, lighting);
    const cb = lit(b, lighting);
    table = new Uint32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps;
      table[i] = FrameBuffer.pack(vga(ca[0] + (cb[0] - ca[0]) * tt, ca[1] + (cb[1] - ca[1]) * tt, ca[2] + (cb[2] - ca[2]) * tt));
    }
    ramps.set(key, table);
  }
  return table;
}

/** Band of a ramp table for t in 0..1 (clamped). */
export function band(table: Uint32Array, t: number): number {
  const steps = table.length - 1;
  return table[Math.round(Math.min(1, Math.max(0, t)) * steps)] ?? 0;
}

/** Colour between two palette entries, quantised into bands like a 256-colour palette. */
export function ramp(a: ColorName, b: ColorName, t: number, steps: number): number {
  return band(rampTable(a, b, steps), t);
}
