import { describe, expect, it } from "vitest";
import { PHASE } from "../sim/jump-logic";
import { createPlayerInput, leftTouchLeansOnly, mouseButtons } from "./player-input";

describe("player input", () => {
  it("hands the accumulated motion to one frame and clamps it like the original", () => {
    const input = createPlayerInput();
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
    const input = createPlayerInput();
    input.setButton("keys", "left", true);
    expect(input.takeFrame().left).toBe(true);
    expect(input.takeFrame().left).toBe(true);
  });

  it("turns held lean keys into motion every frame", () => {
    const input = createPlayerInput();
    input.setLeanKeys(-1);
    expect(input.takeFrame().dy).toBe(-6);
    expect(input.takeFrame().dy).toBe(-6);
  });

  it("reads both mouse buttons from the mask of held buttons", () => {
    expect(mouseButtons(0)).toEqual({ left: false, right: false });
    expect(mouseButtons(1)).toEqual({ left: true, right: false });
    expect(mouseButtons(2)).toEqual({ left: false, right: true });
    expect(mouseButtons(3)).toEqual({ left: true, right: true });
    // The middle button (4) is not a game button.
    expect(mouseButtons(4)).toEqual({ left: false, right: false });
    expect(mouseButtons(7)).toEqual({ left: true, right: true });
  });

  it("follows a chord of mouse buttons pressed and released one after another", () => {
    const input = createPlayerInput();
    // Left down, right down, left up, right up: the browser reports the held mask each time.
    input.setButtons("mouse", mouseButtons(1));
    input.setButtons("mouse", mouseButtons(3));
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.setButtons("mouse", mouseButtons(2));
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    input.setButtons("mouse", mouseButtons(0));
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
  });

  it("holds a button while any source holds it", () => {
    const input = createPlayerInput();
    input.setButton("keys", "left", true);
    input.setButtons("mouse", mouseButtons(0));
    expect(input.left).toBe(true);
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.setButton("keys", "left", false);
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
  });

  it("counts a press that began and ended between two frames for one frame", () => {
    const input = createPlayerInput();
    input.setButtons("mouse", mouseButtons(1));
    input.setButtons("mouse", mouseButtons(0));
    expect(input.left).toBe(false);
    expect(input.takeFrame()).toMatchObject({ left: true, right: false });
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
    input.setButton("keys", "right", true);
    input.setButton("keys", "right", false);
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
  });

  it("makes the left touch zone lean only in flight, from the hold after the take-off until the landing starts", () => {
    expect(leftTouchLeansOnly(PHASE.gate)).toBe(false);
    expect(leftTouchLeansOnly(PHASE.crouch)).toBe(false);
    expect(leftTouchLeansOnly(PHASE.takeoff)).toBe(false);
    expect(leftTouchLeansOnly(PHASE.afterTakeoff)).toBe(false);
    expect(leftTouchLeansOnly(PHASE.flightHold)).toBe(true);
    expect(leftTouchLeansOnly(PHASE.flight)).toBe(true);
    expect(leftTouchLeansOnly(PHASE.landingPrep)).toBe(false);
    expect(leftTouchLeansOnly(PHASE.outrun)).toBe(false);
  });

  it("does not press the left button for a touch while the left zone leans only", () => {
    const input = createPlayerInput();
    input.setLeftTouchLeansOnly(true);
    input.setButton("touch", "left", true);
    expect(input.left).toBe(false);
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
    // A tap shorter than a frame is not a press either.
    input.setButton("touch", "left", false);
    input.setButton("touch", "left", true);
    input.setButton("touch", "left", false);
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
    // The right zone, the keyboard and the mouse press as always.
    for (let frame = 0; frame < 10; frame++) input.takeFrame();
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    input.setButton("keys", "left", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
  });

  it("lets go of the left button for a finger that stays on the left zone when it turns to leaning only", () => {
    const input = createPlayerInput();
    input.setButton("touch", "left", true);
    expect(input.takeFrame()).toMatchObject({ left: true });
    input.setLeftTouchLeansOnly(true);
    expect(input.left).toBe(false);
    expect(input.takeFrame()).toMatchObject({ left: false });
  });

  it("presses the left button again only with a new touch once the left zone stops leaning only", () => {
    const input = createPlayerInput();
    input.setLeftTouchLeansOnly(true);
    input.setButton("touch", "left", true);
    input.setLeftTouchLeansOnly(false);
    // The finger that was leaning is still down: it must not turn into a press by itself.
    expect(input.takeFrame()).toMatchObject({ left: false });
    expect(input.takeFrame()).toMatchObject({ left: false });
    input.setButton("touch", "left", false);
    expect(input.takeFrame()).toMatchObject({ left: false });
    input.setButton("touch", "left", true);
    expect(input.takeFrame()).toMatchObject({ left: true });
    // With no finger down when leaning only ends, the next touch presses at once.
    input.reset();
    input.setLeftTouchLeansOnly(true);
    input.setLeftTouchLeansOnly(false);
    input.setButton("touch", "left", true);
    expect(input.takeFrame()).toMatchObject({ left: true });
  });

  it("counts the left zone touched together with the right one as both buttons, even while it leans only", () => {
    const input = createPlayerInput();
    input.setLeftTouchLeansOnly(true);
    // The same frame.
    input.setButton("touch", "left", true);
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.reset();
    // The left zone a few frames before the right one: fingers of two hands never land in the same frame.
    input.setLeftTouchLeansOnly(true);
    input.setButton("touch", "left", true);
    for (let frame = 0; frame < 5; frame++) expect(input.takeFrame()).toMatchObject({ left: false, right: false });
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.reset();
    // Two quick taps, both over before the frame is taken.
    input.setLeftTouchLeansOnly(true);
    input.setButton("touch", "left", true);
    input.setButton("touch", "left", false);
    input.setButton("touch", "right", true);
    input.setButton("touch", "right", false);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
  });

  it("does not take a finger that has been leaning on the left zone for a chord with the right one", () => {
    const input = createPlayerInput();
    input.setLeftTouchLeansOnly(true);
    input.setButton("touch", "left", true);
    for (let frame = 0; frame < 20; frame++) input.takeFrame();
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
  });

  it("forgets leaning only on a reset", () => {
    const input = createPlayerInput();
    input.setLeftTouchLeansOnly(true);
    input.reset();
    input.setButton("touch", "left", true);
    expect(input.takeFrame()).toMatchObject({ left: true });
  });

  it("lets go of everything a source held when that source is lost", () => {
    const input = createPlayerInput();
    input.setButtons("mouse", mouseButtons(3));
    input.setButton("keys", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.release("mouse");
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    input.reset();
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
  });
});
