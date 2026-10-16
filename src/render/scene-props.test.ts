import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { inrunYM, landingYM, type HillProfile } from "../sim/hill-profile";
import { FrameBuffer } from "./frame-buffer";
import { DEFAULT_HILL_LOOK } from "./hill-look";
import { hillLayerTables, rowsAt, type LayerTable } from "./hill-layer-tables";
import { color } from "./palette";
import { drawBirds, drawFloodlights, drawInrunLamps, drawWindSocks } from "./scene-extras";
import { firstMastXM } from "./scene-floodlight";
import { distanceLineEnds } from "./scene-hill";
import { inrunLook } from "./scene-inrun";
import { LAYER, layerIndex, layerOffset, originalColumn, sceneView, viewColumn, type SceneView } from "./scene-layers";
import { landingXAtArcLength } from "./scene-lines";

const hill = OWN_HILLS[0];
const WIDTH_PX = 432;
const SQUARE = 6 / 5;
/** Each test draws hundreds of frames of props: seconds on a loaded machine, past vitest's default of 5 s. */
const PROPS_TIMEOUT_MS = 30_000;

function choice(): NonNullable<typeof hill> {
  if (!hill) throw new Error("no hill");
  return hill;
}

function profile(): HillProfile {
  return choice().profile;
}

/** Views for the camera following the landing hill from `fromM` to `toM` in steps of 0.05 m. */
function landingViews(h: HillProfile, fromM: number, toM: number): SceneView[] {
  const views: SceneView[] = [];
  for (let x = fromM; x <= toM; x += 0.05) views.push(sceneView(x, landingYM(h, x) + 2, WIDTH_PX, SQUARE));
  return views;
}

/** The lowest row of the longest run of `c` at least `min` rows long in column `x`, or -1. */
function runFoot(fb: FrameBuffer, x: number, c: number, min: number): number {
  let best = 0;
  let foot = -1;
  let run = 0;
  for (let y = 0; y < fb.height; y++) {
    run = fb.pixels[y * fb.width + x] === c ? run + 1 : 0;
    if (run >= min && run >= best) {
      best = run;
      foot = y;
    }
  }
  return foot;
}

/**
 * For a prop at world x drawn on a layer, the rows between its foot and the top of what is drawn under its column
 * (the table's row there less `above`), one entry per view in which it shows.
 */
function footGaps(
  views: readonly SceneView[],
  draw: (fb: FrameBuffer, view: SceneView) => void,
  footAt: (fb: FrameBuffer, sx: number) => number,
  layer: number,
  table: LayerTable,
  xM: number,
  above: number,
): number[] {
  const gaps: number[] = [];
  for (const view of views) {
    const fb = new FrameBuffer(WIDTH_PX, 200);
    draw(fb, view);
    const off = layerOffset(view, layer);
    const guess = viewColumn(view, layerIndex(layer, xM) - off.x);
    const sx = [guess - 1, guess, guess + 1, guess - 2, guess + 2].find(
      // A foot cut off by the bottom of the picture is not where it stands.
      (x) => x >= 0 && x < WIDTH_PX && footAt(fb, x) >= 0 && footAt(fb, x) < fb.height - 1,
    );
    if (sx === undefined) continue;
    gaps.push(rowsAt(table, off.x + originalColumn(view, sx)) + off.y - above - footAt(fb, sx));
  }
  return gaps;
}

describe("props on the far fence and the inrun's rail", { timeout: PROPS_TIMEOUT_MS }, () => {
  it("wind socks stand on the fence top under their pole in every frame as the picture scrolls", () => {
    const h = profile();
    const state = startTrainingJump(choice(), 3).state;
    const table = hillLayerTables(h).farEdge;
    const sockXM = h.takeoffXM + 15 + 25 * 2;
    const gaps = footGaps(
      landingViews(h, sockXM - 20, sockXM + 5),
      (fb, view) => drawWindSocks(fb, h, view, state, 0),
      (fb, sx) => runFoot(fb, sx, color("post"), 10),
      LAYER.farEdge,
      table,
      sockXM,
      5,
    );
    expect(gaps.length).toBeGreaterThan(100);
    expect([...new Set(gaps)]).toEqual([1]);
  });

  it("floodlight masts stand on the fence top under their mast in every frame", () => {
    const h = profile();
    const table = hillLayerTables(h).farEdge;
    const gaps = [0, 1, 2, 3].flatMap((k) => {
      const mastXM = firstMastXM(h) + 30 * k;
      return footGaps(
        landingViews(h, mastXM - 50, mastXM + 5),
        (fb, view) => drawFloodlights(fb, h, view),
        (fb, sx) => runFoot(fb, sx, color("post"), 40),
        LAYER.farEdge,
        table,
        mastXM,
        5,
      );
    });
    expect(gaps.length).toBeGreaterThan(100);
    expect([...new Set(gaps)]).toEqual([1]);
  });

  it("inrun lamps stand on the far rail under their post in every frame", () => {
    const h = profile();
    const rail = inrunLook(DEFAULT_HILL_LOOK).farWallUpPx;
    const table = hillLayerTables(h).inrunFar;
    const lampXM = h.startXM + 16;
    const views: SceneView[] = [];
    for (let x = h.startXM; x <= lampXM + 10; x += 0.05) views.push(sceneView(x, inrunYM(h, x), WIDTH_PX, SQUARE));
    const lamp = color("lampLight");
    // The lamp's light sits on the post's top row and the column left of it; the post is 3 rows under it.
    const footAt = (fb: FrameBuffer, sx: number) => {
      const y = runFoot(fb, sx, lamp, 1);
      return y >= 0 && fb.pixels[y * WIDTH_PX + sx - 1] === lamp ? y + 3 : -1;
    };
    const gaps = footGaps(
      views,
      (fb, view) => drawInrunLamps(fb, h, view, rail),
      footAt,
      LAYER.inrunFar,
      table,
      lampXM,
      rail,
    );
    expect(gaps.length).toBeGreaterThan(100);
    expect([...new Set(gaps)]).toEqual([1]);
  });
});

describe("the distance lines", { timeout: PROPS_TIMEOUT_MS }, () => {
  it("keep their far and near ends at the same rows against the hill's edges as the picture scrolls", () => {
    const h = profile();
    const t = hillLayerTables(h);
    const distanceM = choice().kPointM + 0.15;
    const xM = landingXAtArcLength(h, h.takeoffXM, distanceM, 1);
    const farGaps = new Set<number>();
    const nearGaps = new Set<number>();
    for (const view of landingViews(h, xM - 25, xM + 5)) {
      const [x0, y0, x1, y1] = distanceLineEnds(h, view, distanceM);
      const far = layerOffset(view, LAYER.farEdge);
      const near = layerOffset(view, LAYER.nearEdge);
      farGaps.add(rowsAt(t.farEdge, far.x + originalColumn(view, x0)) + far.y - y0);
      nearGaps.add(rowsAt(t.nearEdge, near.x + originalColumn(view, x1)) + near.y - y1);
    }
    expect([farGaps.size, nearGaps.size]).toEqual([1, 1]);
  });
});

/** The birds' pixels in a picture `width` wide, as (x, y) pairs. */
const birdPixels = (h: HillProfile, view: SceneView, width: number, frame = 0) => {
  const fb = new FrameBuffer(width, 200);
  drawBirds(fb, h, view, frame);
  const found: [number, number][] = [];
  fb.pixels.forEach((p, i) => {
    if (p !== 0) found.push([i % width, Math.floor(i / width)]);
  });
  return found;
};

/** Mean column of pixels given as (x, y) pairs. */
const meanX = (ps: [number, number][]) => ps.reduce((sum, [x]) => sum + x, 0) / ps.length;

describe("the birds", { timeout: PROPS_TIMEOUT_MS }, () => {
  it("move across the picture with the layer they fly in", () => {
    const h = profile();
    const y = inrunYM(h, h.startXM);
    const before = sceneView(h.startXM, y, WIDTH_PX, SQUARE);
    const after = sceneView(h.startXM + 2, y, WIDTH_PX, SQUARE);
    // A frame in which no bird is cut by an edge of the picture at either camera.
    const frame = Array.from({ length: 400 }, (_, f) => f).find(
      (f) => birdPixels(h, before, WIDTH_PX, f).length === birdPixels(h, after, WIDTH_PX, f).length,
    );
    if (frame === undefined) throw new Error("every frame cuts a bird at an edge");
    const a = birdPixels(h, before, WIDTH_PX, frame);
    const b = birdPixels(h, after, WIDTH_PX, frame);
    const scroll = -(layerOffset(after, 7).x - layerOffset(before, 7).x) / SQUARE;
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    expect(Math.abs(meanX(b) - meanX(a) - scroll)).toBeLessThanOrEqual(1);
  });

  it("keep their places against the scenery whatever the picture's width", () => {
    const h = profile();
    const y = inrunYM(h, h.startXM);
    const narrow = 356;
    const shift = (WIDTH_PX - narrow) / 2;
    const wide = birdPixels(h, sceneView(h.startXM, y, WIDTH_PX, SQUARE), WIDTH_PX)
      .filter(([x]) => x >= shift && x < shift + narrow)
      .map(([x, row]) => [x - shift, row]);
    expect(birdPixels(h, sceneView(h.startXM, y, narrow, SQUARE), narrow)).toEqual(wide);
  });
});
