import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { bestTakeoffAim, EXACT_PLAYER_LEVEL, PLAYER_LEVELS, playJump, randomJump } from "./hill-players";
import { PLAY_RULES } from "./hill-play";

const [training] = OWN_HILLS;
if (training === undefined) throw new Error("no own hill");

describe("hill players", () => {
  it.each(OWN_HILLS.map((h) => [h.id, h] as const))("plays %s the same way twice", (_, hill) => {
    const once = playJump(hill, 5, PLAYER_LEVELS.average, 9);
    expect(playJump(hill, 5, PLAYER_LEVELS.average, 9).finalHash).toBe(once.finalHash);
    expect(playJump(hill, 6, PLAYER_LEVELS.average, 9).finalHash).not.toBe(once.finalHash);
    expect(randomJump(hill, 5, 9).finalHash).toBe(randomJump(hill, 5, 9).finalHash);
  });

  it("lands an exact good player at the sweep's best aim within 1 m of the best", () => {
    const [sweep] = bestTakeoffAim(training, [3], PLAY_RULES.windowToleranceM);
    if (sweep === undefined) throw new Error("no sweep");
    const jump = playJump(training, 3, EXACT_PLAYER_LEVEL, 3, sweep.bestAimFrames);
    expect(Math.abs(jump.distanceM - sweep.bestDistanceM)).toBeLessThanOrEqual(1);
    expect(jump.fell).toBe(false);
    expect(sweep.windowFrames).toBeGreaterThanOrEqual(PLAY_RULES.windowMinFrames);
  });

  it("lets the weak player fall sometimes, so the levels differ", () => {
    const jumps = Array.from({ length: 16 }, (_, i) => playJump(training, i + 1, PLAYER_LEVELS.weak, i + 100));
    const falls = jumps.filter((o) => o.fell || o.disqualified).length;
    expect(falls).toBeGreaterThan(0);
    expect(falls).toBeLessThan(jumps.length);
  });

  it("measures a whole jump with finite numbers", () => {
    const o = playJump(training, 1, PLAYER_LEVELS.good, 1);
    expect(o.ended).toBe(true);
    expect(o.finite).toBe(true);
    expect(o.takeoffSpeedKmPerH).toBeGreaterThan(0);
    expect(o.flightTimeS).toBeGreaterThan(0);
    expect(o.highestAboveTerrainM).toBeGreaterThan(0);
    expect(o.landingImpactMPerS).toBeGreaterThan(0);
  });
});
