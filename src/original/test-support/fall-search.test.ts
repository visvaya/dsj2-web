import { describe, expect, it } from "vitest";
import { createJump, jumpRunning, stepFrame } from "../../sim/jump-sim";
import { planInputSource } from "../../sim/test-support/replay-plan";
import { syntheticHill } from "../../sim/test-support/synthetic";
import { FALL_TYPES, formatFallSearch, inputPatterns, searchFalls } from "./fall-search";
import { HILL_PLAN, hillSetup, type PlannedHill } from "./hill-plans";

const HILL: PlannedHill = { number: 9, name: "Made up", kPointM: 90, profile: syntheticHill() };

// Every ninth pattern keeps the test short and still mixes takeoffs, leans and landings.
const PATTERNS = inputPatterns().filter((_, index) => index % 9 === 0);

describe("input patterns of the fall search", () => {
  it("have distinct names and include a jumper that never starts", () => {
    const names = inputPatterns().map((pattern) => pattern.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(8 * 4 * 8 + 1);
    expect(inputPatterns().at(-1)?.script.startFrame).toBeNull();
  });
});

describe("fall search on a made-up hill", () => {
  const search = searchFalls([HILL], PATTERNS);

  it("accounts for every jump", () => {
    expect(search.jumps).toBe(PATTERNS.length);
    expect(search.summaries.map((summary) => summary.fallType)).toEqual([0, ...FALL_TYPES]);
    expect(search.summaries.reduce((sum, summary) => sum + summary.jumps, 0)).toBe(search.jumps - search.unplannable);
    for (const summary of search.summaries) {
      expect(summary.pastEdge).toBeLessThanOrEqual(summary.jumps);
      expect(summary.hills).toBe(summary.jumps > 0 ? 1 : 0);
    }
  });

  it("finds clean landings and more than one kind of fall", () => {
    const reached = search.summaries.filter((summary) => summary.jumps > 0).map((summary) => summary.fallType);
    expect(reached).toContain(0);
    expect(reached.filter((fallType) => fallType > 0).length).toBeGreaterThan(1);
  });

  it("gives each kind it reached a plan that falls that way when replayed", () => {
    const examples = search.summaries.flatMap((summary) => (summary.example === null ? [] : [summary.example]));
    expect(examples.length).toBeGreaterThan(1);
    for (const example of examples) {
      const setup = hillSetup(HILL, HILL_PLAN.SEED_BASE + HILL.number);
      const input = planInputSource(example.plan);
      let state = createJump(setup);
      for (let guard = 0; guard < 6000 && jumpRunning(state); guard++) {
        state = stepFrame(state, setup, input);
      }
      expect(example.name).toBe(`FALL${state.logic.fallType}`);
      expect(example.expected).toMatchObject({ fallType: state.logic.fallType, distanceM: state.logic.distanceM });
      expect(example.hill).toEqual({ number: 9, name: "Made up", kPointM: 90 });
    }
  });

  it("has no example for clean landings or for kinds it did not reach", () => {
    for (const summary of search.summaries) {
      expect(summary.example === null).toBe(summary.fallType === 0 || summary.jumps === 0);
    }
  });

  it("prints one line per kind under a line of totals", () => {
    const lines = formatFallSearch(search).split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe(`${PATTERNS.length} jumps, ${search.unplannable} with input a replay cannot hold`);
    expect(lines[1]).toMatch(/^no fall: \d+ jumps \(\d+ past the edge\) on 1 hills, \d+ patterns$/);
    search.summaries.slice(1).forEach((summary, i) => {
      const line = lines[i + 2] ?? "";
      const want = summary.jumps === 0 ? /: not reached$/ : /FALL\d: hill 9 \(Made up, K90\), .+, \d+\.\d\d m$/;
      expect(line.startsWith(`fall type ${summary.fallType}: `)).toBe(true);
      expect(line).toMatch(want);
    });
  });

  it("says so when a kind is never reached", () => {
    const none = searchFalls([HILL], inputPatterns().slice(-1));
    expect(none.summaries.find((summary) => summary.fallType === 0)?.jumps).toBe(1);
    expect(formatFallSearch(none)).toContain("fall type 5: not reached");
  });
});
