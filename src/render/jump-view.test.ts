import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor } from "./jump-view";
import { color } from "./palette";

function fnv(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16);
}

describe("jump view", () => {
  it("fits the logical width to the screen with square pixels", () => {
    expect(viewWidthFor(1920, 1080)).toBe(356);
    expect(viewWidthFor(1280, 800)).toBe(320);
    expect(viewWidthFor(2400, 1080)).toBe(432);
    expect(viewWidthFor(390, 844)).toBe(256);
    expect(viewWidthFor(0, 0)).toBe(356);
  });

  it("draws every phase of a jump without leaving unpainted pixels, the same way each time", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const render = () => {
      const jump = startTrainingJump(hill, 7);
      const bot = makeBot(hill.profile, { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 }, () => jump.state);
      const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
      const hashes: string[] = [];
      let unpainted = 0;
      // Past the end of the jump too, while the judges' notes appear.
      for (let f = 0; f < 3000 && jump.framesAfterEnd < 200; f++) {
        stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
        const frame = presentationFrame(jump);
        if (frame % 100 === 0) {
          fb.pixels.fill(0);
          drawJumpView(fb, {
            profile: hill.profile,
            kPointM: hill.kPointM,
            hillName: hill.name,
            playerName: "GRACZ 1",
            state: jump.state,
            controls: "touch",
            frame,
            over: isJumpOver(jump),
            recordM: 80,
            newRecord: true,
          });
          unpainted += fb.pixels.filter((p) => p === 0).length;
          hashes.push(fnv(fb.bytes));
        }
      }
      return { hashes, unpainted };
    };
    const first = render();
    expect(first.hashes.length).toBeGreaterThan(5);
    expect(first.unpainted).toBe(0);
    expect(render()).toEqual(first);
  });

  it("shows no judges' notes after a disqualification", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    // Nobody presses start: the countdown runs out and the jump is disqualified.
    const jump = startTrainingJump(hill, 5);
    for (let f = 0; f < 3000 && jump.framesAfterEnd < 50; f++) stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.finished).toBe(true);
    expect(jump.state.logic.distanceM).toBe(0);
    const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
    const model = { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1", state: jump.state };
    drawJumpView(fb, { ...model, controls: "mouse", frame: presentationFrame(jump), over: true });
    expect(fb.pixels.includes(color("noteBox"))).toBe(false);
  });
});
