import { displayedWindMPerS } from "../game/wind-display";
import { inrunYM, landingYM, type HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import { fastSin, hash } from "./jump-view-camera";
import {
  LAYER,
  layerIndex,
  layerOffset,
  layerRows,
  layerX,
  originalColumn,
  viewColumn,
  type SceneView,
} from "./scene-layers";
import { color } from "./palette";

/**
 * This project's additions to the original's scene (wind socks, floodlights at dusk and night, stars, the moon,
 * birds), placed on the original's layers so they move with the hill.
 */

/** Where world x stands on a layer's ground: screen column and row. */
function onLayer(view: SceneView, layer: number, xM: number, yM: number): [number, number] {
  const off = layerOffset(view, layer);
  return [viewColumn(view, layerIndex(layer, xM) - off.x), layerRows(layer, yM) + off.y];
}

/** Rows of the far fence; masts and socks stand on its top. */
const FAR_FENCE_ROWS = 5;
const SOCK_SPACING_M = 25;
const SOCK_FIRST_AFTER_TAKEOFF_M = 15;
const SOCK_POLE_PX = 14;
const SOCK_LENGTH_PX = 8;
/** Wind at which a sock flies straight out. */
const SOCK_FULL_WIND_M_PER_S = 4.5;

/**
 * Screen direction (unit vector, y down) a wind sock points in: along the displayed wind, the same vector the
 * indicator box shows, blended with hanging straight down as the wind drops towards calm.
 */
export function windSockDirection(s: JumpSimState): [number, number] {
  const w = displayedWindMPerS(s.wind);
  const speed = Math.hypot(w.x, w.y);
  if (!(speed > 0)) return [0, 1];
  const k = Math.min(1, speed / SOCK_FULL_WIND_M_PER_S);
  const dirX = (w.x / speed) * k;
  const dirY = (-w.y / speed) * k + (1 - k);
  const len = Math.hypot(dirX, dirY) || 1;
  return [dirX / len, dirY / len];
}

/** World x of the far fence's visible stretch, from a little left of the view to a little right of it. */
function farRange(view: SceneView, marginPx: number): [number, number] {
  const off = layerOffset(view, LAYER.farEdge);
  return [
    layerX(LAYER.farEdge, off.x + originalColumn(view, -marginPx)),
    layerX(LAYER.farEdge, off.x + originalColumn(view, view.widthPx + marginPx)),
  ];
}

/**
 * Wind socks on poles on the far fence, every 25 m along the landing hill. They stream along the game's wind in the
 * side view (along the hill and vertical) and hang down in a calm; the flutter is only for show.
 */
export function drawWindSocks(fb: FrameBuffer, h: HillProfile, view: SceneView, s: JumpSimState, frame: number) {
  const pole = color("post");
  const red = color("sockRed");
  const white = color("sockWhite");
  const [ux0, uy0] = windSockDirection(s);
  const k = Math.min(1, s.wind.speedMPerS / SOCK_FULL_WIND_M_PER_S);
  const first = h.takeoffXM + SOCK_FIRST_AFTER_TAKEOFF_M;
  const [from, to] = farRange(view, 20);
  const start = first + Math.max(0, Math.ceil((from - first) / SOCK_SPACING_M)) * SOCK_SPACING_M;
  for (let x = start; x <= Math.min(to, h.outrunStartXM); x += SOCK_SPACING_M) {
    const [sx, ground] = onLayer(view, LAYER.farEdge, x, landingYM(h, x));
    const top = ground - FAR_FENCE_ROWS - SOCK_POLE_PX;
    fb.rect(sx, top, 1, SOCK_POLE_PX, pole);
    const flutter = 0.12 * k * fastSin(frame / 4 + x);
    const ux = ux0 - flutter * uy0;
    const uy = uy0 + flutter * ux0;
    for (let i = 0; i < SOCK_LENGTH_PX; i++) {
      const c = Math.floor(i / 2) % 2 === 0 ? red : white;
      const px = sx + 0.5 + ux * i;
      const py = top + uy * i;
      fb.put(px, py, c);
      // Wider at the mouth, thinning to the tail.
      if (i < SOCK_LENGTH_PX - 3) fb.put(px - uy, py + ux, c);
    }
  }
}

const MAST_SPACING_M = 30;
const MAST_FIRST_AFTER_TAKEOFF_M = 12;
const MAST_HEIGHT_PX = 78;
const LAMP_GLOW_PX = 7;
const INRUN_LAMP_SPACING_M = 8;
/** Inrun lamps sit on the far rail, this far above its top. */
const INRUN_LAMP_ABOVE_RAIL_PX = 2;

/** Floodlight masts on the far fence, every 30 m from the takeoff; their lamps glow in a dithered halo. */
export function drawFloodlights(fb: FrameBuffer, h: HillProfile, view: SceneView) {
  const pole = color("post");
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const first = h.takeoffXM + MAST_FIRST_AFTER_TAKEOFF_M;
  const [from, to] = farRange(view, LAMP_GLOW_PX + 4);
  const start = first + Math.max(0, Math.ceil((from - first) / MAST_SPACING_M)) * MAST_SPACING_M;
  for (let x = start; x <= to; x += MAST_SPACING_M) {
    const [sx, ground] = onLayer(view, LAYER.farEdge, x, landingYM(h, x));
    const top = ground - FAR_FENCE_ROWS - MAST_HEIGHT_PX;
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

/** Lamps on the inrun's far rail, every 8 m from the start. */
export function drawInrunLamps(fb: FrameBuffer, h: HillProfile, view: SceneView, railPx: number) {
  const lamp = color("lampLight");
  for (let x = h.startXM; x < h.takeoffXM; x += INRUN_LAMP_SPACING_M) {
    const [sx, track] = onLayer(view, LAYER.inrunFar, x, inrunYM(h, x));
    if (sx < -2 || sx >= fb.width) continue;
    fb.rect(sx, track - railPx - INRUN_LAMP_ABOVE_RAIL_PX, 2, 2, lamp);
  }
}

/** The moon's radius, its place across the view and its height in the sky. */
const MOON_RADIUS_PX = 4;
const MOON_ACROSS = 0.74;
const MOON_ROW = 7;
/** Stars move with the farthest layer. */
const STAR_DRIFT = 0.01;

/**
 * Stars and the moon, drawn over the sky's rows (0..`skyRows` - 1) before the background, so its hills stay in
 * front of them.
 */
export function drawNightSky(fb: FrameBuffer, view: SceneView, frame: number, skyRows: number) {
  const star = color("star");
  const drift = Math.round(view.camX * STAR_DRIFT);
  const px = fb.pixels;
  for (let y = 0; y < Math.min(skyRows, fb.height); y++) {
    for (let x = 0; x < fb.width; x++) {
      const i = y * fb.width + x;
      const r = hash((x + drift) * 977 + y * 131);
      if (r % 53 === 0 && ((r >>> 9) + Math.floor(frame / 20)) % 7 !== 0) px[i] = star;
    }
  }
  const cx = Math.round(fb.width * MOON_ACROSS);
  for (let dy = -MOON_RADIUS_PX; dy <= MOON_RADIUS_PX; dy++) {
    for (let dx = -MOON_RADIUS_PX; dx <= MOON_RADIUS_PX; dx++) {
      if (dx * dx + dy * dy > MOON_RADIUS_PX * MOON_RADIUS_PX) continue;
      const x = cx + dx;
      const y = MOON_ROW + dy;
      if (x < 0 || x >= fb.width || y < 0 || y >= skyRows) continue;
      const crater = (dx === -1 && dy === -1) || (dx === 1 && dy === 1) || dx + dy > 4;
      fb.put(x, y, color(crater ? "moonShade" : "moon"));
    }
  }
}

/**
 * Wing beats of a bird seen from the side, as rows of pixels around its body ("#" body, "+" wing): wings up, level,
 * down and level again; a far bird is drawn with the narrow set.
 */
// oxfmt-ignore
const BIRD_FRAMES: Readonly<Record<"near" | "far", readonly (readonly string[])[]>> = {
  near: [
    ["+.....+", ".+...+.", "..+#+.."],
    [".......", "+++#+++", "......."],
    ["..+#+..", ".+...+.", "+.....+"],
    [".......", ".++#++.", "+.....+"],
  ],
  far: [
    ["+...+", ".+#+."],
    ["++#++", "....."],
    [".+#+.", "+...+"],
    ["++#++", "....."],
  ],
};
/** Frames each wing position is held, and how long a bird glides with level wings between bursts of beats. */
const BIRD_BEAT_FRAMES = 6;
const BIRD_BEATS = 8;
const BIRD_GLIDE_BEATS = 6;
const BIRD_COUNT = 4;

/** A few birds crossing high above the background, beating their wings in bursts and gliding between them. */
export function drawBirds(fb: FrameBuffer, view: SceneView, frame: number) {
  const span = fb.width + 60;
  const origin = view.camX * 0.05;
  const wing = color("bird");
  const body = color("birdBody");
  for (let i = 0; i < BIRD_COUNT; i++) {
    const far = i % 2 === 1;
    const worldX = frame * (far ? 0.09 : 0.14 + i * 0.02) + i * 131;
    const sx = Math.round((((worldX - origin) % span) + span) % span) - 30;
    const sy = Math.round(12 + i * 6 + 2 * Math.sin(frame / 37 + i * 2));
    const beat = Math.floor(frame / BIRD_BEAT_FRAMES) + i * 5;
    const gliding = beat % (BIRD_BEATS + BIRD_GLIDE_BEATS) >= BIRD_BEATS;
    const frames = BIRD_FRAMES[far ? "far" : "near"];
    const rows = (gliding ? frames[1] : frames[beat % frames.length]) ?? [];
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === "+") fb.put(sx + dx - (row.length >> 1), sy + dy - 1, wing);
        else if (ch === "#") fb.put(sx + dx - (row.length >> 1), sy + dy - 1, body);
      }
    });
  }
}
