import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readOriginalHills, type OriginalHill } from "../original/original-hills";
import { inrunYM, landingYM } from "../sim/hill-profile";
import { TRACE_POINT, readTrace } from "../sim/test-support/dsj-trace";
import { hillGoldenFiles } from "../sim/test-support/golden-files";
import { backgroundBaseM, backgroundWaves } from "./scene-backdrop";
import { distanceLines } from "./scene-hill";
import { inrunLook } from "./scene-inrun";
import { LAYER, LAYER_SCALE, layerIndex, layerRows } from "./scene-layers";
import { landingXAtArcLength } from "./scene-lines";
import { sceneDac } from "./scene-palette";
import { KEY_LAYERS, placeTrees } from "./scene-trees";

/**
 * The scenery of every hill against the state the original sets up for it (hills.hilltrace: the data segment
 * after the hill setup 0baf:631c): palette, background waves, marks, fences, inrun ranges, supports, start gate
 * and trees. Skipped without the files of the original game.
 */

const golden = hillGoldenFiles();
const tracePath = golden.hillTrace;
const exePath = golden.exe;
const missing = tracePath === undefined || exePath === undefined;

const PALETTE = 0x498a;
const WAVES = 0x3e2a;
const BACKGROUND_BASE = 0x464e;
const LINES = 0x3c3d;
const LINE_BYTES = 0x11;
const MARK_COUNT = 0x464a;
const FAR_FENCE_START = 0x3e5e;
const NEAR_FENCE_START = 0x3e62;
const SUPPORTS = 0x2934;
const GATE = 0x2926;
const OBJECTS = 0x2b7a;
const OBJECT_COUNT = 0x2c22;
const LAYER_BYTES = 0xa4;
const SPRITES = 0x3b82;
const WALL_FAR_UP = 0x45e2;
const WALL_FAR_DOWN = 0x45e4;
/** x of a tree the hill's code took out of sight. */
const HIDDEN_X = -200;

function check(hill: OriginalHill, v: DataView): string[] {
  const bad: string[] = [];
  const expectEqual = (what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      bad.push(`${what}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  };
  const h = hill.profile;
  const look = hill.look;
  if (look === null) return ["its look could not be read"];
  const long = (a: number) => v.getInt32(a, true);
  expectEqual(
    "palette",
    Array.from(sceneDac(look.skyRgb6)),
    Array.from({ length: 768 }, (_, i) => v.getUint8(PALETTE + i)),
  );
  backgroundWaves(look.terrain.seed, look.terrain.amplitudeM).forEach((set, i) =>
    set.forEach((w, k) => {
      const at = WAVES + 0x30 * (i + 1) + 0xc * (k + 1);
      expectEqual(
        `wave ${i + 1},${k + 1}`,
        [w.amplitude, w.phase, w.frequency],
        [v.getFloat32(at, true), v.getFloat32(at + 4, true), v.getFloat32(at + 8, true)],
      );
    }),
  );
  expectEqual("background base", backgroundBaseM(h, look.terrain.baseOverOutrunM), v.getInt16(BACKGROUND_BASE, true));
  const lines = distanceLines({ kPointM: hill.kPointM, ...look.marks }, 0);
  expectEqual("mark count", look.marks.markCount, v.getInt16(MARK_COUNT, true));
  // The record line is set before each jump, not by the hill setup.
  lines.slice(0, -1).forEach((line, k) => {
    const x = landingXAtArcLength(h, h.takeoffXM, line.distanceM, 1);
    const at = LINES + LINE_BYTES * (k + 1);
    expectEqual(
      `line ${k + 1}`,
      [
        layerIndex(LAYER.farEdge, x),
        layerRows(LAYER.farEdge, landingYM(h, x)),
        layerIndex(LAYER.nearEdge, x),
        layerRows(LAYER.nearEdge, landingYM(h, x)),
        line.colour,
      ],
      [long(at), long(at + 4), long(at + 8), long(at + 12), v.getUint8(at + 16)],
    );
  });
  const fenceX = 1 + h.takeoffXM + look.marks.fenceStartM;
  expectEqual(
    "fence starts",
    [layerIndex(LAYER.farEdge, fenceX), layerIndex(LAYER.nearEdge, fenceX)],
    [long(FAR_FENCE_START), long(NEAR_FENCE_START)],
  );
  const walls = inrunLook(look);
  expectEqual(
    "far walls",
    [walls.farWallUpPx, walls.farWallDownPx],
    [v.getInt16(WALL_FAR_UP, true), v.getInt16(WALL_FAR_DOWN, true)],
  );
  look.supports.forEach((s, k) => {
    const at = SUPPORTS + 10 * (k + 1);
    expectEqual(
      `support ${k + 1}`,
      [
        layerIndex(LAYER.inrunFar, s.fromXM),
        layerIndex(LAYER.inrunFar, s.toXM),
        layerIndex(LAYER.inrunNear, s.fromXM),
        layerIndex(LAYER.inrunNear, s.toXM),
        s.colour,
        s.frontColour,
      ],
      [
        v.getInt16(at, true),
        v.getInt16(at + 2, true),
        v.getInt16(at + 4, true),
        v.getInt16(at + 6, true),
        v.getUint8(at + 8),
        v.getUint8(at + 9),
      ],
    );
  });
  [LAYER.inrunFar, LAYER.jumper, LAYER.inrunNear].forEach((layer, k) => {
    const at = GATE + 8 * k;
    expectEqual(
      `gate ${layer}`,
      [layerIndex(layer, h.startXM), layerRows(layer, inrunYM(h, h.startXM))],
      [long(at), long(at + 4)],
    );
  });
  const sprite = new Map<number, string>();
  for (let k = 1; k <= 22; k++) {
    sprite.set(v.getUint32(SPRITES + 4 * k, true), k <= 11 ? `spruce ${13 - k}` : `pine ${24 - k}`);
  }
  const trees = placeTrees(h, look);
  // The original reads the ground of a tree from tables that start at x = -160 / (14 p); a tree further left gets
  // whatever lies before the table, so only trees whose key layers are inside their tables are compared.
  const inside = (t: (typeof trees)[number]) => {
    const below = KEY_LAYERS.toReversed().find((k) => k <= t.layer) ?? 1;
    const above = KEY_LAYERS.find((k) => k > t.layer) ?? 17;
    return [below, above].every((k) => Math.round(t.xM * 14 * (LAYER_SCALE[k] ?? 1) + 160) >= 1);
  };
  for (let layer = 1; layer <= 20; layer++) {
    const count = long(OBJECT_COUNT + layer * LAYER_BYTES);
    const theirs = Array.from({ length: count }, (_, k) => {
      const at = OBJECTS + layer * LAYER_BYTES + 8 * (k + 1);
      return [sprite.get(v.getUint32(at, true)), v.getInt16(at + 4, true), v.getInt16(at + 6, true)];
    }).filter((r) => r[1] !== HIDDEN_X);
    const ours = trees.filter((t) => t.layer === layer);
    expectEqual(
      `trees of layer ${layer}`,
      ours.map((t) => [`${t.kind} ${t.size}`, t.j, inside(t) ? t.rows : "outside"]),
      theirs.map((r, k) => [r[0], r[1], ours[k] !== undefined && !inside(ours[k]) ? "outside" : r[2]]),
    );
  }
  return bad;
}

describe.skipIf(!golden.requested)("the scenery of every hill against the original's setup", () => {
  it.skipIf(missing)("palette, background, marks, fences, inrun, supports, gate and trees match", () => {
    const hills = readOriginalHills(new Uint8Array(readFileSync(exePath ?? "")));
    const snaps = readTrace(tracePath ?? "").filter((s) => s.point === TRACE_POINT.hillSetup);
    expect(snaps.length).toBe(37);
    const failures: string[] = [];
    for (const snap of snaps) {
      const hill = hills.find((h) => h.number === snap.frame);
      if (hill === undefined) {
        failures.push(`hill ${snap.frame}: not read`);
        continue;
      }
      for (const b of check(hill, snap.view).slice(0, 4)) failures.push(`hill ${snap.frame}: ${b}`);
    }
    expect(failures).toEqual([]);
  });
});
