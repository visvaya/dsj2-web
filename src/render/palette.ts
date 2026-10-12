import { FrameBuffer, type Rgb } from "./frame-buffer";

const sixBit = (v: number) => Math.min(252, Math.max(0, Math.round(v / 4) * 4));

/** Rounds each channel to the 6-bit levels of a VGA DAC. */
export function vga(r: number, g: number, b: number): Rgb {
  return [sixBit(r), sixBit(g), sixBit(b)];
}

// Scene colours sampled from screenshots of the original (sky, backdrop slope, inrun, fences, distance lines, notes).
const RGB = {
  sky1: vga(100, 100, 242),
  sky2: vga(112, 136, 242),
  farSnow: vga(218, 218, 246),
  farSnowShade: vga(184, 186, 222),
  farRock: vga(168, 172, 200),
  farRockShade: vga(136, 140, 172),
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
  snow1: vga(236, 236, 244),
  snow3: vga(196, 196, 212),
  snow4: vga(172, 172, 192),
  shadow: vga(124, 124, 148),
  inrunRim: vga(86, 86, 92),
  inrunInner: vga(64, 64, 70),
  trackFar: vga(122, 122, 134),
  trackNear: vga(146, 146, 160),
  inrunHighlight: vga(170, 170, 184),
  wallLight: vga(110, 110, 116),
  wallDark: vga(58, 58, 64),
  towerLight: vga(106, 110, 114),
  towerDark: vga(56, 60, 64),
  towerSide: vga(48, 48, 56),
  endLight: vga(124, 124, 132),
  endDark: vga(72, 72, 80),
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
  grey: vga(120, 120, 132),
  green: vga(60, 180, 76),
  lampLight: vga(252, 248, 224),
  lampGlow: vga(150, 150, 120),
  moon: vga(236, 232, 208),
  moonShade: vga(196, 192, 172),
  star: vga(220, 224, 252),
  gateLight: vga(176, 176, 190),
  gateDark: vga(64, 64, 74),
  sockRed: vga(224, 64, 36),
  sockWhite: vga(236, 236, 240),
  flake: vga(244, 246, 252),
  flakeFar: vga(204, 208, 224),
} as const;

export type ColorName = keyof typeof RGB;

/** Lighting of the scene; dusk and night are derived from the day palette, so every hill gets them without extra art. */
export type Lighting = "day" | "dusk" | "night";

/** Lighting plus weather that changes colours (fog); snowfall is drawn separately. */
export interface Look {
  lighting: Lighting;
  fog: boolean;
}

/** Far scenery (sky, hillside, forest): at night only moonlight reaches it, fog hides most of it. */
const BACKDROP: ReadonlySet<ColorName> = new Set<ColorName>([
  "sky1",
  "sky2",
  "farSnow",
  "farSnowShade",
  "farRock",
  "farRockShade",
  "backdropLight",
  "backdropDark",
  "bird",
  "tree1",
  "tree2",
  "tree3",
  "trunk",
]);
/** Interface colours keep their look at any time of day and in any weather. */
const INTERFACE: ReadonlySet<ColorName> = new Set<ColorName>([
  "black",
  "yellow",
  "white",
  "red",
  "grey",
  "green",
  "noteBox",
  "noteBorder",
  "noteDropped",
  "bar",
  "lampLight",
  "lampGlow",
  "moon",
  "moonShade",
  "star",
]);
/** Sky colours are set rather than derived (a darkened blue reads as grey). */
const SKY_OVERRIDE: Readonly<Record<Exclude<Lighting, "day">, Partial<Record<ColorName, Rgb>>>> = {
  dusk: {
    sky1: vga(72, 60, 132),
    sky2: vga(236, 140, 92),
    farSnow: vga(232, 176, 164),
    farSnowShade: vga(172, 124, 144),
    farRock: vga(176, 128, 140),
    farRockShade: vga(132, 96, 124),
  },
  night: {
    sky1: vga(4, 6, 24),
    sky2: vga(14, 20, 56),
    farSnow: vga(58, 64, 100),
    farSnowShade: vga(40, 44, 76),
    farRock: vga(42, 46, 80),
    farRockShade: vga(30, 34, 62),
  },
};
const FOG: Readonly<Record<Lighting, Rgb>> = {
  day: vga(206, 210, 220),
  dusk: vga(200, 170, 172),
  night: vga(52, 56, 76),
};
/** How far each group of colours is pulled towards the fog colour. */
const FOG_BACKDROP = 0.7;
const FOG_HILL = 0.22;

/** A colour of the far scenery or of the (lit) hill, under the given lighting. */
function shade(base: Rgb, far: boolean, lighting: Lighting): Rgb {
  if (lighting === "day") return base;
  const [r, g, b] = base;
  if (lighting === "dusk") {
    // Low sun: warm and a little dimmer, the far scenery more so.
    return far ? vga(r * 0.85 + 18, g * 0.7, b * 0.76) : vga(r * 0.95 + 8, g * 0.84, b * 0.8);
  }
  // Moonlit backdrop: dark and blue. Floodlit hill (slope, inrun, fences, jumper): a little dimmer and cooler.
  return far ? vga(r * 0.2 + 4, g * 0.24 + 6, b * 0.36 + 20) : vga(r * 0.8, g * 0.82, b * 0.9);
}

function fogged(c: Rgb, far: boolean, look: Look): Rgb {
  if (!look.fog) return c;
  const f = FOG[look.lighting];
  const t = far ? FOG_BACKDROP : FOG_HILL;
  return vga(c[0] + (f[0] - c[0]) * t, c[1] + (f[1] - c[1]) * t, c[2] + (f[2] - c[2]) * t);
}

function lit(name: ColorName, look: Look): Rgb {
  if (INTERFACE.has(name)) return RGB[name];
  const far = BACKDROP.has(name);
  const override = look.lighting === "day" ? undefined : SKY_OVERRIDE[look.lighting][name];
  return fogged(override ?? shade(RGB[name], far, look.lighting), far, look);
}

const DAYLIGHT: Look = { lighting: "day", fog: false };
let look: Look = DAYLIGHT;
let lookKey = "day";

/** Runs `draw` under the given lighting and fog; colours looked up inside follow them. */
export function withLook<T>(next: Look, draw: () => T): T {
  const previous = look;
  const previousKey = lookKey;
  look = next;
  lookKey = `${next.lighting}${next.fog ? "+fog" : ""}`;
  try {
    return draw();
  } finally {
    look = previous;
    lookKey = previousKey;
  }
}

const packed = new Map<string, number>();

/** Packed RGBA value of a palette entry under the current lighting and fog. */
export function color(name: ColorName): number {
  const key = `${lookKey}:${name}`;
  let v = packed.get(key);
  if (v === undefined) {
    v = FrameBuffer.pack(lit(name, look));
    packed.set(key, v);
  }
  return v;
}

const ramps = new Map<string, Uint32Array>();

/** The bands of a ramp, index 0 = `a`, index `steps` = `b`; fetch once outside per-pixel loops. */
export function rampTable(a: ColorName, b: ColorName, steps: number): Uint32Array {
  const key = `${lookKey}:${a}>${b}>${steps}`;
  let table = ramps.get(key);
  if (table === undefined) {
    const ca = lit(a, look);
    const cb = lit(b, look);
    table = new Uint32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps;
      table[i] = FrameBuffer.pack(
        vga(ca[0] + (cb[0] - ca[0]) * tt, ca[1] + (cb[1] - ca[1]) * tt, ca[2] + (cb[2] - ca[2]) * tt),
      );
    }
    ramps.set(key, table);
  }
  return table;
}

/** The 12 colours of the original's outfit editor (sampled from its screen), lightest shade of each. */
export const OUTFIT_SWATCHES: readonly Rgb[] = [
  vga(48, 48, 52),
  vga(109, 109, 113),
  vga(170, 170, 44),
  vga(238, 174, 20),
  vga(165, 85, 40),
  vga(161, 32, 36),
  vga(165, 36, 93),
  vga(170, 40, 170),
  vga(89, 36, 165),
  vga(36, 36, 165),
  vga(28, 121, 125),
  vga(28, 137, 32),
];

/** Shades of an outfit colour for the jumper, far side dark to near side light, under the current look. */
export function swatchRampTable(index: number, steps: number): Uint32Array {
  const key = `${lookKey}:swatch${index}>${steps}`;
  let table = ramps.get(key);
  if (table === undefined) {
    const [r, g, b] = OUTFIT_SWATCHES[index] ?? OUTFIT_SWATCHES[0] ?? vga(0, 0, 0);
    const dark = fogged(shade(vga(r * 0.45, g * 0.45, b * 0.45), false, look.lighting), false, look);
    const light = fogged(
      shade(
        vga(Math.min(252, r * 1.15 + 12), Math.min(252, g * 1.15 + 12), Math.min(252, b * 1.15 + 12)),
        false,
        look.lighting,
      ),
      false,
      look,
    );
    table = new Uint32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      table[i] = FrameBuffer.pack(
        vga(dark[0] + (light[0] - dark[0]) * t, dark[1] + (light[1] - dark[1]) * t, dark[2] + (light[2] - dark[2]) * t),
      );
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
