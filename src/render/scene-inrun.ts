import { inrunYM, type HillProfile } from "../sim/hill-profile";
import { roundHalfEven } from "../sim/pascal-numeric";
import { colourAt, hillLayerTables, rowsAt, type LayerTable } from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { LAYER, LAYER_SCALE, layerIndex, layerOffset, originalColumn, type SceneView } from "./scene-layers";
import { gatePlace } from "./scene-anchor";
import { colourSpan, darkenSnow, putIndex, type SceneCanvas } from "./scene-span";

/**
 * The inrun as the original draws it (0baf:344c): a trough between its far side (layer 19) and its near side
 * (layer 21), the jumper riding in the middle (layer 20). Column by column: the far rail above the track, the track
 * from the far side to the near one, the start platform up to the end of the flat part with its back face, the
 * end of the track at the takeoff with its front face; later, in front of the jumper, the near wall.
 */

/** What a hill's inrun looks like (from its definition in the original). */
export interface InrunLook {
  /** Back of the start platform (DS:45C2), in metres. */
  platformStartXM: number;
  /** Rows of the near wall above and below the track, and of the far rail above it and the takeoff face below. */
  nearWallUpPx: number;
  nearWallDownPx: number;
  farWallUpPx: number;
  farWallDownPx: number;
  /** Palette index of the walls' darkest shade (DS:45E6). */
  wallColour: number;
  /** Palette index of the start gate's far half (DS:45E7); the near half is the next index. */
  gateColour: number;
}

/**
 * The inrun of a hill as drawn: the far side's rail and face are the near side's scaled to its layer
 * (1eee:051f: round(px * p19 / p21)).
 */
export function inrunLook(look: HillLook): InrunLook {
  const ratio = (LAYER_SCALE[LAYER.inrunFar] ?? 1) / (LAYER_SCALE[LAYER.inrunNear] ?? 1);
  const i = look.inrun;
  return {
    platformStartXM: i.platformStartXM,
    nearWallUpPx: i.nearWallUpPx,
    nearWallDownPx: i.nearWallDownPx,
    farWallUpPx: roundHalfEven(i.nearWallUpPx * ratio),
    farWallDownPx: roundHalfEven(i.nearWallDownPx * ratio),
    wallColour: i.wallColour,
    gateColour: i.gateColour,
  };
}

/** Snow and the track are darkened where the indices are at most this (the grey and blue snow ramp). */
const SNOW_INDEX_LIMIT = 0x40;
/** The gate bar is drawn this many rows above the track. */
const GATE_ABOVE_TRACK_PX = 5;

interface Side {
  table: LayerTable;
  off: { x: number; y: number };
  /** Table indices of the platform's back, the end of the flat part and the takeoff. */
  start: number;
  flatEnd: number;
  takeoff: number;
}

function side(h: HillProfile, look: InrunLook, view: SceneView, layer: number, table: LayerTable): Side {
  return {
    table,
    off: layerOffset(view, layer),
    start: layerIndex(layer, look.platformStartXM),
    flatEnd: layerIndex(layer, h.inrunFlatEndXM),
    takeoff: layerIndex(layer, h.takeoffXM),
  };
}

/** Row of table index `j` on a side. */
const rowOf = (s: Side, j: number) => rowsAt(s.table, j) + s.off.y;
/** Screen column (in the original's columns) of table index `j` on a side. */
const columnOf = (s: Side, j: number) => j - s.off.x;

/**
 * Where an edge across the trough at table indices `jf` (far) and `jn` (near) is, at near index `cn`: the share
 * of the way from its near end and the row there.
 */
function edgeAt(far: Side, near: Side, jf: number, jn: number, cn: number): { t: number; y: number } {
  const t = (cn - jn) / (columnOf(far, jf) - columnOf(near, jn));
  return { t, y: rowOf(near, jn) + (rowOf(far, jf) - rowOf(near, jn)) * t };
}

/** Everything of the inrun behind the jumper (steps 15 and 16 of the original's scene, without the supports). */
export function drawInrunBehind(c: SceneCanvas, h: HillProfile, look: InrunLook, view: SceneView, pal: Uint32Array) {
  const t = hillLayerTables(h);
  const far = side(h, look, view, LAYER.inrunFar, t.inrunFar);
  const near = side(h, look, view, LAYER.inrunNear, t.inrunNear);
  const B = look.wallColour;
  const farColour = (j: number) => colourAt(far.table, j);
  const nearColour = (j: number) => colourAt(near.table, j);
  for (let sx = 0; sx < c.fb.width; sx++) {
    const column = originalColumn(view, sx);
    const cf = far.off.x + column;
    const cn = near.off.x + column;
    const pf = rowOf(far, cf);
    const pn = rowOf(near, cn);
    // A: the far rail above the track.
    if (cf >= far.start && cf <= far.takeoff)
      colourSpan(c, pal, sx, pf - look.farWallUpPx, pf, (B + 4) << 8, (B + 1) << 8);
    // B: the track.
    if (cf <= far.takeoff && cn <= near.takeoff && cf >= far.flatEnd && cn >= near.flatEnd) {
      colourSpan(c, pal, sx, pf, pn, farColour(cf), nearColour(cn));
    }
    // C: the platform, up to the end of the flat part on the far side.
    if (cf >= far.start && cf <= far.flatEnd) colourSpan(c, pal, sx, pf, pn, farColour(cf), nearColour(near.start));
    // D: the edge where the platform meets the track, the track below it.
    if (cf <= far.takeoff && cn <= near.takeoff && cf <= far.flatEnd && cn > near.flatEnd) {
      const e = edgeAt(far, near, far.flatEnd, near.flatEnd, cn);
      colourSpan(c, pal, sx, roundHalfEven(e.y), pn, farColour(far.flatEnd + 2), nearColour(cn + 4));
    }
    // E: the back of the platform: its top edge, the platform below it and its back face above it.
    if (cf <= far.takeoff && cn <= near.takeoff && cf <= far.start && cn > near.start) {
      const e = edgeAt(far, near, far.start, near.start, cn);
      const y = e.y - 1;
      colourSpan(c, pal, sx, roundHalfEven(y), pn, farColour(far.start), nearColour(cn));
      const wall = look.nearWallUpPx - (look.nearWallUpPx - look.farWallUpPx) * e.t;
      colourSpan(c, pal, sx, roundHalfEven(y - wall) + 1, roundHalfEven(y), (B + 3) << 8, B << 8);
    }
    // F: past the takeoff on the far side: the end of the track under its edge.
    if (cf > far.takeoff && cn <= near.takeoff && cf >= far.start && cn >= near.start) {
      const rise = Math.trunc(
        ((cn - near.takeoff) * (rowOf(far, far.takeoff) - rowOf(near, near.takeoff))) /
          (columnOf(far, far.takeoff) - columnOf(near, near.takeoff)),
      );
      colourSpan(c, pal, sx, rowOf(near, near.takeoff) - 1 + rise, pn, farColour(far.takeoff), nearColour(cn));
    }
    // G: past the takeoff on the near side: the track down to the edge, the takeoff's front face below it.
    if (cf <= far.takeoff && cn > near.takeoff && cf >= far.start && cn >= near.start) {
      const e = edgeAt(far, near, far.takeoff, near.takeoff, cn);
      colourSpan(c, pal, sx, pf, roundHalfEven(e.y), farColour(cf), nearColour(near.takeoff));
      const face = look.nearWallDownPx - (look.nearWallDownPx - look.farWallDownPx) * e.t;
      colourSpan(c, pal, sx, roundHalfEven(e.y), roundHalfEven(e.y + face), (B + 5) << 8, (B + 1) << 8);
    }
  }
}

/** Ski tracks: two grooves along the jumper's line, darkening the snow two rows above and two below it. */
export function drawSkiTracks(c: SceneCanvas, h: HillProfile, view: SceneView, pal: Uint32Array) {
  const t = hillLayerTables(h);
  const off = layerOffset(view, LAYER.jumper);
  const first = layerIndex(LAYER.jumper, h.inrunFlatEndXM) - 1;
  const last = layerIndex(LAYER.jumper, h.takeoffXM) + 1;
  for (let sx = 0; sx < c.fb.width; sx++) {
    const j = off.x + originalColumn(view, sx);
    if (j > last - 2 || j < first) continue;
    const y = rowsAt(t.inrunJumper, j) + off.y;
    if (y <= -3 || y >= 0xbd) continue;
    if (j > first + 1) {
      darkenSnow(c, pal, sx, y - 2, 5, SNOW_INDEX_LIMIT);
      darkenSnow(c, pal, sx, y - 1, 4, SNOW_INDEX_LIMIT);
    }
    darkenSnow(c, pal, sx, y + 1, 5, SNOW_INDEX_LIMIT);
    darkenSnow(c, pal, sx, y + 2, 4, SNOW_INDEX_LIMIT);
  }
}

/** A point of the start gate on a layer: above the track at the start position. */
function gatePoint(h: HillProfile, view: SceneView, layer: number): [number, number] {
  const [sx, row] = gatePlace(view, layer, h.startXM, inrunYM(h, h.startXM));
  return [sx, row - GATE_ABOVE_TRACK_PX];
}

/** A one-pixel line in a palette index (the original's 1f8b:00dc with width 1). */
function thinLine(c: SceneCanvas, pal: Uint32Array, a: [number, number], b: [number, number], index: number) {
  let [x0, y0] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    putIndex(c, pal, x0, y0, index);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Far half of the start gate's bar, behind the jumper. */
export function drawGateFar(c: SceneCanvas, h: HillProfile, look: InrunLook, view: SceneView, pal: Uint32Array) {
  thinLine(c, pal, gatePoint(h, view, LAYER.inrunFar), gatePoint(h, view, LAYER.jumper), look.gateColour);
}

/** Near half of the start gate's bar, in front of the jumper. */
export function drawGateNear(c: SceneCanvas, h: HillProfile, look: InrunLook, view: SceneView, pal: Uint32Array) {
  thinLine(c, pal, gatePoint(h, view, LAYER.jumper), gatePoint(h, view, LAYER.inrunNear), look.gateColour + 1);
}

/** The near wall of the trough, in front of the jumper. */
export function drawInrunNearWall(c: SceneCanvas, h: HillProfile, look: InrunLook, view: SceneView, pal: Uint32Array) {
  const t = hillLayerTables(h);
  const near = side(h, look, view, LAYER.inrunNear, t.inrunNear);
  const B = look.wallColour;
  for (let sx = 0; sx < c.fb.width; sx++) {
    const cn = near.off.x + originalColumn(view, sx);
    if (cn > near.takeoff || cn < near.start) continue;
    const y = rowOf(near, cn);
    colourSpan(c, pal, sx, y - look.nearWallUpPx, y + look.nearWallDownPx, (B + 6) << 8, (B + 1) << 8);
  }
}

/** How much lower the ground under a support's far side is drawn: its row times 1 - 0.2484 t (the original's). */
const SUPPORT_FAR_DROP = 0.2484;
/** A support's front shades from its side colour + 3 to its front colour + 3. */
const SUPPORT_FRONT_SHADE = 3;
const SUPPORT_SIDE_SHADES = 4;

/**
 * Supports under the inrun (records of 1eee:0437): boxes from the inrun's underside to the ground, their sides
 * seen in perspective between the far and near layers, their fronts on the near layer. All left sides first, then
 * all right sides, then all fronts, as the original draws them.
 */
export function drawInrunSupports(
  c: SceneCanvas,
  h: HillProfile,
  look: HillLook,
  view: SceneView,
  pal: Uint32Array,
): void {
  const t = hillLayerTables(h);
  const walls = inrunLook(look);
  const far = side(h, walls, view, LAYER.inrunFar, t.inrunFar);
  const near = side(h, walls, view, LAYER.inrunNear, t.inrunNear);
  const ground = (j: number) => rowsAt(t.groundNear, j) + near.off.y;
  const boxes = look.supports.map((s) => ({
    a19: layerIndex(LAYER.inrunFar, s.fromXM),
    b19: layerIndex(LAYER.inrunFar, s.toXM),
    a21: layerIndex(LAYER.inrunNear, s.fromXM),
    b21: layerIndex(LAYER.inrunNear, s.toXM),
    colour: s.colour,
    front: s.frontColour,
  }));
  const sideFace = (sx: number, cn: number, jf: number, jn: number, colour: number) => {
    const e = edgeAt(far, near, jf, jn, cn);
    const bottom = roundHalfEven(ground(jn) * (1 - SUPPORT_FAR_DROP * e.t));
    colourSpan(c, pal, sx, roundHalfEven(e.y), bottom, colour << 8, (colour + SUPPORT_SIDE_SHADES) << 8);
  };
  for (let sx = 0; sx < c.fb.width; sx++) {
    const column = originalColumn(view, sx);
    const cf = far.off.x + column;
    const cn = near.off.x + column;
    for (const b of boxes) if (cf >= b.a19 && cn < b.a21) sideFace(sx, cn, b.a19, b.a21, b.colour);
    for (const b of boxes) if (cf <= b.b19 && cn > b.b21) sideFace(sx, cn, b.b19, b.b21, b.colour);
    for (const b of boxes) {
      if (cn < b.a21 || cn > b.b21) continue;
      // A support narrower than one table index has a single shade.
      const across = b.b21 > b.a21 ? Math.trunc(((b.front - b.colour) * (cn - b.a21)) / (b.b21 - b.a21)) : 0;
      const shade = across + b.colour + SUPPORT_FRONT_SHADE;
      colourSpan(c, pal, sx, rowOf(near, cn) + look.inrun.nearWallDownPx, ground(cn), shade << 8, shade << 8);
    }
  }
}
