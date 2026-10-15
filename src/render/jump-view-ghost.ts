import type { HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer, type Rgb } from "./frame-buffer";
import { BONE_SHADES, brushLine, figurePoints, type FigureAnchor } from "./jump-view-jumper";
import { BONES, DEPTH_TO_X, DEPTH_TO_Y, type Point3 } from "./jumper-skeleton";

/**
 * The ghost of the hill's record: the record's jumper drawn as a light that the scene shows through, bluish on
 * the far side of the body and whiter on the near side, so it shows on the snow as well. It keeps its colours at night and in fog, so it
 * stays seen; it casts no shadow.
 */
const GHOST_FAR_RGB: Rgb = [96, 140, 228];
const GHOST_NEAR_RGB: Rgb = [196, 218, 255];
/** How much of the ghost's colour covers the scene under it, from 0 (none) to 1 (all). */
const GHOST_OPACITY = 0.7;
/** Shades of the body, from the far side (1) to the near side (`GHOST_SHADES`); 0 marks no ghost. */
const GHOST_SHADES = 6;

/** The pixels the ghost covers, with the shade of the nearest bone in each; kept between frames. */
let mask = new Uint8Array(0);

/** One channel of the scene with the ghost's over it. */
const mix = (under: number, over: number): number => Math.round(under + (over - under) * GHOST_OPACITY);

/** The packed colour of each shade over a given scene pixel, mixed channel by channel. */
function mixed(scene: number, shade: number): number {
  const t = (shade - 1) / (GHOST_SHADES - 1);
  const r = scene & 0xff;
  const g = (scene >>> 8) & 0xff;
  const b = (scene >>> 16) & 0xff;
  const ghost = (far: number, near: number) => far + (near - far) * t;
  return FrameBuffer.pack([
    mix(r, ghost(GHOST_FAR_RGB[0], GHOST_NEAR_RGB[0])),
    mix(g, ghost(GHOST_FAR_RGB[1], GHOST_NEAR_RGB[1])),
    mix(b, ghost(GHOST_FAR_RGB[2], GHOST_NEAR_RGB[2])),
  ]);
}

/**
 * Draws the ghost of the record's jump into the picture of the player's: the same figure as the player's jumper,
 * standing at `a`, where the ghost's position falls in the player's view. Each pixel is blended once, however many bones
 * cover it.
 */
export function drawGhost(fb: FrameBuffer, h: HillProfile, ghost: JumpSimState, a: FigureAnchor): void {
  const size = fb.width * fb.height;
  if (mask.length !== size) mask = new Uint8Array(size);
  const pts = figurePoints(h, ghost);
  const at = (i: number): Point3 => pts[i] ?? { z: 0, x: 0, y: 0 };
  const sx = (p: Point3) => a.x + (p.x - DEPTH_TO_X * p.z) * a.pxPerMX;
  const sy = (p: Point3) => a.y - (p.y - DEPTH_TO_Y * p.z) * a.pxPerMY;
  let left = fb.width;
  let right = -1;
  let top = fb.height;
  let bottom = -1;
  for (const b of BONES) {
    const shade = 1 + Math.round((b.shade / BONE_SHADES) * (GHOST_SHADES - 1));
    const from = at(b.from);
    const to = at(b.to);
    brushLine(
      (x, y) => {
        if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) return;
        const i = y * fb.width + x;
        if ((mask[i] ?? 0) < shade) mask[i] = shade;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      },
      sx(from),
      sy(from),
      sx(to),
      sy(to),
      b.thick,
    );
  }
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = y * fb.width + x;
      const shade = mask[i] ?? 0;
      if (shade === 0) continue;
      fb.put(x, y, mixed(fb.pixels[i] ?? 0, shade));
      mask[i] = 0;
    }
  }
}
