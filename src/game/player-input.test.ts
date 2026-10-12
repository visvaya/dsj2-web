import { describe, expect, it } from "vitest";
import { PlayerInput, mouseButtons } from "./player-input";

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
    input.setButton("keys", "left", true);
    expect(input.takeFrame().left).toBe(true);
    expect(input.takeFrame().left).toBe(true);
  });

  it("turns held lean keys into motion every frame", () => {
    const input = new PlayerInput();
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
    const input = new PlayerInput();
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
    const input = new PlayerInput();
    input.setButton("keys", "left", true);
    input.setButtons("mouse", mouseButtons(0));
    expect(input.left).toBe(true);
    input.setButton("touch", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.setButton("keys", "left", false);
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
  });

  it("counts a press that began and ended between two frames for one frame", () => {
    const input = new PlayerInput();
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

  it("lets go of everything a source held when that source is lost", () => {
    const input = new PlayerInput();
    input.setButtons("mouse", mouseButtons(3));
    input.setButton("keys", "right", true);
    expect(input.takeFrame()).toMatchObject({ left: true, right: true });
    input.release("mouse");
    expect(input.takeFrame()).toMatchObject({ left: false, right: true });
    input.reset();
    expect(input.takeFrame()).toMatchObject({ left: false, right: false });
  });
});
