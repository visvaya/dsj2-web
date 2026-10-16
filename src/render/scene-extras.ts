import { displayedWindMPerS } from "../game/wind-display";
import { inrunYM, landingYM, type HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import { fastSin, hash } from "./jump-view-camera";
import type { HillLook } from "./hill-look";
import {
  LAYER,
  layerIndex,
  layerOffset,
  layerRows,
  layerX,
  originalColumn,
  sceneView,
  viewColumn,
  type SceneView,
} from "./scene-layers";
import { color } from "./palette";
import { FLOODLIGHT, firstMastXM } from "./scene-floodlight";
import { skyRowsAbove } from "./scene-mountains";
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
const SOCK_LENGTH_PX = 9;
/** Half the width of the sock at its ring when full of wind, and at its tail; its bands, red first. */
const SOCK_MOUTH_HALF_PX = 1.6;
const SOCK_TAIL_HALF_PX = 0.5;
const SOCK_BANDS = 5;
/** A slack sock is narrower: this share of its full width in a calm. */
const SOCK_SLACK_WIDTH = 0.55;
/** Wind at which a sock flies straight out. */
const SOCK_FULL_WIND_M_PER_S = 4.5;

/**
 * Screen direction (unit vector, y down) a wind sock points in: along the displayed wind, the way the indicator
 * box's arrow lies on the screen, blended with hanging straight down as the wind drops towards calm.
 */
export function windSockDirection(s: JumpSimState): [number, number] {
  const w = displayedWindMPerS(s.wind);
  const length = Math.hypot(w.x, w.y);
  if (!(length > 0)) return [0, 1];
  const k = Math.min(1, s.wind.speedMPerS / SOCK_FULL_WIND_M_PER_S);
  const dirX = (w.x / length) * k;
  const dirY = (-w.y / length) * k + (1 - k);
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
 * Wind socks on poles on the far fence, every 25 m along the landing hill: cones in bands of red and white that
 * stream the way the box's arrow points and fill with the wind, narrower and hanging down in a calm; the flutter
 * is only for show.
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
    // A cone from the ring at the top of the pole to the tail, filled across its width, in bands of red and white.
    const full = SOCK_SLACK_WIDTH + (1 - SOCK_SLACK_WIDTH) * k;
    for (let t = 0; t <= SOCK_LENGTH_PX; t += 0.5) {
      const share = t / SOCK_LENGTH_PX;
      const half = (SOCK_MOUTH_HALF_PX + (SOCK_TAIL_HALF_PX - SOCK_MOUTH_HALF_PX) * share) * full;
      const c = Math.min(SOCK_BANDS - 1, Math.floor(share * SOCK_BANDS)) % 2 === 0 ? red : white;
      for (let w = -half; w <= half; w += 0.5) {
        fb.put(sx + 0.5 + ux * t - uy * w, top + uy * t + ux * w, c);
      }
    }
  }
}

const MAST_HEIGHT_PX = 78;
/** The floodlight's head: lamps in one row inside a dark frame, and the short rays of light either side of it. */
const FLOODLIGHT_LAMPS = 4;
const FLOODLIGHT_RAY_PX = 2;
/** A light glow around the lamps of a floodlight and of an inrun lamp: radius and strength at the centre. */
const FLOODLIGHT_GLOW = { radius: 9, strength: 0.35 } as const;
const INRUN_LAMP_GLOW = { radius: 4, strength: 0.3 } as const;
const INRUN_LAMP_SPACING_M = 8;
/** Inrun lamps stand on short posts on the far rail. */
const INRUN_LAMP_POST_PX = 3;

/**
 * Floodlight masts on the far fence, every 30 m from the takeoff, drawn plainly like the rest of the scene: a thin
 * mast, a row of lamps in a dark frame on top, short rays of light either side and above, and a light glow.
 */
export function drawFloodlights(fb: FrameBuffer, h: HillProfile, view: SceneView) {
  const pole = color("post");
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const headW = FLOODLIGHT_LAMPS + 2;
  const first = firstMastXM(h);
  const [from, to] = farRange(view, headW + FLOODLIGHT_RAY_PX);
  const start = first + Math.max(0, Math.ceil((from - first) / FLOODLIGHT.mastSpacingM)) * FLOODLIGHT.mastSpacingM;
  for (let x = start; x <= to; x += FLOODLIGHT.mastSpacingM) {
    const [sx, ground] = onLayer(view, LAYER.farEdge, x, landingYM(h, x));
    const top = ground - FAR_FENCE_ROWS - MAST_HEIGHT_PX;
    fb.rect(sx, top, 1, MAST_HEIGHT_PX, pole);
    drawSoftGlow(fb, sx, top - 3, FLOODLIGHT_GLOW, glow);
    const left = sx - (headW >> 1);
    // The frame, the lamps in its upper row.
    fb.rect(left, top - 3, headW, 3, pole);
    fb.rect(left + 1, top - 3, FLOODLIGHT_LAMPS, 1, lamp);
    fb.rect(left - FLOODLIGHT_RAY_PX, top - 3, FLOODLIGHT_RAY_PX, 1, glow);
    fb.rect(left + headW, top - 3, FLOODLIGHT_RAY_PX, 1, glow);
    fb.rect(left + 1, top - 4, FLOODLIGHT_LAMPS, 1, glow);
  }
}

/**
 * A light glow around (cx, cy): pixels within the radius move towards `colour`, by the strength at the centre and
 * fading with the square of the distance; what is drawn shows through.
 */
function drawSoftGlow(
  fb: FrameBuffer,
  cx: number,
  cy: number,
  glow: { radius: number; strength: number },
  colour: number,
): void {
  const px = fb.pixels;
  const { radius, strength } = glow;
  for (let y = Math.max(0, cy - radius); y <= Math.min(fb.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(fb.width - 1, cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      const k = strength * (1 - d) * (1 - d);
      const i = y * fb.width + x;
      const c = px[i] ?? 0;
      const mix = (shift: number) => {
        const a = (c >>> shift) & 0xff;
        return Math.round(a + (((colour >>> shift) & 0xff) - a) * k) << shift;
      };
      px[i] = (0xff000000 | mix(0) | mix(8) | mix(16)) >>> 0;
    }
  }
}

/** Lamps on short posts along the inrun's far rail, every 8 m from the start, each with a small glow. */
export function drawInrunLamps(fb: FrameBuffer, h: HillProfile, view: SceneView, railPx: number) {
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const pole = color("post");
  for (let x = h.startXM; x < h.takeoffXM; x += INRUN_LAMP_SPACING_M) {
    const [sx, track] = onLayer(view, LAYER.inrunFar, x, inrunYM(h, x));
    if (sx < -2 || sx >= fb.width + 2) continue;
    const top = track - railPx - INRUN_LAMP_POST_PX;
    fb.rect(sx, top, 1, INRUN_LAMP_POST_PX, pole);
    drawSoftGlow(fb, sx, top - 1, INRUN_LAMP_GLOW, glow);
    fb.rect(sx - 1, top - 1, 2, 1, lamp);
    fb.put(sx - 1, top - 2, glow);
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

/** Where the moon stands for a hill and a picture: its column in the sky's own columns, as the stars', and its row. */
interface MoonPlace {
  skyColumn: number;
  row: number;
}

const moonPlaces = new WeakMap<HillProfile, WeakMap<HillLook, Map<string, MoonPlace>>>();

/**
 * The moon's place for a whole jump: chosen once, for the camera at the start, where the sky shows most: near its
 * usual place, or where the most sky shows above the mountains. It then keeps to the sky as the stars do, and the
 * mountains, rising in the picture as the camera goes down, pass in front of it.
 */
function moonPlace(h: HillProfile, look: HillLook, view: SceneView, rows: number): MoonPlace {
  let byLook = moonPlaces.get(h);
  if (byLook === undefined) {
    byLook = new WeakMap();
    moonPlaces.set(h, byLook);
  }
  let byPicture = byLook.get(look);
  if (byPicture === undefined) {
    byPicture = new Map();
    byLook.set(look, byPicture);
  }
  const key = `${view.widthPx}:${view.pixelWidth}:${rows}`;
  const known = byPicture.get(key);
  if (known !== undefined) return known;
  const width = view.widthPx;
  const atStart = sceneView(h.startXM, inrunYM(h, h.startXM), width, view.pixelWidth);
  const skyAt = skyRowsAbove(h, look, atStart, rows - 1);
  const clearUnder = (cx: number) => {
    let clear = rows;
    for (let x = Math.max(0, cx - MOON_RADIUS_PX); x <= Math.min(width - 1, cx + MOON_RADIUS_PX); x++) {
      clear = Math.min(clear, skyAt(x));
    }
    return clear;
  };
  let cx = Math.round(width * MOON_ACROSS);
  let clear = clearUnder(cx);
  for (let x = Math.round(width * MOON_FROM); x <= Math.round(width * MOON_TO) && clear < MOON_ROOM_PX; x++) {
    const here = clearUnder(x);
    if (here > clear) {
      cx = x;
      clear = here;
    }
  }
  // With little sky it rises from behind the mountains, its top showing.
  const row = Math.max(
    MOON_LOWEST_TOP_PX + MOON_RADIUS_PX,
    Math.min(MOON_ROW, clear - MOON_RADIUS_PX - MOON_CLEARANCE_PX),
  );
  const place = { skyColumn: cx + Math.round(atStart.camX * STAR_DRIFT), row };
  byPicture.set(key, place);
  return place;
}

/**
 * Stars and the moon, drawn over the sky's rows (0..`skyRows` - 1) after the mountains and before the background,
 * only where the sky still shows: the mountains stand in front of them.
 */
export function drawNightSky(
  c: SceneCanvas,
  h: HillProfile,
  look: HillLook,
  view: SceneView,
  frame: number,
  skyRows: number,
): void {
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
  const place = moonPlace(h, look, view, rows);
  const cx = place.skyColumn - drift;
  const cy = place.row;
  for (let dy = -MOON_RADIUS_PX; dy <= MOON_RADIUS_PX; dy++) {
    for (let dx = -MOON_RADIUS_PX; dx <= MOON_RADIUS_PX; dx++) {
      // Within half a pixel of the radius, so the disc is round rather than a square with its corners cut.
      if (dx * dx + dy * dy > MOON_RADIUS_PX * (MOON_RADIUS_PX + 1)) continue;
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
/**
 * The layer of the background the birds fly in: they keep their height over the top of the inrun, so the
 * picture leaves them behind as the camera follows the jumper down.
 */
const BIRD_LAYER = 7;

/** A few birds crossing high above the background, beating their wings in bursts and gliding between them. */
export function drawBirds(fb: FrameBuffer, h: HillProfile, view: SceneView, frame: number) {
  const span = fb.width + 60;
  const origin = view.camX * 0.05;
  // Rows the picture has moved since the jumper stood at the start, in the birds' layer.
  const atStart = sceneView(h.startXM, inrunYM(h, h.startXM), view.widthPx, view.pixelWidth);
  const drop = layerOffset(view, BIRD_LAYER).y - layerOffset(atStart, BIRD_LAYER).y;
  const wing = color("bird");
  const body = color("birdBody");
  for (let i = 0; i < BIRD_COUNT; i++) {
    const far = i % 2 === 1;
    const worldX = frame * (far ? 0.09 : 0.14 + i * 0.02) + i * 131;
    const sx = Math.round((((worldX - origin) % span) + span) % span) - 30;
    const sy = Math.round(12 + i * 6 + 2 * Math.sin(frame / 37 + i * 2)) + drop;
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
