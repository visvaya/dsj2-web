import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { landingYM, type HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { hillLayerTables, rowsAt, type LayerTable } from "./hill-layer-tables";
import { DEFAULT_HILL_LOOK } from "./hill-look";
import { SKY_ROWS } from "./jump-view";
import { drawWindBox } from "./jump-view-hud";
import { layerScroll, onSurface, onSurfaceAtHeight, skyDrift, type ScreenPoint } from "./scene-anchor";
import { BIRD_LAYER, birdFlightPx, birdPlaces, moonInPicture } from "./scene-extras";
import { firstMastXM } from "./scene-floodlight";
import {
  LAYER,
  SQUARE_PIXEL_WIDTH,
  layerIndex,
  layerOffset,
  originalColumn,
  sceneView,
  type SceneView,
} from "./scene-layers";
import { landingXAtArcLength } from "./scene-lines";
import { VIEW_MAX_WIDTH_PX } from "./view-size";

/**
 * Motion invariants of the jump picture over a whole jump: every thing of the world placed through
 * `scene-anchor.ts` stays on the surface it stands on, moves exactly as its layer scrolls (sky things only with
 * the stars' drift, the interface not at all), never turns back while the camera goes one way, and keeps its
 * place against the scenery whatever the picture's width. Placement is computed, not scraped from pixels.
 */

/** A whole jump is a few hundred frames; on a loaded machine the jump and the checks take a few seconds. */
const MOTION_TIMEOUT_MS = 60_000;
/** Every second frame of the jump is checked. */
const FRAME_STEP = 2;

const hill = OWN_HILLS[0];

function choice(): NonNullable<typeof hill> {
  if (!hill) throw new Error("no hill");
  return hill;
}

/** A bot's jump with a landing, frame by frame (every `FRAME_STEP`-th), to the end of the outrun. */
function botJump(): { frame: number; state: JumpSimState }[] {
  const c = choice();
  let jump: TrainingJump = startTrainingJump(c, 7);
  const bot = makeBot(
    c.profile,
    { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2, leanPattern: () => 0 },
    () => jump.state,
  );
  const frames: { frame: number; state: JumpSimState }[] = [];
  for (let f = 1; f < 3000 && !isJumpOver(jump); f++) {
    jump = stepTrainingJump(jump, bot(f));
    if (f % FRAME_STEP === 0) frames.push({ frame: f, state: jump.state });
  }
  return frames;
}

interface Picture {
  name: string;
  widthPx: number;
  pixelWidth: number;
}

const PICTURES: readonly Picture[] = [
  { name: "432 square", widthPx: VIEW_MAX_WIDTH_PX, pixelWidth: SQUARE_PIXEL_WIDTH },
  { name: "356 square", widthPx: 356, pixelWidth: SQUARE_PIXEL_WIDTH },
  { name: "the original's 320", widthPx: 320, pixelWidth: 1 },
];

/** A thing standing on a drawn surface: its layer, the table that surface is drawn from, and its world place. */
interface SurfaceThing {
  name: string;
  layer: number;
  table: LayerTable;
  place: (view: SceneView) => ScreenPoint;
  xM: number;
}

/** The props and the ends of the distance lines on the hill for a lighting (lamps and masts only by night). */
function surfaceThings(h: HillProfile, night: boolean): SurfaceThing[] {
  const t = hillLayerTables(h);
  const things: SurfaceThing[] = [];
  const prop = (name: string, layer: number, table: LayerTable, xM: number) =>
    things.push({ name, layer, table, xM, place: (view) => onSurface(view, layer, table, xM) });
  // Wind socks every 25 m from 15 m past the takeoff, to the outrun.
  for (let x = h.takeoffXM + 15; x <= h.outrunStartXM; x += 25) prop(`sock at ${x} m`, LAYER.farEdge, t.farEdge, x);
  if (night) {
    for (let k = 0; k < 5; k++) {
      prop(`mast ${k}`, LAYER.farEdge, t.farEdge, firstMastXM(h) + 30 * k);
    }
    for (let x = h.startXM; x < h.takeoffXM; x += 8) prop(`inrun lamp at ${x} m`, LAYER.inrunFar, t.inrunFar, x);
  }
  for (const distanceM of [20.15, choice().kPointM + 0.15, 50.15]) {
    const x = landingXAtArcLength(h, h.takeoffXM, distanceM, 1);
    const y = landingYM(h, x);
    things.push(
      {
        name: `far end of the ${distanceM} m line`,
        layer: LAYER.farEdge,
        table: t.farEdge,
        xM: x,
        place: (view) => onSurfaceAtHeight(view, LAYER.farEdge, t.farEdge, x, y),
      },
      {
        name: `near end of the ${distanceM} m line`,
        layer: LAYER.nearEdge,
        table: t.nearEdge,
        xM: x,
        place: (view) => onSurfaceAtHeight(view, LAYER.nearEdge, t.nearEdge, x, y),
      },
    );
  }
  return things;
}

/** The row a surface is drawn at under view column `sx`, as the fence and the edges are drawn. */
function surfaceRow(view: SceneView, layer: number, table: LayerTable, sx: number): number {
  const off = layerOffset(view, layer);
  return rowsAt(table, off.x + originalColumn(view, sx)) + off.y;
}

const jump = botJump();
const viewsOf = (p: Picture) =>
  jump.map(({ state }) => sceneView(state.jumper.xM, state.jumper.yM, p.widthPx, p.pixelWidth));

/** Indices `i` of consecutive frames (i - 1, i) within a run of the camera going one way across the picture. */
function steadyCamera(views: readonly SceneView[]): number[] {
  const sign = (i: number) => Math.sign((views[i]?.camX ?? 0) - (views[i - 1]?.camX ?? 0));
  const steady: number[] = [];
  for (let i = 2; i < views.length - 1; i++) {
    const s = sign(i);
    if (s !== 0 && sign(i - 1) === s && sign(i + 1) === s) steady.push(i);
  }
  return steady;
}

/** A place with -0 read as 0 (a column computed as 0.0 less something). */
const unsigned = ([x, y]: ScreenPoint): ScreenPoint => [x + 0, y + 0];

const visible = (p: Picture, [sx]: ScreenPoint) => sx >= 0 && sx < p.widthPx;

const moonAt = (view: SceneView) => moonInPicture(choice().profile, DEFAULT_HILL_LOOK, view, SKY_ROWS);

describe.each([
  { lighting: "day", night: false },
  { lighting: "night", night: true },
])("motion of the jump picture by $lighting", ({ night }) => {
  const h = choice().profile;
  const things = surfaceThings(h, night);

  it(
    "keeps props and line ends on their surfaces, at their own table index",
    () => {
      for (const p of PICTURES) {
        const views = viewsOf(p);
        for (const thing of things) {
          const shown = views.map((view) => ({ view, at: thing.place(view) })).filter(({ at }) => visible(p, at));
          const gaps = new Set(shown.map(({ view, at }) => at[1] - surfaceRow(view, thing.layer, thing.table, at[0])));
          expect(gaps.size, `${thing.name}, ${p.name}`).toBeLessThanOrEqual(1);
          // Moves exactly as its layer scrolls: its column shows its own table index or, where the view skips
          // that index, a neighbour of it.
          const own = layerIndex(thing.layer, thing.xM);
          const misses = shown.map(({ view, at }) =>
            Math.abs(layerOffset(view, thing.layer).x + originalColumn(view, at[0]) - own),
          );
          expect(Math.max(0, ...misses), `${thing.name}, ${p.name}`).toBeLessThanOrEqual(p.pixelWidth === 1 ? 0 : 1);
        }
      }
      // The jump shows the props it is meant to check.
      const [first] = PICTURES;
      if (first === undefined) throw new Error("no pictures");
      const views = viewsOf(first);
      const seen = things.filter((thing) => views.some((view) => visible(first, thing.place(view))));
      expect(seen.length).toBeGreaterThan(night ? 8 : 4);
    },
    MOTION_TIMEOUT_MS,
  );

  it(
    "never turns a thing back while the camera goes one way",
    () => {
      for (const p of PICTURES) {
        const views = viewsOf(p);
        const steady = steadyCamera(views);
        expect(steady.length).toBeGreaterThan(jump.length / 2);
        for (const i of steady) {
          const before = views[i - 1];
          const after = views[i];
          if (before === undefined || after === undefined) throw new Error(`no frame ${i}`);
          const camera = Math.sign(after.camX - before.camX);
          const turns = things.filter((thing) => {
            const a = thing.place(before);
            const b = thing.place(after);
            // The picture moves against the camera.
            return visible(p, a) && visible(p, b) && Math.sign(b[0] - a[0]) * camera > 0;
          });
          expect(
            turns.map((thing) => thing.name),
            `${p.name}, frame ${i}`,
          ).toEqual([]);
        }
      }
    },
    MOTION_TIMEOUT_MS,
  );

  it(
    "places things against the scenery the same way whatever the picture's width",
    () => {
      const [wide, narrow] = PICTURES;
      if (wide === undefined || narrow === undefined) throw new Error("no pictures");
      const shift = (wide.widthPx - narrow.widthPx) / 2;
      const narrowViews = viewsOf(narrow);
      viewsOf(wide).forEach((view, i) => {
        const other = narrowViews[i];
        if (other === undefined) throw new Error(`no frame ${i}`);
        expect(
          things.map((thing) => unsigned(thing.place(other))),
          `frame ${i}`,
        ).toEqual(
          things.map((thing) => {
            const [x, y] = thing.place(view);
            return unsigned([x - shift, y]);
          }),
        );
      });
      // Every picture keeps the same relation of each thing to its surface.
      for (const thing of things) {
        const gaps = PICTURES.flatMap((p) => {
          const view = viewsOf(p).find((v) => visible(p, thing.place(v)));
          if (view === undefined) return [];
          const at = thing.place(view);
          return [at[1] - surfaceRow(view, thing.layer, thing.table, at[0])];
        });
        expect(new Set(gaps).size, `thing ${thing.name}`).toBeLessThanOrEqual(1);
      }
    },
    MOTION_TIMEOUT_MS,
  );
});

describe("the moon in the jump picture", () => {
  it(
    "keeps to one place of the sky for the whole jump",
    () => {
      for (const p of PICTURES) {
        const places = new Set(
          viewsOf(p).map((view) => {
            const [x, y] = moonAt(view);
            return `${x + skyDrift(view)},${y}`;
          }),
        );
        expect([...places], `picture ${p.name}`).toHaveLength(1);
      }
    },
    MOTION_TIMEOUT_MS,
  );

  it(
    "never turns back while the camera goes one way",
    () => {
      for (const p of PICTURES) {
        const views = viewsOf(p);
        const turns = steadyCamera(views).filter((i) => {
          const before = views[i - 1];
          const after = views[i];
          if (before === undefined || after === undefined) return true;
          return Math.sign(moonAt(after)[0] - moonAt(before)[0]) * Math.sign(after.camX - before.camX) > 0;
        });
        expect(turns, `picture ${p.name}`).toEqual([]);
      }
    },
    MOTION_TIMEOUT_MS,
  );
  // Its place is not compared between widths: its usual place is a share of the picture's width, so a narrower
  // picture shows it at a place of its own, still fixed for the jump.
});

describe("the birds in the jump picture", () => {
  const h = choice().profile;

  it(
    "fly with their layer, across and up or down",
    () => {
      const span = VIEW_MAX_WIDTH_PX + 60;
      for (const p of PICTURES) {
        const views = viewsOf(p);
        const start = views[0];
        if (start === undefined) throw new Error("no frames");
        const worst = { across: 0, bob: 0 };
        views.forEach((view, i) => {
          const frame = jump[i]?.frame ?? 0;
          const scroll = layerScroll(view, BIRD_LAYER);
          const drop = scroll.y - layerScroll(start, BIRD_LAYER).y;
          birdPlaces(h, view, frame).forEach(([sx, sy], bird) => {
            // Across: its own flight less the layer's scroll, wrapped around the birds' span.
            const across = sx - (p.widthPx - span) / 2 - (birdFlightPx(bird, frame) - scroll.x);
            worst.across = Math.max(worst.across, Math.abs((((across % span) + span + span / 2) % span) - span / 2));
            // Up and down: with the layer, bobbing at most 2 rows around its height.
            worst.bob = Math.max(worst.bob, Math.abs(sy - drop - (12 + bird * 6)));
          });
        });
        expect(worst.across, `picture ${p.name}`).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(worst.bob, `picture ${p.name}`).toBeLessThanOrEqual(2);
      }
    },
    MOTION_TIMEOUT_MS,
  );

  it(
    "keep their places whatever the picture's width",
    () => {
      const [wide, narrow] = PICTURES;
      if (wide === undefined || narrow === undefined) throw new Error("no pictures");
      const shift = (wide.widthPx - narrow.widthPx) / 2;
      const narrowViews = viewsOf(narrow);
      viewsOf(wide).forEach((view, i) => {
        const frame = jump[i]?.frame ?? 0;
        const other = narrowViews[i];
        if (other === undefined) throw new Error(`no frame ${i}`);
        expect(birdPlaces(h, other, frame).map(unsigned)).toEqual(
          birdPlaces(h, view, frame).map(([bx, by]) => unsigned([bx - shift, by])),
        );
      });
    },
    MOTION_TIMEOUT_MS,
  );
});

describe("the interface of the jump picture", () => {
  it(
    "stays fixed to the picture",
    () => {
      const fb = new FrameBuffer(VIEW_MAX_WIDTH_PX, 200);
      const boxes = new Set(
        jump.map(({ state }) => {
          fb.pixels.fill(0);
          drawWindBox(fb, state);
          let [left, top, right, bottom] = [fb.width, fb.height, -1, -1];
          for (let i = 0; i < fb.pixels.length; i++) {
            if (fb.pixels[i] === 0) continue;
            const x = i % fb.width;
            const y = (i - x) / fb.width;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
          return `${left},${top},${right},${bottom}`;
        }),
      );
      expect([...boxes]).toHaveLength(1);
    },
    MOTION_TIMEOUT_MS,
  );
});
