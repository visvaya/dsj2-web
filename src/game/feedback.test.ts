import { describe, expect, it } from "vitest";
import { makeBot } from "../sim/test-support/synthetic";
import { canVibrate, feedbackEvents, vibrate } from "./haptics";
import { OWN_HILLS } from "./hill-choice";
import { TILT_AT_REST, pitchDeg, requestTiltPermission, tiltStep } from "./tilt-input";
import { isJumpOver, startTrainingJump, stepTrainingJump } from "./training-session";

function run(landingHeightM: number | null): string[] {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  let jump = startTrainingJump(hill, 3);
  const bot = makeBot(
    hill.profile,
    { startFrame: 70, takeoffLeadM: 3, landingHeightM, leanPattern: () => 0 },
    () => jump.state,
  );
  const events: string[] = [];
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    const prev = jump.state;
    jump = stepTrainingJump(jump, bot(prev.logic.frame + 1));
    events.push(...feedbackEvents(prev, jump.state));
  }
  return events;
}

describe("haptic feedback", () => {
  it("reports start, takeoff and landing of a clean jump once each", () => {
    expect(run(2)).toEqual(["start", "takeoff", "landing"]);
  });

  it("reports a crash instead of a landing", () => {
    expect(run(null)).toEqual(["start", "takeoff", "crash"]);
  });

  it("knows whether the browser can vibrate", () => {
    expect(canVibrate({ vibrate: () => true })).toBe(true);
    expect(canVibrate({})).toBe(false);
  });

  it("vibrates only where the browser can", () => {
    const calls: number[][] = [];
    vibrate("crash", { vibrate: (p) => (calls.push(p), true) });
    vibrate("crash", {});
    expect(calls).toEqual([[90, 50, 140]]);
  });
});

describe("tilt steering", () => {
  it("reads the tilt towards and away from the player for the screen orientation", () => {
    expect(pitchDeg(30, 0, 0)).toBeCloseTo(30, 9);
    expect(pitchDeg(30, 0, 180)).toBeCloseTo(-30, 9);
    expect(pitchDeg(30, 10, 90)).toBeCloseTo(-10, 9);
    expect(pitchDeg(30, 10, 270)).toBeCloseTo(10, 9);
    expect(pitchDeg(null, 10, 0)).toBeNull();
  });

  it("keeps the angle continuous when a phone held sideways is tilted past upright", () => {
    // The browser reports the same turn as a jump of beta by 180 degrees and a folded gamma.
    const before = pitchDeg(0, 85, 90);
    const after = pitchDeg(180, -85, 90);
    expect(before).toBeCloseTo(-85, 9);
    expect(after).toBeCloseTo(-95, 9);
  });

  it("leans by as much as the phone has turned since the last frame, like a moving mouse", () => {
    // The first reading only sets where the phone is.
    const first = tiltStep(TILT_AT_REST, 40);
    expect(first.motion).toBe(0);
    // One degree is a little over three steps of the mouse; the rest is carried to the next frame.
    const second = tiltStep(first.state, 41);
    expect(second.motion).toBe(3);
    // A phone held still does not lean, however far from its first angle it is.
    expect(tiltStep(second.state, 41).motion).toBe(0);
    // Turning back leans back.
    expect(tiltStep(second.state, 39).motion).toBe(-6);
  });

  it("does not lose a slow tilt: fractions of a step add up over the frames", () => {
    let state = tiltStep(TILT_AT_REST, 10).state;
    let total = 0;
    for (let frame = 1; frame <= 20; frame++) {
      const step = tiltStep(state, 10 + frame * 0.1);
      state = step.state;
      total += step.motion;
    }
    // Two degrees in all, at a tenth of a degree a frame.
    expect(total).toBe(6);
  });

  it("follows the short way round when the angle wraps", () => {
    const state = tiltStep(TILT_AT_REST, 179).state;
    expect(tiltStep(state, -179).motion).toBe(6);
  });

  it("asks for permission only where required", async () => {
    expect(await requestTiltPermission(function DeviceOrientationEvent() {})).toBe(true);
    const ios = Object.assign(function DeviceOrientationEvent() {}, {
      requestPermission: () => Promise.resolve("denied"),
    });
    expect(await requestTiltPermission(ios)).toBe(false);
    expect(await requestTiltPermission(undefined)).toBe(false);
  });
});
