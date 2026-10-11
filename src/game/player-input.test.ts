import { describe, expect, it } from "vitest";
import { PlayerInput } from "./player-input";

describe("player input", () => {
  it("hands the accumulated motion to one frame and clamps it like the original", () => {
    const input = new PlayerInput();
    input.addMotion(10);
    input.addMotion(5.4);
    expect(input.takeFrame()).toEqual({ left: false, right: false, dy: 15 });
    expect(input.takeFrame().dy).toBe(0);
    input.addMotion(-500);
    expect(input.takeFrame().dy).toBe(-128);
    input.addMotion(500);
    expect(input.takeFrame().dy).toBe(127);
  });

  it("keeps the held button state across frames", () => {
    const input = new PlayerInput();
    input.left = true;
    expect(input.takeFrame().left).toBe(true);
    expect(input.takeFrame().left).toBe(true);
  });

  it("turns held lean keys into motion every frame", () => {
    const input = new PlayerInput();
    input.setLeanKeys(-1);
    expect(input.takeFrame().dy).toBe(-6);
    expect(input.takeFrame().dy).toBe(-6);
  });
});
