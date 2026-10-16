import type { HillLook, InrunSupport } from "../render/hill-look";
import { fontDraws, textWidth } from "../render/pixel-font";
import type { InrunSpec, LandingSpec } from "../sim/hill-setup";
import { UI_TEXT } from "../text/ui-text";
import { HILL_SPEC_SCHEMA_VERSION, type HillProblem, type HillSpec } from "./hill-spec";
import { HILL_SPEC_LIMITS, type NumberLimit } from "./hill-spec-limits";
import { HILL_TITLE_MAX_WIDTH_PX } from "./hill-title";

export type HillSpecResult = { ok: true; spec: HillSpec } | { ok: false; problems: readonly HillProblem[] };

/** The fields of an object that passed the key check; a key it lacks was reported already. */
type Fields = ReadonlyMap<string, unknown>;

const NO_FIELDS: Fields = new Map();

/** Control and format characters: bidi controls, zero-width characters and the byte order mark among them. */
const HIDDEN_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const KEYS = {
  root: ["schemaVersion", "id", "name", "kPointM", "profile", "look"],
  profile: ["inrun", "landing"],
  inrun: ["startXM", "flatEndXM", "lineEndXM", "takeoffXM", "lineSlope", "lineInterceptM", "curveA"],
  landing: ["centerXM", "centerYM", "amplitudeM", "widthM", "outrunStartXM", "outrunCurveA", "knollBlend"],
  look: ["skyRgb6", "terrain", "trees", "supports", "inrun", "marks"],
  terrain: ["seed", "amplitudeM", "baseOverOutrunM"],
  trees: ["firstCount", "secondCount", "fromXM", "toXM", "seed", "hidden"],
  hidden: ["layer", "first", "last"],
  support: ["fromXM", "toXM", "colour", "frontColour"],
  lookInrun: ["platformStartXM", "nearWallUpPx", "nearWallDownPx", "wallColour", "gateColour"],
  marks: ["firstMarkM", "markCount", "fenceColour", "fenceStartM"],
} as const;

const join = (path: string, key: string | number) => (path === "" ? String(key) : `${path}.${key}`);

const isPlainObject = (value: unknown): value is object => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Reads one hill. Problems are collected in a list owned by this call; a value that failed a check is replaced by a
 * placeholder, which never leaves the call because any problem makes the result a failure.
 */
function reader() {
  const problems: HillProblem[] = [];
  const report = (rule: string, path: string, message: string) => {
    problems.push({ rule: `format.${rule}`, path, message });
  };

  /** An object's own data fields, with unknown, missing and accessor keys reported. */
  const object = (value: unknown, path: string, keys: readonly string[], skip: readonly string[] = []): Fields => {
    if (!isPlainObject(value)) {
      report("object", path, "expected an object");
      return NO_FIELDS;
    }
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      const name = String(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !keys.includes(key)) {
        report("unknown-key", join(path, name), "unknown key");
      } else if (descriptor === undefined || !("value" in descriptor)) {
        report("object", join(path, name), "expected a data property");
      } else {
        fields.set(key, descriptor.value);
      }
    }
    for (const key of keys) {
      if (!fields.has(key) && !skip.includes(key) && !problems.some((p) => p.path === join(path, key))) {
        report("missing-key", join(path, key), "missing key");
      }
    }
    return fields;
  };

  const numberOf = (value: unknown, path: string, limit: NumberLimit): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      report("number", path, "expected a finite number");
      return Number.NaN;
    }
    if (limit.integer === true && !Number.isInteger(value)) {
      report("integer", path, "expected a whole number");
    } else if (value < limit.min || value > limit.max) {
      report("range", path, `expected ${limit.min} to ${limit.max}`);
    }
    return value;
  };

  /** A number field; a missing one was reported with its object. */
  const num = (fields: Fields, path: string, key: string, limit: NumberLimit): number =>
    fields.has(key) ? numberOf(fields.get(key), join(path, key), limit) : Number.NaN;

  const sub = (fields: Fields, path: string, key: string, keys: readonly string[]): Fields =>
    fields.has(key) ? object(fields.get(key), join(path, key), keys) : NO_FIELDS;

  const list = (fields: Fields, path: string, key: string, maxCount: number): readonly unknown[] => {
    if (!fields.has(key)) return [];
    const value = fields.get(key);
    if (!Array.isArray(value)) {
      report("array", join(path, key), "expected an array");
      return [];
    }
    if (value.length > maxCount) report("count", join(path, key), `expected at most ${maxCount} entries`);
    // Read no further than the allowed count, so a huge list costs nothing; a hole reads as undefined and is
    // reported where an entry belongs.
    return Array.from({ length: Math.min(value.length, maxCount) }, (_, i): unknown => value[i]);
  };

  const order = (holds: boolean, path: string, message: string) => {
    if (!holds) report("order", path, message);
  };

  return { problems, report, object, num, numberOf, sub, list, order };
}

type Reader = ReturnType<typeof reader>;

/** Whether every value passed its own check (a failed one is a NaN placeholder), so their order can be judged. */
const valid = (...xs: number[]) => xs.every((x) => !Number.isNaN(x));

function readInrun(r: Reader, fields: Fields): InrunSpec {
  const path = "profile.inrun";
  const f = r.sub(fields, "profile", "inrun", KEYS.inrun);
  const L = HILL_SPEC_LIMITS.inrun;
  const inrun: InrunSpec = {
    startXM: r.num(f, path, "startXM", L.startXM),
    flatEndXM: r.num(f, path, "flatEndXM", L.flatEndXM),
    lineEndXM: r.num(f, path, "lineEndXM", L.lineEndXM),
    takeoffXM: r.num(f, path, "takeoffXM", L.takeoffXM),
    lineSlope: r.num(f, path, "lineSlope", L.lineSlope),
    lineInterceptM: r.num(f, path, "lineInterceptM", L.lineInterceptM),
    curveA: r.num(f, path, "curveA", L.curveA),
  };
  // The profile functions take the flat part up to flatEndXM, the line from there to lineEndXM and the curve
  // after it: a flat part past the line's end would be overwritten. The start may lie on the flat part.
  if (valid(inrun.startXM, inrun.takeoffXM)) {
    r.order(inrun.startXM < inrun.takeoffXM, `${path}.startXM`, "the start must lie before the takeoff");
  }
  if (valid(inrun.flatEndXM, inrun.lineEndXM, inrun.takeoffXM)) {
    r.order(
      inrun.flatEndXM <= inrun.lineEndXM && inrun.lineEndXM < inrun.takeoffXM,
      `${path}.lineEndXM`,
      "the line must end between the flat part and the takeoff",
    );
  }
  return inrun;
}

function readLanding(r: Reader, fields: Fields, takeoffXM: number): LandingSpec {
  const path = "profile.landing";
  const f = r.sub(fields, "profile", "landing", KEYS.landing);
  const L = HILL_SPEC_LIMITS.landing;
  const landing: LandingSpec = {
    centerXM: r.num(f, path, "centerXM", L.centerXM),
    centerYM: r.num(f, path, "centerYM", L.centerYM),
    amplitudeM: r.num(f, path, "amplitudeM", L.amplitudeM),
    widthM: r.num(f, path, "widthM", L.widthM),
    outrunStartXM: r.num(f, path, "outrunStartXM", L.outrunStartXM),
    outrunCurveA: r.num(f, path, "outrunCurveA", L.outrunCurveA),
    knollBlend: r.num(f, path, "knollBlend", L.knollBlend),
  };
  if (!Number.isNaN(landing.outrunStartXM) && !Number.isNaN(takeoffXM)) {
    r.order(
      landing.outrunStartXM >= takeoffXM + L.outrunStartOverTakeoffMinM,
      `${path}.outrunStartXM`,
      `the outrun must start at least ${L.outrunStartOverTakeoffMinM} m past the takeoff`,
    );
  }
  return landing;
}

function readTrees(r: Reader, fields: Fields): HillLook["trees"] {
  const path = "look.trees";
  const f = r.sub(fields, "look", "trees", KEYS.trees);
  const L = HILL_SPEC_LIMITS.look.trees;
  const hidden = r.list(f, path, "hidden", L.hiddenMaxCount).map((entry, i) => {
    const at = join(join(path, "hidden"), i);
    const h = r.object(entry, at, KEYS.hidden);
    const record = {
      layer: r.num(h, at, "layer", L.hiddenLayer),
      first: r.num(h, at, "first", L.hiddenRecord),
      last: r.num(h, at, "last", L.hiddenRecord),
    };
    r.order(!(record.first > record.last), `${at}.last`, "the last record must not come before the first");
    return record;
  });
  const trees = {
    firstCount: r.num(f, path, "firstCount", L.count),
    secondCount: r.num(f, path, "secondCount", L.count),
    fromXM: r.num(f, path, "fromXM", L.xM),
    toXM: r.num(f, path, "toXM", L.xM),
    seed: r.num(f, path, "seed", L.seed),
    hidden,
  };
  r.order(!(trees.fromXM >= trees.toXM), `${path}.toXM`, "the trees must end after they start");
  return trees;
}

function readSupports(r: Reader, fields: Fields): readonly InrunSupport[] {
  const L = HILL_SPEC_LIMITS.look.supports;
  return r.list(fields, "look", "supports", L.maxCount).map((entry, i) => {
    const at = `look.supports.${i}`;
    const s = r.object(entry, at, KEYS.support);
    const support = {
      fromXM: r.num(s, at, "fromXM", L.xM),
      toXM: r.num(s, at, "toXM", L.xM),
      colour: r.num(s, at, "colour", L.colour),
      frontColour: r.num(s, at, "frontColour", L.colour),
    };
    r.order(!(support.fromXM >= support.toXM), `${at}.toXM`, "a support must end after it starts");
    return support;
  });
}

function readSky(r: Reader, fields: Fields): HillLook["skyRgb6"] {
  const values = r.list(fields, "look", "skyRgb6", 3);
  if (fields.has("skyRgb6") && Array.isArray(fields.get("skyRgb6")) && values.length < 3) {
    r.report("count", "look.skyRgb6", "expected 3 entries");
  }
  const channel = (i: number) => r.numberOf(values[i], `look.skyRgb6.${i}`, HILL_SPEC_LIMITS.look.skyRgb6);
  return values.length === 3 ? [channel(0), channel(1), channel(2)] : [Number.NaN, Number.NaN, Number.NaN];
}

function readLook(r: Reader, root: Fields): HillLook {
  const f = r.sub(root, "", "look", KEYS.look);
  const L = HILL_SPEC_LIMITS.look;
  const skyRgb6 = readSky(r, f);
  const t = r.sub(f, "look", "terrain", KEYS.terrain);
  const terrain = {
    seed: r.num(t, "look.terrain", "seed", L.terrain.seed),
    amplitudeM: r.num(t, "look.terrain", "amplitudeM", L.terrain.amplitudeM),
    baseOverOutrunM: r.num(t, "look.terrain", "baseOverOutrunM", L.terrain.baseOverOutrunM),
  };
  const trees = readTrees(r, f);
  const supports = readSupports(r, f);
  const i = r.sub(f, "look", "inrun", KEYS.lookInrun);
  const inrun = {
    platformStartXM: r.num(i, "look.inrun", "platformStartXM", L.inrun.platformStartXM),
    nearWallUpPx: r.num(i, "look.inrun", "nearWallUpPx", L.inrun.nearWallPx),
    nearWallDownPx: r.num(i, "look.inrun", "nearWallDownPx", L.inrun.nearWallPx),
    wallColour: r.num(i, "look.inrun", "wallColour", L.inrun.wallColour),
    gateColour: r.num(i, "look.inrun", "gateColour", L.inrun.gateColour),
  };
  const m = r.sub(f, "look", "marks", KEYS.marks);
  const marks = {
    firstMarkM: r.num(m, "look.marks", "firstMarkM", L.marks.firstMarkM),
    markCount: r.num(m, "look.marks", "markCount", L.marks.markCount),
    fenceColour: r.num(m, "look.marks", "fenceColour", L.marks.fenceColour),
    fenceStartM: r.num(m, "look.marks", "fenceStartM", L.marks.fenceStartM),
  };
  return { skyRgb6, terrain, trees, supports, inrun, marks };
}

function readId(r: Reader, root: Fields): string {
  if (!root.has("id")) return "";
  const id = root.get("id");
  const L = HILL_SPEC_LIMITS.id;
  if (typeof id !== "string" || id.length < L.minLength || id.length > L.maxLength || !L.pattern.test(id)) {
    r.report("id", "id", "expected lower-case letters and digits in groups joined by hyphens, at most 40");
    return "";
  }
  return id;
}

/** The name in NFC, every character drawn by the picture's font; null when it is not such a name. */
function readName(r: Reader, root: Fields): string | null {
  if (!root.has("name")) return null;
  const raw = root.get("name");
  const L = HILL_SPEC_LIMITS.name;
  // A text longer than four code units per allowed character (room for a letter written with combining marks) is
  // rejected before it is normalised, which takes time in proportion to its length.
  const readable = typeof raw === "string" && raw.length <= L.maxLength * 4;
  const name = readable ? raw.normalize("NFC") : "";
  const characters = Array.from(name);
  const drawable = characters.every((ch) => !HIDDEN_CHARACTER.test(ch) && fontDraws(ch));
  if (!readable || characters.length < L.minLength || characters.length > L.maxLength || !drawable) {
    r.report("name", "name", "expected 1 to 24 characters the game's font can draw");
    return null;
  }
  return name;
}

/** Version check: a newer format is not read further, so it gives one problem only. */
function versionProblem(root: Fields): HillProblem | "newer" | null {
  const version = root.get("schemaVersion");
  if (typeof version === "number" && Number.isInteger(version) && version > HILL_SPEC_SCHEMA_VERSION) return "newer";
  return version === HILL_SPEC_SCHEMA_VERSION
    ? null
    : { rule: "format.version", path: "schemaVersion", message: `expected ${HILL_SPEC_SCHEMA_VERSION}` };
}

/**
 * Reads a hill from untrusted data (parsed JSON): every object is checked against its known keys, every number
 * against its limits, and the hill returned is built afresh from those fields only.
 */
export function parseHillSpec(input: unknown): HillSpecResult {
  const r = reader();
  const root = r.object(input, "", KEYS.root, ["schemaVersion"]);
  const version = versionProblem(root);
  if (version === "newer") {
    return {
      ok: false,
      problems: [{ rule: "format.newer-version", path: "schemaVersion", message: "made for a newer game" }],
    };
  }
  if (isPlainObject(input) && version !== null) r.problems.push(version);
  const id = readId(r, root);
  const name = readName(r, root);
  const kPointM = r.num(root, "", "kPointM", HILL_SPEC_LIMITS.kPointM);
  if (name !== null && Number.isInteger(kPointM)) {
    const width = textWidth(UI_TEXT.hillLabel(name, kPointM));
    if (width > HILL_TITLE_MAX_WIDTH_PX) {
      r.report("name-width", "name", `title ${width} px wide, at most ${HILL_TITLE_MAX_WIDTH_PX} px`);
    }
  }
  const profileFields = r.sub(root, "", "profile", KEYS.profile);
  const inrun = readInrun(r, profileFields);
  const landing = readLanding(r, profileFields, inrun.takeoffXM);
  const look = readLook(r, root);
  if (r.problems.length > 0) return { ok: false, problems: r.problems };
  return {
    ok: true,
    spec: { schemaVersion: HILL_SPEC_SCHEMA_VERSION, id, name: name ?? "", kPointM, profile: { inrun, landing }, look },
  };
}
