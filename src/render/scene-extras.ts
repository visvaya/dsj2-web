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
import { SKY_FIRST_INDEX } from "./scene-palette";
import type { SceneCanvas } from "./scene-span";

/**
 * This project's additions to the original's scene (wind socks, floodlights at dusk and night, stars, the moon,
 * birds; the mountains are in `scene-mountains.ts`), placed on the original's layers so they move with the hill.
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
/** The floodlight's head: a bar this wide with a bulb every other pixel, and the radius of its glow. */
const FLOODLIGHT_WIDTH_PX = 9;
const FLOODLIGHT_GLOW_PX = 12;
const FLOODLIGHT_GLOW_STRENGTH = 0.55;
const INRUN_LAMP_SPACING_M = 8;
/** Inrun lamps stand on posts on the far rail; their glow is small. */
const INRUN_LAMP_POST_PX = 3;
const INRUN_LAMP_GLOW_PX = 4;
const INRUN_LAMP_GLOW_STRENGTH = 0.45;

/**
 * A soft glow around (cx, cy): every pixel within `radius` moves towards `colour` by `strength` at the centre,
 * fading with the square of the distance; what is already drawn shows through.
 */
function drawGlow(fb: FrameBuffer, cx: number, cy: number, radius: number, colour: number, strength: number) {
  const px = fb.pixels;
  const r0 = colour & 0xff;
  const g0 = (colour >>> 8) & 0xff;
  const b0 = (colour >>> 16) & 0xff;
  for (let y = Math.max(0, Math.round(cy - radius)); y <= Math.min(fb.height - 1, Math.round(cy + radius)); y++) {
    for (let x = Math.max(0, Math.round(cx - radius)); x <= Math.min(fb.width - 1, Math.round(cx + radius)); x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const k = strength * (1 - d) * (1 - d);
      const i = y * fb.width + x;
      const c = px[i] ?? 0;
      const r = (c & 0xff) + (r0 - (c & 0xff)) * k;
      const g = ((c >>> 8) & 0xff) + (g0 - ((c >>> 8) & 0xff)) * k;
      const b = ((c >>> 16) & 0xff) + (b0 - ((c >>> 16) & 0xff)) * k;
      px[i] = ((0xff << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    }
  }
}

/**
 * Floodlight masts on the far fence, every 30 m from the takeoff: a pole with a bar of bulbs on top, glowing
 * softly into the night.
 */
export function drawFloodlights(fb: FrameBuffer, h: HillProfile, view: SceneView) {
  const pole = color("post");
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const first = h.takeoffXM + MAST_FIRST_AFTER_TAKEOFF_M;
  const [from, to] = farRange(view, FLOODLIGHT_GLOW_PX + 4);
  const start = first + Math.max(0, Math.ceil((from - first) / MAST_SPACING_M)) * MAST_SPACING_M;
  for (let x = start; x <= to; x += MAST_SPACING_M) {
    const [sx, ground] = onLayer(view, LAYER.farEdge, x, landingYM(h, x));
    const top = ground - FAR_FENCE_ROWS - MAST_HEIGHT_PX;
    fb.rect(sx, top, 2, MAST_HEIGHT_PX, pole);
    const left = sx + 1 - (FLOODLIGHT_WIDTH_PX >> 1);
    drawGlow(fb, sx + 1, top - 1, FLOODLIGHT_GLOW_PX, glow, FLOODLIGHT_GLOW_STRENGTH);
    // The bar holding the bulbs, the bulbs along its top.
    fb.rect(left, top - 1, FLOODLIGHT_WIDTH_PX, 2, pole);
    for (let i = 0; i < FLOODLIGHT_WIDTH_PX; i += 2) fb.put(left + i, top - 2, lamp);
  }
}

/** Lamps on posts along the inrun's far rail, every 8 m from the start, each with a small glow. */
export function drawInrunLamps(fb: FrameBuffer, h: HillProfile, view: SceneView, railPx: number) {
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const pole = color("post");
  for (let x = h.startXM; x < h.takeoffXM; x += INRUN_LAMP_SPACING_M) {
    const [sx, track] = onLayer(view, LAYER.inrunFar, x, inrunYM(h, x));
    if (sx < -INRUN_LAMP_GLOW_PX || sx >= fb.width + INRUN_LAMP_GLOW_PX) continue;
    const top = track - railPx - INRUN_LAMP_POST_PX;
    fb.rect(sx, top, 1, INRUN_LAMP_POST_PX, pole);
    drawGlow(fb, sx, top - 1, INRUN_LAMP_GLOW_PX, glow, INRUN_LAMP_GLOW_STRENGTH);
    fb.rect(sx - 1, top - 1, 2, 1, lamp);
  }
}

/** The moon's radius, its place across the view and its height in the sky. */
const MOON_RADIUS_PX = 4;
const MOON_ACROSS = 0.74;
const MOON_ROW = 7;
/** Rows of sky kept between the moon and the mountains under it. */
const MOON_CLEARANCE_PX = 2;
/** The moon's top never sits lower than this row, even with the mountains in front of it. */
const MOON_LOWEST_TOP_PX = 1;
/** Where else across the view the moon may stand, and the rows of sky it needs to show whole. */
const MOON_FROM = 0.3;
const MOON_TO = 0.92;
const MOON_ROOM_PX = MOON_ROW + MOON_RADIUS_PX + MOON_CLEARANCE_PX;
/** Stars move with the farthest layer. */
const STAR_DRIFT = 0.01;

/**
 * Stars and the moon, drawn over the sky's rows (0..`skyRows` - 1) after the mountains and before the background,
 * only where the sky still shows; the moon stands above the mountains in its column.
 */
export function drawNightSky(c: SceneCanvas, view: SceneView, frame: number, skyRows: number) {
  const { fb, indices } = c;
  const star = color("star");
  const drift = Math.round(view.camX * STAR_DRIFT);
  const px = fb.pixels;
  const rows = Math.min(skyRows, fb.height);
  const isSky = (x: number, y: number) => (indices[y * fb.width + x] ?? 0) >= SKY_FIRST_INDEX;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < fb.width; x++) {
      const r = hash((x + drift) * 977 + y * 131);
      if (r % 53 === 0 && ((r >>> 9) + Math.floor(frame / 20)) % 7 !== 0 && isSky(x, y)) px[y * fb.width + x] = star;
    }
  }
  // The moon goes where the most sky shows above the mountains, near its usual place.
  const clearAt = (x: number) => {
    let y = 0;
    while (y < rows && isSky(x, y)) y++;
    return y;
  };
  const clearUnder = (cx: number) => {
    let clear = rows;
    for (let x = Math.max(0, cx - MOON_RADIUS_PX); x <= Math.min(fb.width - 1, cx + MOON_RADIUS_PX); x++) {
      clear = Math.min(clear, clearAt(x));
    }
    return clear;
  };
  let cx = Math.round(fb.width * MOON_ACROSS);
  let clear = clearUnder(cx);
  for (let x = Math.round(fb.width * MOON_FROM); x <= Math.round(fb.width * MOON_TO) && clear < MOON_ROOM_PX; x++) {
    const here = clearUnder(x);
    if (here > clear) {
      cx = x;
      clear = here;
    }
  }
  // With little sky it rises from behind the mountains, its top showing.
  const cy = Math.max(
    MOON_LOWEST_TOP_PX + MOON_RADIUS_PX,
    Math.min(MOON_ROW, clear - MOON_RADIUS_PX - MOON_CLEARANCE_PX),
  );
  for (let dy = -MOON_RADIUS_PX; dy <= MOON_RADIUS_PX; dy++) {
    for (let dx = -MOON_RADIUS_PX; dx <= MOON_RADIUS_PX; dx++) {
      if (dx * dx + dy * dy > MOON_RADIUS_PX * MOON_RADIUS_PX) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= fb.width || y < 0 || y >= rows || !isSky(x, y)) continue;
      const crater = (dx === -1 && dy === -1) || (dx === 1 && dy === 1) || dx + dy > 4;
      fb.put(x, y, color(crater ? "moonShade" : "moon"));
    }
  }
}

/**
 * A bird seen from the side, as rows of pixels around its body ("#" body, "+" wing): the wing beat (up, half up,
 * down, half down) and the glide with the wings bent like a gull's, so a bird is never a flat line; a far bird is
 * drawn with the narrow set.
 */
// oxfmt-ignore
export const BIRD_FRAMES: Readonly<Record<"near" | "far", { beat: readonly (readonly string[])[]; glide: readonly string[] }>> = {
  near: {
    beat: [
      ["+.....+", ".+...+.", "..+#+.."],
      [".......", "++...++", "..+#+.."],
      ["..+#+..", ".+...+.", "+.....+"],
      [".......", "..+#+..", "++...++"],
    ],
    glide: [".......", ".++.++.", "+..#..+"],
  },
  far: {
    beat: [
      ["+...+", ".+#+."],
      [".+.+.", "+.#.+"],
      [".+#+.", "+...+"],
      ["+.#.+", ".+.+."],
    ],
    glide: ["+...+", ".+#+."],
  },
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
    const shapes = BIRD_FRAMES[far ? "far" : "near"];
    const rows = gliding ? shapes.glide : (shapes.beat[beat % shapes.beat.length] ?? shapes.glide);
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === "+") fb.put(sx + dx - (row.length >> 1), sy + dy - 1, wing);
        else if (ch === "#") fb.put(sx + dx - (row.length >> 1), sy + dy - 1, body);
      }
    });
  }
}
