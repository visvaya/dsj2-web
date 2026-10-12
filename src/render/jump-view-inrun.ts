import { inrunYM, type HillProfile } from "../sim/hill-profile";
import type { FrameBuffer } from "./frame-buffer";
import { FAR_EDGE_PX, PIXELS_PER_M, surfaceY, toScreenX, toScreenY, type Camera } from "./jump-view-camera";
import { band, color, rampTable } from "./palette";

/**
 * Start gate ("belka"): a bar across the trough just behind the start position, at seat height, receding up and
 * to the right like the far rail; a short post holds its far end. The jumper sits on it, so it is drawn first.
 */
function drawStartGate(fb: FrameBuffer, cam: Camera, h: HillProfile, nearTopAt: (x: number) => number): void {
  const x = h.startXM - GATE_BEHIND_START_M;
  const sx = Math.round(toScreenX(cam, x));
  if (sx < -INRUN_FAR_SHIFT_PX - 4 || sx > fb.width + 4) return;
  const y = Math.round(toScreenY(cam, inrunYM(h, x) + GATE_HEIGHT_M));
  const light = color("gateLight");
  const dark = color("gateDark");
  const farX = sx + INRUN_FAR_SHIFT_PX;
  const farY = y - INRUN_RAIL_PX;
  fb.rect(farX, farY, 1, Math.max(1, nearTopAt(x) - INRUN_RAIL_PX - farY), dark);
  for (let i = 0; i <= INRUN_FAR_SHIFT_PX; i++) {
    const by = y - Math.round((INRUN_RAIL_PX * i) / INRUN_FAR_SHIFT_PX);
    fb.put(sx + i, by, light);
    fb.put(sx + i, by + 1, dark);
  }
}

export const TOWER_BACK_M = 6;
const TOWER_FRONT_M = 2;
const TOWER_INSET_M = 1.2;
/** The inrun's far rail appears this many pixels right of the near wall (the original's scenery depth). */
const INRUN_FAR_SHIFT_PX = 32;
/** Far rail and near wall thickness in pixels, measured on the original's screen. */
const INRUN_RAIL_PX = 8;
const INRUN_WALL_PX = 24;
/** The skis run this many pixels above the near wall's top edge, on the track. */
const INRUN_SKIS_ABOVE_WALL_PX = 3;
/** Height of the start gate's bar above the track (the jumper sits on it). */
const GATE_HEIGHT_M = 0.45;
/** The bar is just behind the skis' binding point, under the jumper's seat. */
const GATE_BEHIND_START_M = 0.35;
const PILLAR_SPACING_M = 12;
const PILLAR_WIDTH_M = 2.2;
const INRUN_LAMP_SPACING_M = 8;
/** Share of a support's width that is its front face; the rest is the shaded side. */
const SUPPORT_SIDE_FROM = 0.8;
const MAST_SPACING_M = 30;
const MAST_HEIGHT_PX = 78;
const LAMP_GLOW_PX = 7;

function inBand(v: number, from: number, width: number): number | null {
  const t = (v - from) / width;
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * The inrun as the original draws its scenery: the far rail is the near wall's top line moved right and up
 * (depth recedes up and to the right), so the platform behind the gate shows as a block with a slanted back
 * edge, the track as a light band between the rail and the near wall, and the takeoff ends in a slanted face.
 * Pixel sizes and shades measured on the original's screen.
 */
export function drawInrun(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array, lightsOn: boolean): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  const Y = (y: number) => Math.round(toScreenY(cam, y));
  const from = h.startXM - TOWER_BACK_M;
  const to = h.takeoffXM;
  const inRange = (x: number) => x >= from && x <= to;
  /** Top of the near wall at world x: a little below the skis, which run on the track above it. */
  const nearTopAt = (x: number) => Y(inrunYM(h, Math.max(x, from))) + INRUN_SKIS_ABOVE_WALL_PX;
  const support = rampTable("towerDark", "towerLight", 6);
  const side = color("towerSide");
  const track = rampTable("trackFar", "trackNear", 3);
  const wall = rampTable("wallLight", "wallDark", 4);
  const rail = rampTable("inrunRim", "inrunInner", 2);
  const face = rampTable("endLight", "endDark", 3);
  /** Rail shade by row counted from its bottom: 2 darkest rows, 3 middle, 3 light, as in the original. */
  const railShade = (fromBottom: number) => band(rail, fromBottom < 2 ? 1 : fromBottom < 5 ? 0.5 : 0);
  const sxBack = Math.round(toScreenX(cam, from));
  const sxTakeoff = Math.round(toScreenX(cam, to));
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    const wf = xAt(sx - INRUN_FAR_SHIFT_PX);
    const near = inRange(wx);
    const far = inRange(wf);
    if (!near && !far && !(sx > sxTakeoff && sx <= sxTakeoff + INRUN_FAR_SHIFT_PX)) continue;
    const gy = ground[sx] ?? fb.height;
    // Supports first: the start tower (set back from the platform's edge) and pillars, lit from the right.
    if (near) {
      const nearBottom = nearTopAt(wx) + INRUN_WALL_PX;
      const tower = inBand(wx, from + TOWER_INSET_M, TOWER_BACK_M - TOWER_INSET_M + TOWER_FRONT_M);
      const k = Math.round((wx - h.startXM - 10) / PILLAR_SPACING_M);
      const pillarFrom = h.startXM + 10 + k * PILLAR_SPACING_M - PILLAR_WIDTH_M / 2;
      const pillar = wx < to - 6 && k >= 0 ? inBand(wx, pillarFrom, PILLAR_WIDTH_M) : null;
      const shade = tower ?? pillar;
      if (shade !== null && gy > nearBottom) {
        fb.rect(
          sx,
          nearBottom,
          1,
          gy - nearBottom,
          shade > SUPPORT_SIDE_FROM ? side : band(support, shade / SUPPORT_SIDE_FROM),
        );
      }
    }
    // Far rail: where the back edge has not reached it yet, a slanted top face of the platform instead.
    let railBottom: number | null = null;
    if (far) {
      const top = nearTopAt(wf) - INRUN_RAIL_PX;
      for (let i = 0; i < INRUN_RAIL_PX; i++) fb.put(sx, top + i, railShade(INRUN_RAIL_PX - 1 - i));
      railBottom = top + INRUN_RAIL_PX;
    } else if (near) {
      // Every column the far rail has not reached yet belongs to the slanted back edge (no gap where they meet).
      const rows = Math.min(INRUN_RAIL_PX, Math.floor((INRUN_RAIL_PX * (sx - sxBack)) / INRUN_FAR_SHIFT_PX));
      const top = nearTopAt(wx) - rows;
      for (let i = 0; i < rows; i++) fb.put(sx, top + i, railShade(rows - 1 - i));
    }
    if (near) {
      const nearTop = nearTopAt(wx);
      // Track: the light band between the far rail and the near wall (none on the flat platform).
      if (railBottom !== null) {
        for (let y = railBottom; y < nearTop; y++)
          fb.put(sx, y, band(track, (y - railBottom) / Math.max(1, nearTop - railBottom)));
      }
      for (let i = 0; i < INRUN_WALL_PX; i++) fb.put(sx, nearTop + i, band(wall, i / (INRUN_WALL_PX - 1)));
    } else if (sx >= sxTakeoff && railBottom !== null) {
      // Front face of the takeoff table: the trough's cross-section, a parallelogram as tall as the near wall,
      // its top edge running from the near wall's end up to the far rail. Above it, the end of the track.
      const t = Math.max(0, sx - sxTakeoff) / INRUN_FAR_SHIFT_PX;
      const nearTop = nearTopAt(to);
      const railTop = railBottom - INRUN_RAIL_PX;
      const top = Math.round(nearTop + (railTop - nearTop) * t);
      for (let y = railBottom; y < top; y++) fb.put(sx, y, band(track, 1));
      const bottom = top + INRUN_WALL_PX;
      for (let y = Math.max(top, railBottom); y < bottom; y++)
        fb.put(sx, y, band(face, (y - top) / (INRUN_WALL_PX - 1)));
    }
  }
  drawStartGate(fb, cam, h, nearTopAt);
  if (lightsOn) {
    // Lamps on the far rail.
    const lamp = color("lampLight");
    for (let x = h.startXM; x < to; x += INRUN_LAMP_SPACING_M) {
      const sx = Math.round(toScreenX(cam, x)) + INRUN_FAR_SHIFT_PX;
      fb.rect(sx, nearTopAt(x) - INRUN_RAIL_PX - 2, 2, 2, lamp);
    }
  }
}

/** Floodlight masts behind the far fence, every 30 m from the takeoff; their lamps glow in a dithered halo. */
export function drawFloodlights(fb: FrameBuffer, h: HillProfile, cam: Camera): void {
  const pole = color("post");
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const first = h.takeoffXM + 12;
  const from = Math.max(
    first,
    first + Math.floor((cam.x - fb.width / PIXELS_PER_M - first) / MAST_SPACING_M) * MAST_SPACING_M,
  );
  for (let x = from; x < cam.x + fb.width / PIXELS_PER_M; x += MAST_SPACING_M) {
    const sx = Math.round(toScreenX(cam, x));
    if (sx < -LAMP_GLOW_PX - 4 || sx > fb.width + LAMP_GLOW_PX + 4) continue;
    const base = Math.round(toScreenY(cam, surfaceY(h, x))) - FAR_EDGE_PX - 1;
    const top = base - MAST_HEIGHT_PX;
    fb.rect(sx, top, 2, MAST_HEIGHT_PX, pole);
    for (let dy = -LAMP_GLOW_PX; dy <= LAMP_GLOW_PX; dy++) {
      for (let dx = -LAMP_GLOW_PX - 2; dx <= LAMP_GLOW_PX + 3; dx++) {
        if ((dx + dy) % 2 !== 0 || dx * dx + dy * dy > (LAMP_GLOW_PX + 1) * (LAMP_GLOW_PX + 1)) continue;
        fb.put(sx + dx, top + dy, glow);
      }
    }
    fb.rect(sx - 3, top - 2, 8, 3, lamp);
  }
}
