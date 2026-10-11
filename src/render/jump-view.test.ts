import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor } from "./jump-view";

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
      for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
        stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
        if (jump.state.logic.frame % 100 === 0 || isJumpOver(jump)) {
          fb.pixels.fill(0);
          drawJumpView(fb, { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1", state: jump.state });
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
});
