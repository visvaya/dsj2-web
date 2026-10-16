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
const SURFACES = "draws surfaces column by column";

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
    // `layerOffset(...).x / view.pixelWidth` and `off.x / view.pixelWidth` alike, whatever is inside the call.
    name: "a layer's scroll turned into columns by hand",
    pattern: /\.x\s*\/\s*[\w$.]*pixelWidth(?![\w$])/g,
    allowed: { "scene-anchor.ts": ANCHOR },
  },
  {
    name: "the start gate's placement used for something else",
    pattern: /(?<![\w$.])gatePlace\s*\(/g,
    allowed: { "scene-anchor.ts": ANCHOR, "scene-inrun.ts": "places the start gate" },
  },
  {
    // A surface row by hand (`rowsAt(table, off.x + originalColumn(view, sx)) + off.y`) needs both. Inside a
    // file that draws surfaces column by column the guard cannot tell such a row from the surface's own: there
    // it is the motion test that keeps things on what is drawn.
    name: "a picture column sampled or a surface row read",
    pattern: /(?<![\w$.])(?:originalColumn|rowsAt)\s*\(/g,
    allowed: {
      "scene-layers.ts": PRIMITIVES,
      "scene-anchor.ts": ANCHOR,
      "hill-layer-tables.ts": "builds and reads the tables the hill's surfaces are drawn from",
      "scene-backdrop.ts": SURFACES,
      "scene-floodlight.ts": SURFACES,
      "scene-hill.ts": SURFACES,
      "scene-inrun.ts": SURFACES,
      "scene-mountains.ts": SURFACES,
    },
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

/** Characters after which a `/` starts a regular expression rather than a division. */
const BEFORE_REGEX = new Set("(,=:[!&|?{};+-*%<>~^");

/**
 * The source with comments and the contents of strings, templates and regular expressions blanked out (names in
 * prose are not calls), read token by token so a `//` in a string does not hide the code after it. The code inside
 * a template's `${...}` is kept.
 */
function code(source: string): string {
  let out = "";
  let i = 0;
  // Brace depth at which each template being read had its `${` opened.
  const templates: number[] = [];
  let depth = 0;
  let last = "";
  const skipQuoted = (end: string) => {
    i++;
    while (i < source.length && source[i] !== end && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
    i++;
    out += '""';
    last = '"';
  };
  // A template's text up to its end or its next `${`.
  const skipTemplateText = () => {
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") i += 2;
      else if (ch === "`") {
        i++;
        out += "``";
        last = "`";
        return;
      } else if (ch === "$" && source[i + 1] === "{") {
        i += 2;
        templates.push(depth);
        depth++;
        out += "`${";
        last = "{";
        return;
      } else i++;
    }
  };
  const skipRegex = () => {
    // Its classes too: a `/` inside `[...]` does not end it. Then its flags.
    i++;
    let inClass = false;
    while (i < source.length && source[i] !== "\n" && (inClass || source[i] !== "/")) {
      if (source[i] === "\\") i++;
      else if (source[i] === "[") inClass = true;
      else if (source[i] === "]") inClass = false;
      i++;
    }
    i++;
    while (/[a-z]/.test(source[i] ?? "")) i++;
    out += "/./";
    last = "/";
  };
  while (i < source.length) {
    const ch = source[i] ?? "";
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      out += " ";
    } else if (ch === '"' || ch === "'") {
      skipQuoted(ch);
    } else if (ch === "`") {
      i++;
      skipTemplateText();
    } else if (ch === "/" && (last === "" || BEFORE_REGEX.has(last) || /(?:return|typeof|case)\s*$/.test(out))) {
      skipRegex();
    } else if (ch === "}" && templates.length > 0 && templates[templates.length - 1] === depth - 1) {
      // The end of a template's `${...}`: its text goes on.
      depth--;
      templates.pop();
      i++;
      out += "}";
      skipTemplateText();
    } else {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      out += ch;
      if (!/\s/.test(ch)) last = ch;
      i++;
    }
  }
  return out;
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

  it("reads strings, templates and regular expressions as such", () => {
    const call = ["x.ts: a view column of a world place"];
    // A `//` or `/*` inside a string or a regular expression hides nothing after it.
    expect(broken("x.ts", 'const a = "//"; const b = viewColumn(view, 1);')).toEqual(call);
    expect(broken("x.ts", "const a = '/*'; const b = viewColumn(view, 1); // */")).toEqual(call);
    expect(broken("x.ts", "const r = /[/]x\\//g; const b = viewColumn(view, 1);")).toEqual(call);
    expect(broken("x.ts", "const a = `//`; const b = viewColumn(view, 1);")).toEqual(call);
    // Names inside a template's text or a regular expression are not calls; code inside `${...}` is.
    expect(broken("x.ts", "const a = `viewColumn(view, 1)`;\nconst r = /layerRows\\(/;")).toEqual([]);
    expect(broken("x.ts", "const a = `at ${viewColumn(view, { a: 1 }.a)} px`;")).toEqual(call);
    expect(broken("x.ts", "const a = `${`${x}`}`; const b = 4 / 2; const c = viewColumn(v, 1);")).toEqual(call);
  });

  it("catches a layer's scroll divided by hand and the gate's placement used for a prop", () => {
    const divided = ["scene-extras.ts: a layer's scroll turned into columns by hand"];
    expect(
      broken("scene-extras.ts", "const off = layerOffset(view, f(2));\nconst c = off.x / view.pixelWidth;"),
    ).toEqual(divided);
    expect(broken("scene-extras.ts", "const c = layerOffset(view, f(g(2))).x / view.pixelWidth;")).toEqual(divided);
    expect(broken("scene-extras.ts", "const [sx, row] = gatePlace(view, layer, x, y);")).toEqual([
      "scene-extras.ts: the start gate's placement used for something else",
    ]);
    expect(broken("scene-inrun.ts", "const [sx, row] = gatePlace(view, layer, x, y);")).toEqual([]);
    expect(broken("scene-extras.ts", "const y = rowsAt(t, off.x + originalColumn(view, sx)) + off.y;")).toEqual([
      "scene-extras.ts: a picture column sampled or a surface row read",
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
