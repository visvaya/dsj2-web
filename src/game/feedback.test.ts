import { describe, expect, it } from "vitest";
import { makeBot } from "../sim/test-support/synthetic";
import { feedbackEvents, vibrate } from "./haptics";
import { OWN_HILLS } from "./hill-choice";
import { pitchDeg, requestTiltPermission, tiltMotion } from "./tilt-input";
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
    expect(run(2.5)).toEqual(["start", "takeoff", "landing"]);
  });

  it("reports a crash instead of a landing", () => {
    expect(run(null)).toEqual(["start", "takeoff", "crash"]);
  });

  it("vibrates only where the browser can", () => {
    const calls: number[][] = [];
    vibrate("crash", { vibrate: (p) => (calls.push(p), true) });
    vibrate("crash", {});
    expect(calls).toEqual([[90, 50, 140]]);
  });
});

describe("tilt steering", () => {
  it("maps the tilt axis to the screen orientation", () => {
    expect(pitchDeg(30, 10, 0)).toBe(30);
    expect(pitchDeg(30, 10, 90)).toBe(-10);
    expect(pitchDeg(30, 10, 270)).toBe(10);
    expect(pitchDeg(null, 10, 0)).toBeNull();
  });

  it("ignores small tilts and limits large ones", () => {
    expect(tiltMotion(42, 40)).toBe(0);
    expect(tiltMotion(50, 40)).toBe(11);
    expect(tiltMotion(-60, 40)).toBe(-60);
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
