import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Things of the world are put on the picture only by `scene-anchor.ts`. A thing that computes its own screen place
 * from the low-level projection drifts against the surface or the layer it belongs to: props took a rounded column
 * and the exact layer row while the fence under them was drawn from the table, and birds scrolled by a share of
 * the camera of their own. These rules keep the projection in the placement module and the layer primitives.
 */
interface Rule {
  name: string;
  pattern: RegExp;
  /** Files of `src/render` that may use it, with the reason. */
  allowed: Readonly<Record<string, string>>;
}

const PRIMITIVES = "the layer primitives";
const ANCHOR = "the placement module";

const RULES: readonly Rule[] = [
  {
    name: "a view column of a world place",
    pattern: /(?<![\w$.])(?:viewColumn|nearestViewColumn)\s*\(/g,
    allowed: { "scene-layers.ts": PRIMITIVES, "scene-anchor.ts": ANCHOR },
  },
  {
    name: "a row of a world height on a layer",
    pattern: /(?<![\w$.])layerRows\s*\(/g,
    allowed: {
      "scene-layers.ts": PRIMITIVES,
      "scene-anchor.ts": ANCHOR,
      "hill-layer-tables.ts": "builds the tables the hill's surfaces are drawn from",
      "scene-backdrop.ts": "builds the tables the background's surfaces are drawn from",
    },
  },
  {
    name: "a scroll of the camera's own",
    pattern: /\.cam[XY](?![\w$])/g,
    allowed: { "scene-layers.ts": PRIMITIVES, "scene-anchor.ts": ANCHOR },
  },
  {
    name: "a layer's scroll turned into columns by hand",
    pattern: /layerOffset\s*\([^)]*\)\s*\.x\s*\//g,
    allowed: { "scene-anchor.ts": ANCHOR },
  },
  {
    name: "a camera of its own",
    pattern: /(?<![\w$.])sceneView\s*\(/g,
    allowed: {
      "scene-layers.ts": PRIMITIVES,
      "scene-anchor.ts": ANCHOR,
      "jump-view-scene.ts": "makes the frame's camera from the jumper",
    },
  },
];

/** The source with comments and the contents of plain strings blanked out (names in prose are not calls). */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
}

/** The rules a source text breaks, as rule names; a file in a rule's allowed list does not break it. */
function broken(file: string, source: string): string[] {
  const text = code(source);
  return RULES.filter((rule) => !(file in rule.allowed) && new RegExp(rule.pattern).test(text)).map(
    (rule) => `${file}: ${rule.name}`,
  );
}

describe("placement of world things", () => {
  it("catches the old ways of placing props, birds and the sky", () => {
    // Props on the far fence before they kept to the fence's own table row.
    expect(
      broken("scene-extras.ts", "const sx = viewColumn(view, layerIndex(layer, x) - off.x);\nlayerRows(layer, y);"),
    ).toEqual([
      "scene-extras.ts: a view column of a world place",
      "scene-extras.ts: a row of a world height on a layer",
    ]);
    // Birds that scrolled by a share of the camera rather than with their layer.
    expect(broken("scene-extras.ts", "const origin = view.camX * 0.05;")).toEqual([
      "scene-extras.ts: a scroll of the camera's own",
    ]);
    expect(broken("scene-extras.ts", "const origin = layerOffset(view, 3).x / view.pixelWidth;")).toEqual([
      "scene-extras.ts: a layer's scroll turned into columns by hand",
    ]);
    // The moon placed for a camera of its own.
    expect(broken("scene-extras.ts", "const atStart = sceneView(h.startXM, y, w, p);")).toEqual([
      "scene-extras.ts: a camera of its own",
    ]);
  });

  it("is not fooled by names in comments and strings, or by longer names", () => {
    expect(broken("x.ts", '// viewColumn(view, j)\n/* view.camX */\nconst a = "layerRows(1, 2)";')).toEqual([]);
    expect(broken("x.ts", "const b = nearestViewColumnOf(view);\nconst c = s.camXM;")).toEqual([]);
  });

  it("is done only by the placement module and the layer primitives", () => {
    const dir = new URL(".", import.meta.url);
    const found = readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .flatMap((name) => broken(name, readFileSync(new URL(name, dir), "utf8")));
    expect(found).toEqual([]);
  });
});
