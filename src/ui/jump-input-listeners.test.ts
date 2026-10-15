import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerInput } from "../game/player-input";
import { listenToPlayerInput } from "./jump-input-listeners";

/** The page as the listeners see it, without a browser: a window and a document that pass events on. */
let page: { window: EventTarget; document: EventTarget & { pointerLockElement: null } };

beforeEach(() => {
  page = { window: new EventTarget(), document: Object.assign(new EventTarget(), { pointerLockElement: null }) };
  vi.stubGlobal("window", page.window);
  vi.stubGlobal("document", page.document);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A key pressed or let go, as the browser reports it to the window. */
function key(type: "keydown" | "keyup", code: string): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), { code });
  page.window.dispatchEvent(event);
  return event;
}

function setUp(replaying: boolean, lastJump = false) {
  let captured = 0;
  const picture = Object.assign(new EventTarget(), {
    requestPointerLock: () => {
      captured++;
      return Promise.resolve();
    },
  });
  const input = createPlayerInput();
  const calls = { restart: 0, escape: 0, replayPress: 0, watchLast: 0, keepLast: 0 };
  const stop = listenToPlayerInput(picture, input, {
    paused: () => false,
    mouseGain: () => 1,
    restart: () => calls.restart++,
    escape: () => calls.escape++,
    replaying: () => replaying,
    replayPress: () => calls.replayPress++,
    hasLastJump: () => lastJump,
    watchLast: () => calls.watchLast++,
    keepLast: () => calls.keepLast++,
  });
  const pointer = (type: "pointerdown" | "pointermove", extra: Record<string, number>): void => {
    picture.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerType: "mouse", ...extra }));
  };
  return { input, calls, stop, pointer, captured: () => captured };
}

describe("player input on the jump screen", () => {
  it("takes the keys of the game while jumping", () => {
    const t = setUp(false);
    expect(key("keydown", "KeyZ").defaultPrevented).toBe(true);
    expect(t.input.left).toBe(true);
    key("keyup", "KeyZ");
    expect(t.input.left).toBe(false);
    key("keydown", "KeyR");
    expect(t.calls.restart).toBe(1);
    t.stop();
  });

  it("after a jump P watches it again and S keeps it", () => {
    const t = setUp(false, true);
    expect(key("keydown", "KeyP").defaultPrevented).toBe(true);
    expect(t.calls.watchLast).toBe(1);
    expect(key("keydown", "KeyS").defaultPrevented).toBe(true);
    expect(t.calls.keepLast).toBe(1);
    key("keyup", "KeyS");
    expect(t.calls.keepLast).toBe(1);
    t.stop();
  });

  it("without a finished jump P and S do nothing", () => {
    const t = setUp(false, false);
    expect(key("keydown", "KeyP").defaultPrevented).toBe(false);
    expect(key("keydown", "KeyS").defaultPrevented).toBe(false);
    expect(t.calls).toMatchObject({ watchLast: 0, keepLast: 0 });
    t.stop();
  });

  it("in a replay takes no hands: only R, Escape and keys let go still count", () => {
    const t = setUp(true);
    const z = key("keydown", "KeyZ");
    expect(z.defaultPrevented).toBe(false);
    expect(t.input.left).toBe(false);
    key("keydown", "ArrowDown");
    expect(t.input.takeFrame().dy).toBe(0);
    key("keydown", "KeyR");
    expect(t.calls.restart).toBe(1);
    key("keydown", "Escape");
    expect(t.calls.escape).toBe(1);
    key("keydown", "KeyP");
    key("keydown", "KeyS");
    expect(t.calls).toMatchObject({ watchLast: 0, keepLast: 0 });
    t.stop();
  });

  it("in a replay a press of the picture goes to the replay, and the mouse neither leans nor is captured", () => {
    const t = setUp(true);
    t.pointer("pointerdown", { buttons: 1 });
    expect(t.calls.replayPress).toBe(1);
    expect(t.captured()).toBe(0);
    expect(t.input.left).toBe(false);
    t.pointer("pointermove", { buttons: 0, movementY: 20 });
    expect(t.input.takeFrame().dy).toBe(0);
    t.stop();
  });

  it("while jumping a press captures the mouse and holds the button", () => {
    const t = setUp(false);
    t.pointer("pointerdown", { buttons: 1 });
    expect(t.captured()).toBe(1);
    expect(t.input.left).toBe(true);
    t.stop();
  });
});
