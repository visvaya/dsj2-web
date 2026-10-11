import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { makeBot } from "../sim/test-support/synthetic";
import { notesAppearing, soundMix, type MixInput } from "./sound-mix";

const base: MixInput = { airborne: false, groundSpeedMPerS: 0, airSpeedMPerS: 0, windMPerS: 0, paused: false };

describe("sound mix", () => {
  it("lets the skis hiss louder and higher with speed, only on the ground", () => {
    const slow = soundMix({ ...base, groundSpeedMPerS: 8 });
    const fast = soundMix({ ...base, groundSpeedMPerS: 24 });
    expect(soundMix(base).skis.gain).toBe(0);
    expect(fast.skis.gain).toBeGreaterThan(slow.skis.gain);
    expect(fast.skis.freqHz).toBeGreaterThan(slow.skis.freqHz);
    expect(soundMix({ ...base, airborne: true, groundSpeedMPerS: 24 }).skis.gain).toBe(0);
  });

  it("brings in the rushing air in flight and keeps a faint wind that grows with the wind", () => {
    const flying = soundMix({ ...base, airborne: true, airSpeedMPerS: 25 });
    expect(flying.air.gain).toBeGreaterThan(0);
    expect(soundMix(base).air.gain).toBe(0);
    expect(soundMix({ ...base, windMPerS: 4 }).wind.gain).toBeGreaterThan(soundMix(base).wind.gain);
    expect(soundMix(base).wind.gain).toBeGreaterThan(0);
  });

  it("goes quiet when paused", () => {
    const mix = soundMix({ ...base, airborne: true, airSpeedMPerS: 25, windMPerS: 4, paused: true });
    expect([mix.skis.gain, mix.air.gain, mix.wind.gain]).toEqual([0, 0, 0]);
  });

  it("reports each judge's note once, in the frame it appears", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 7);
    const bot = makeBot(hill.profile, { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 }, () => jump.state);
    let heard = 0;
    let counted = 0;
    let clock = presentationFrame(jump);
    for (let f = 0; f < 4000 && jump.framesAfterEnd < 300; f++) {
      stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
      const next = presentationFrame(jump);
      for (const note of notesAppearing(jump.state.logic, clock, next)) {
        heard++;
        if (note.counted) counted++;
      }
      clock = next;
    }
    expect(isJumpOver(jump)).toBe(true);
    expect(heard).toBe(5);
    expect(counted).toBe(3);
  });
});
