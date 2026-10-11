import { FrameBuffer, type Rgb } from "./frame-buffer";

const sixBit = (v: number) => Math.min(252, Math.max(0, Math.round(v / 4) * 4));

/** Rounds each channel to the 6-bit levels of a VGA DAC. */
export function vga(r: number, g: number, b: number): Rgb {
  return [sixBit(r), sixBit(g), sixBit(b)];
}

const RGB = {
  sky1: vga(64, 92, 212),
  sky2: vga(100, 128, 224),
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
} as const;

export type ColorName = keyof typeof RGB;

const packed = new Map<ColorName, number>();

/** Packed RGBA value of a palette entry. */
export function color(name: ColorName): number {
  let v = packed.get(name);
  if (v === undefined) {
    v = FrameBuffer.pack(RGB[name]);
    packed.set(name, v);
  }
  return v;
}

/** Colour between two palette entries, quantised into bands like a 256-colour palette. */
export function ramp(a: ColorName, b: ColorName, t: number, steps: number): number {
  const ca = RGB[a];
  const cb = RGB[b];
  const tt = Math.round(Math.min(1, Math.max(0, t)) * steps) / steps;
  return FrameBuffer.pack(vga(ca[0] + (cb[0] - ca[0]) * tt, ca[1] + (cb[1] - ca[1]) * tt, ca[2] + (cb[2] - ca[2]) * tt));
}
