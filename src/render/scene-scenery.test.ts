import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { inrunYM, landingYM } from "../sim/hill-profile";
import { DEFAULT_HILL_LOOK, type HillLook } from "./hill-look";
import { backgroundWaves, drawFloodlightSpill, FLOODLIGHT_SPILL } from "./scene-backdrop";
import { FrameBuffer } from "./frame-buffer";
import { sceneView } from "./scene-layers";
import { sceneCanvas } from "./scene-span";
import { BIRD_FRAMES, drawBirds } from "./scene-extras";
import { color } from "./palette";
import { LINE_COLOUR, distanceLines } from "./scene-hill";
import { SKY_FIRST_INDEX, greyedMiddle, sceneDac } from "./scene-palette";
import { placeTrees, sceneTrees } from "./scene-trees";
import { TREE_VARIANTS, treeBitmap, type TreeKind } from "./tree-bitmaps";

const hill = OWN_HILLS[0];
const rgbAt = (dac: Uint8Array, i: number) => Array.from(dac.subarray(i * 3, i * 3 + 3));

describe("the scene palette", () => {
  it("builds the original's ramps (values of v2.10P's palette during a jump)", () => {
    const dac = sceneDac([23, 57, 58]);
    expect([0, 31, 63, 0x4a, 0x8a, 0xca, 0xea].map((i) => rgbAt(dac, i))).toEqual([
      [0, 0, 2],
      [29, 30, 31],
      [56, 56, 63],
      [58, 12, 12],
      [15, 61, 61],
      [59, 43, 5],
      [31, 31, 31],
    ]);
  });

  it("pulls the middle colours towards grey with the original's rounding of exact halves", () => {
    expect(greyedMiddle([63, 10, 10])).toEqual([58, 12, 12]);
    expect(greyedMiddle([10, 63, 63])).toEqual([15, 61, 61]);
  });

  it("fades the sky from dark blue at the top to the hill's colour at the horizon", () => {
    const dac = sceneDac([23, 57, 58]);
    expect(rgbAt(dac, SKY_FIRST_INDEX)).toEqual([25, 25, 60]);
    expect(rgbAt(dac, 0xfa)).toEqual([32, 46, 58]);
    expect(rgbAt(dac, 0xff)).toEqual([23, 57, 58]);
  });
});

describe("the background hills", () => {
  it("draw their waves from the hill's seed as the original does", () => {
    const sets = backgroundWaves(4292, 50);
    expect(sets).toHaveLength(5);
    expect(sets[0]?.[0]).toEqual({
      amplitude: Math.fround(14.827066421508789),
      phase: Math.fround(1.996000051498413),
      frequency: Math.fround(0.010406414978206158),
    });
    expect(sets[4]?.[3]).toEqual({
      amplitude: Math.fround(14.313616752624512),
      phase: Math.fround(3.009000062942505),
      frequency: Math.fround(0.006863419897854328),
    });
  });
});

describe("the lines on the landing hill", () => {
  it("are the marks every 5 m, the K point in red and the record in blue", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 3, fenceColour: 0xc0, fenceStartM: 0 }, 91.5);
    expect(lines.map((l) => [l.distanceM, l.colour])).toEqual([
      [70.15, LINE_COLOUR.mark],
      [75.15, LINE_COLOUR.mark],
      [80.15, LINE_COLOUR.mark],
      [85.15, LINE_COLOUR.kPoint],
      [91.75, LINE_COLOUR.record],
    ]);
  });

  it("puts the record line out of sight when there is no record", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 0, fenceColour: 0xc0, fenceStartM: 0 }, 0);
    expect(lines.at(-1)?.distanceM).toBeGreaterThan(1000);
  });
});

describe("the trees", () => {
  it("stand on layers 2 to 15, at most 20 on a layer, none near the takeoff on the nearest layers", () => {
    if (!hill) throw new Error("no hill");
    const trees = placeTrees(hill.profile, hill.look);
    expect(trees.length).toBeGreaterThan(20);
    expect(trees.every((t) => t.layer >= 2 && t.layer <= 15)).toBe(true);
    for (let layer = 2; layer <= 15; layer++) {
      expect(trees.filter((t) => t.layer === layer).length).toBeLessThanOrEqual(20);
    }
    const takeoff = hill.profile.takeoffXM;
    const near = trees.filter((t) => t.layer >= 11 && t.xM >= takeoff - 30 && t.xM <= takeoff + 20);
    expect(near).toEqual([]);
  });

  it("leave out the ones a hill takes out of sight", () => {
    if (!hill) throw new Error("no hill");
    const all = placeTrees(hill.profile, hill.look);
    const layer = all[0]?.layer ?? 2;
    const look: HillLook = {
      ...DEFAULT_HILL_LOOK,
      trees: { ...DEFAULT_HILL_LOOK.trees, hidden: [{ layer, first: 1, last: 1 }] },
    };
    const some = placeTrees(hill.profile, look);
    expect(some.length).toBe(all.length - 1);
    expect(some.filter((t) => t.layer === layer)).toEqual(all.filter((t) => t.layer === layer).slice(1));
  });

  it("have the original's sizes, narrower in square pixels", () => {
    const largest = treeBitmap("spruce", 12, 1);
    expect([largest.width, largest.height]).toEqual([71, 120]);
    expect(treeBitmap("pine", 2, 6 / 5).height).toBe(6);
    expect(treeBitmap("pine", 12, 6 / 5).width).toBe(56);
  });
});

describe("the birds", () => {
  it("never show as a flat line: in every shape the wings span at least two rows", () => {
    for (const shapes of Object.values(BIRD_FRAMES)) {
      for (const rows of [...shapes.beat, shapes.glide]) {
        const wingRows = rows.filter((row) => row.includes("+")).length;
        expect(wingRows).toBeGreaterThanOrEqual(2);
        expect(rows.join("")).toContain("#");
      }
    }
  });

  it("keep to the sky over the top of the inrun: in the picture at the start, out of it lower down", () => {
    if (!hill) throw new Error("no hill");
    const h = hill.profile;
    const birdPixelsAt = (xM: number, yM: number) => {
      const fb = new FrameBuffer(432, 200);
      drawBirds(fb, h, sceneView(xM, yM, 432, 1.2), 0);
      return fb.pixels.filter((p) => p === color("bird")).length;
    };
    expect(birdPixelsAt(h.startXM, inrunYM(h, h.startXM))).toBeGreaterThan(0);
    expect(birdPixelsAt(h.takeoffXM, inrunYM(h, h.takeoffXM))).toBe(0);
    expect(birdPixelsAt(h.takeoffXM + 60, landingYM(h, h.takeoffXM + 60))).toBe(0);
  });
});

describe("this project's trees", () => {
  const kinds: readonly TreeKind[] = ["spruce", "pine"];

  it("are never a bare stick: some row of needles spans most of the tree's width", () => {
    for (const kind of kinds) {
      for (let size = 2; size <= 12; size++) {
        for (let variant = 0; variant < TREE_VARIANTS; variant++) {
          const b = treeBitmap(kind, size, 6 / 5, variant);
          let widest = 0;
          for (let y = 0; y < b.height; y++) {
            const row = b.pixels.subarray(y * b.width, (y + 1) * b.width);
            const needles = row.filter((i) => i >= 0x51 && i <= 0x56).length;
            widest = Math.max(widest, needles);
          }
          // A pine's pointed crown is a little narrower than a spruce's.
          expect(widest).toBeGreaterThanOrEqual(Math.ceil(b.width * (kind === "pine" ? 0.55 : 0.6)));
        }
      }
    }
  });

  it("come in shapes that differ from each other", () => {
    for (const kind of kinds) {
      const shapes = new Set<string>();
      for (let variant = 0; variant < TREE_VARIANTS; variant++) {
        shapes.add(treeBitmap(kind, 10, 1, variant).pixels.join(","));
      }
      expect(shapes.size).toBe(TREE_VARIANTS);
    }
  });

  it("keep the original's trees in place and add groves only on the farther layers", () => {
    if (!hill) throw new Error("no hill");
    const original = placeTrees(hill.profile, hill.look);
    const drawn = sceneTrees(hill.profile, hill.look);
    expect(drawn.filter((t) => original.includes(t))).toEqual(original);
    const added = drawn.filter((t) => !original.includes(t));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((t) => t.layer <= 10)).toBe(true);
  });
});

describe("the floodlights' light behind the hill", () => {
  // Every column fenced, or every column far from the fence.
  const cases = Object.entries(FLOODLIGHT_SPILL).flatMap(([lighting, spill]) => [
    { lighting, where: "by the fence", spill, fenceStart: -Infinity, shape: spill.fenced },
    { lighting, where: "without a fence", spill, fenceStart: Infinity, shape: spill.open },
  ]);

  it.each(cases)(
    "at $lighting $where brightens the background towards the far edge, within its reach, and leaves the sky alone",
    ({ spill, fenceStart, shape }) => {
      if (!hill) throw new Error("no hill");
      const fb = new FrameBuffer(64, 200);
      const c = sceneCanvas(fb, 199);
      fb.pixels.fill(0xff000000);
      c.indices.fill(20);
      // The sky in the left half of the picture.
      for (let y = 0; y < 200; y++) c.indices.fill(SKY_FIRST_INDEX, y * 64, y * 64 + 32);
      const near = new Uint32Array(256).fill(0xffffffff);
      drawFloodlightSpill(
        c,
        hill.profile,
        sceneView(hill.profile.takeoffXM + 40, landingYM(hill.profile, hill.profile.takeoffXM + 40), 64, 1.2),
        near,
        spill,
        fenceStart,
      );
      const columns = Array.from({ length: 64 }, (_column, x) => {
        const red = Array.from({ length: 200 }, (_row, y) => (fb.pixels[y * 64 + x] ?? 0) & 0xff);
        const rows = red.flatMap((r, y) => (r > 0 ? [y] : []));
        return { x, rows, run: rows.map((y) => red[y] ?? 0) };
      });
      expect(columns.filter((column) => column.x < 32 && column.rows.length > 0)).toEqual([]);
      const lit = columns.filter((column) => column.rows.length > 0);
      expect(lit.length).toBeGreaterThan(0);
      for (const { rows, run } of lit) {
        // One run of rows, getting lighter downwards, within the reach of the light and its share at the edge.
        expect((rows.at(-1) ?? 0) - (rows[0] ?? 0) + 1).toBe(rows.length);
        expect(rows.length).toBeLessThanOrEqual(shape.rowsPx);
        expect(run).toEqual(run.toSorted((a, b) => a - b));
        expect(Math.max(...run)).toBeLessThanOrEqual(Math.round(255 * shape.atEdge));
      }
    },
  );

  it("keeps one shape at dusk, and at night is brighter only where the edge has no fence", () => {
    expect(FLOODLIGHT_SPILL.dusk.open).toBe(FLOODLIGHT_SPILL.dusk.fenced);
    expect(FLOODLIGHT_SPILL.night.fenced).toBe(FLOODLIGHT_SPILL.dusk.fenced);
    expect(FLOODLIGHT_SPILL.night.open.atEdge).toBeGreaterThan(FLOODLIGHT_SPILL.night.fenced.atEdge);
    expect(FLOODLIGHT_SPILL.night.open.atEdge).toBeLessThan(1);
  });
});
