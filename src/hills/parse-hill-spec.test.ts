import { describe, expect, it } from "vitest";
import type { HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";
import { parseHillSpec } from "./parse-hill-spec";

const base = (): HillSpec => {
  const spec = OWN_HILL_SPECS[0];
  if (spec === undefined) throw new Error("no own hill");
  return spec;
};

/** A deep copy as a plain JSON value, to be broken by the test. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected an object");
  return value;
}

const json = (): Record<string, unknown> => record(JSON.parse(JSON.stringify(base())));

/** The object holding the last key of a dotted path in a JSON copy, and that key. */
function parentOf(root: Record<string, unknown>, path: string): [Record<string, unknown>, string] {
  const keys = path.split(".");
  const last = keys.pop() ?? "";
  const parent = keys.reduce((node, key) => record(node[key]), root);
  return [parent, last];
}

/** Sets a value in a JSON copy made by the test (the copy is the test's own, made to be broken). */
function set(root: Record<string, unknown>, path: string, value: unknown): void {
  const [parent, key] = parentOf(root, path);
  Object.defineProperty(parent, key, { value, enumerable: true, writable: true, configurable: true });
}

function remove(root: Record<string, unknown>, path: string): void {
  const [parent, key] = parentOf(root, path);
  Reflect.deleteProperty(parent, key);
}

function rulesOf(input: unknown): string[] {
  const result = parseHillSpec(input);
  return result.ok ? [] : result.problems.map((p) => `${p.rule} ${p.path}`);
}

describe("hill spec parser", () => {
  it("returns a valid spec unchanged after a JSON round trip, as a new object", () => {
    const input = json();
    const result = parseHillSpec(input);
    expect(result).toEqual({ ok: true, spec: base() });
    expect(result.ok && result.spec).not.toBe(input);
    expect(result.ok && result.spec.profile).not.toBe(input["profile"]);
  });

  it("reports an unknown key", () => {
    const input = json();
    set(input, "profile.inrun.extra", 1);
    expect(rulesOf(input)).toEqual(["format.unknown-key profile.inrun.extra"]);
  });

  it("reports a __proto__ key in JSON text instead of dropping or applying it", () => {
    const text = JSON.stringify(base()).replace('"kPointM"', '"__proto__":{"polluted":1},"kPointM"');
    const input: unknown = JSON.parse(text);
    expect(rulesOf(input)).toEqual(["format.unknown-key __proto__"]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("reports constructor and prototype keys", () => {
    const input = json();
    set(input, "look.constructor", 1);
    set(input, "look.marks.prototype", 1);
    expect(rulesOf(input)).toEqual(["format.unknown-key look.constructor", "format.unknown-key look.marks.prototype"]);
  });

  it("reports a missing key", () => {
    const input = json();
    remove(input, "profile.landing.widthM");
    expect(rulesOf(input)).toEqual(["format.missing-key profile.landing.widthM"]);
  });

  it("reports a string instead of a number", () => {
    const input = json();
    set(input, "profile.inrun.curveA", "0.02");
    expect(rulesOf(input)).toEqual(["format.number profile.inrun.curveA"]);
  });

  it("reports NaN and Infinity", () => {
    const input = json();
    set(input, "profile.inrun.curveA", Number.NaN);
    set(input, "profile.landing.widthM", Number.POSITIVE_INFINITY);
    expect(rulesOf(input)).toEqual(["format.number profile.inrun.curveA", "format.number profile.landing.widthM"]);
  });

  it("reports a fraction where a whole number is needed", () => {
    const input = json();
    set(input, "kPointM", 90.5);
    expect(rulesOf(input)).toEqual(["format.integer kPointM"]);
  });

  it("reports a number out of range", () => {
    const input = json();
    set(input, "look.terrain.seed", 70000);
    expect(rulesOf(input)).toEqual(["format.range look.terrain.seed"]);
  });

  it("reports parts of the inrun in the wrong order", () => {
    const input = json();
    set(input, "profile.inrun.flatEndXM", 12);
    expect(rulesOf(input)).toEqual(["format.order profile.inrun.flatEndXM"]);
  });

  it("reports an outrun that starts too close to the takeoff", () => {
    const input = json();
    set(input, "profile.landing.outrunStartXM", 60);
    expect(rulesOf(input)).toEqual(["format.order profile.landing.outrunStartXM"]);
  });

  it("reports too many hidden trees and a tree range in the wrong order", () => {
    const input = json();
    set(
      input,
      "look.trees.hidden",
      Array.from({ length: 9 }, () => ({ layer: 1, first: 1, last: 2 })),
    );
    set(input, "look.trees.toXM", 10);
    expect(rulesOf(input)).toEqual(["format.count look.trees.hidden", "format.order look.trees.toXM"]);
  });

  it("reports an array where an object belongs and an object where an array belongs", () => {
    const input = json();
    set(input, "look.terrain", []);
    set(input, "look.supports", {});
    expect(rulesOf(input)).toEqual(["format.object look.terrain", "format.array look.supports"]);
  });

  it("reports a newer schema version once, and a missing one", () => {
    expect(rulesOf({ ...json(), schemaVersion: 2 })).toEqual(["format.newer-version schemaVersion"]);
    const input = json();
    remove(input, "schemaVersion");
    expect(rulesOf(input)).toEqual(["format.version schemaVersion"]);
    expect(rulesOf({ ...json(), schemaVersion: "1" })).toEqual(["format.version schemaVersion"]);
  });

  it("reports a bad id", () => {
    expect(rulesOf({ ...json(), id: "Own 2" })).toEqual(["format.id id"]);
    expect(rulesOf({ ...json(), id: "a".repeat(41) })).toEqual(["format.id id"]);
  });

  it("normalises the name to NFC", () => {
    const result = parseHillSpec({ ...json(), name: "C\u0301wiczebna" });
    expect(result.ok && result.spec.name).toBe("Ćwiczebna");
  });

  it.each([
    ["a bidi control", "Skocznia\u202E"],
    ["a zero-width space", "Skocz\u200Bnia"],
    ["a control character", "Skocz\u0007nia"],
    ["a character the font cannot draw", "Skocznia \u2603"],
    ["nothing", ""],
  ])("reports a name with %s", (_what, name) => {
    expect(rulesOf({ ...json(), name })).toEqual(["format.name name"]);
  });

  it("reports a name too wide for the title of the jump picture", () => {
    expect(rulesOf({ ...json(), name: "WWWWWWWWWWWWWWWWWWWW" })).toEqual(["format.name-width name"]);
  });

  it("reports every problem of one input", () => {
    const input = json();
    set(input, "extra", true);
    set(input, "kPointM", 500);
    set(input, "look.inrun.gateColour", 255);
    remove(input, "look.marks.markCount");
    expect(rulesOf(input)).toEqual([
      "format.unknown-key extra",
      "format.range kPointM",
      "format.range look.inrun.gateColour",
      "format.missing-key look.marks.markCount",
    ]);
  });

  it("rejects input that is not an object", () => {
    expect(rulesOf(null)).toEqual(["format.object "]);
    expect(rulesOf([])).toEqual(["format.object "]);
    expect(rulesOf(Object.create({ schemaVersion: 1 }))).toEqual(["format.object "]);
  });
});
