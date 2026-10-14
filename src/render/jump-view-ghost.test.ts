import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { FrameBuffer } from "./frame-buffer";
import { drawJumpView, type JumpViewModel } from "./jump-view";
import { drawGhost } from "./jump-view-ghost";
import { color } from "./palette";

const hill = OWN_HILLS[0];

/** A jump some frames down the inrun: pressed off the gate at once, then no hands. */
function jumpAt(frames: number): TrainingJump {
  if (!hill) throw new Error("no hill");
  let jump = startTrainingJump(hill, 3);
  for (let f = 1; f <= frames; f++) jump = stepTrainingJump(jump, { left: f === 70, right: false, dy: 0 });
  return jump;
}

const red = (pixel: number) => pixel & 0xff;
const blue = (pixel: number) => (pixel >>> 16) & 0xff;

describe("the ghost of the record", () => {
  it("tints the snow it covers bluish white", () => {
    if (!hill) throw new Error("no hill");
    const ghost = jumpAt(160).state;
    const fb = new FrameBuffer(320, 200);
    const snow = color("snow1");
    fb.rect(0, 0, fb.width, fb.height, snow);
    drawGhost(fb, hill.profile, ghost, { x: ghost.jumper.xM, y: ghost.jumper.yM, cx: 160, cy: 100 });
    const tinted = fb.pixels.filter((p) => p !== snow);
    expect(tinted.length).toBeGreaterThan(30);
    // Every pixel it covers is bluer than it is red.
    for (const p of tinted) expect(blue(p) - red(p)).toBeGreaterThan(20);
  });

  it("covers a small part of the picture and leaves nothing behind for the next frame", () => {
    if (!hill) throw new Error("no hill");
    const player = jumpAt(160);
    const model: JumpViewModel = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: player.state,
      controls: "mouse",
      frame: player.state.logic.frame,
      over: false,
    };
    const plain = new FrameBuffer(320, 200);
    drawJumpView(plain, model);
    // The ghost a little ahead of the player, on the same camera.
    const ghosted = new FrameBuffer(320, 200);
    drawJumpView(ghosted, { ...model, ghost: jumpAt(180).state });
    const changed = [...ghosted.pixels.keys()].filter((i) => ghosted.pixels[i] !== plain.pixels[i]);
    expect(changed.length).toBeGreaterThan(30);
    expect(changed.length).toBeLessThan(1500);
    const again = new FrameBuffer(320, 200);
    drawJumpView(again, { ...model, ghost: jumpAt(180).state });
    expect(again.pixels).toEqual(ghosted.pixels);
    drawJumpView(again, model);
    expect(again.pixels).toEqual(plain.pixels);
  });
});
