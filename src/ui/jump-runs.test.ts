import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundEngine } from "../audio/sound-engine";
import { OWN_HILLS } from "../game/hill-choice";
import type { PlayerInput } from "../game/player-input";
import type { FrameInput } from "../sim/jump-logic";
import { DEFAULT_SETTINGS } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import type { ReplayView } from "./jump-replay";
import type { JumpResult } from "./jump-round";
import { createRunSwitch, type RunContext } from "./jump-runs";
import type { JumpSounds } from "./jump-sounds";

const felt = vi.hoisted(() => [] as string[]);
vi.mock("../game/haptics", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, vibrate: (event: string) => felt.push(event) };
});

const hill = OWN_HILLS[0];
const MAX_FRAMES = 4000;

/** Hands on a script by simulation frame: the press from the gate, then both buttons for the landing. */
const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: 0,
});

const noop = () => undefined;

/** The player's input as the runs read it, following the script frame by frame. */
function scriptedInput(): PlayerInput {
  let frame = 0;
  return {
    get left() {
      return false;
    },
    get right() {
      return false;
    },
    setButton: noop,
    setButtons: noop,
    setLeftTouchLeansOnly: noop,
    setRightTouchIsBothButtons: noop,
    release: noop,
    addMotion: noop,
    setLeanKeys: noop,
    takeFrame: () => handsAt(++frame),
    reset: () => {
      frame = 0;
    },
  };
}

const silentSounds: JumpSounds = { play: () => undefined, hush: () => undefined, reset: () => undefined };

function setUp() {
  if (!hill) throw new Error("no hill");
  const finished: JumpResult[] = [];
  const heard: string[] = [];
  const played: string[] = [];
  let replay: ReplayView | null = null;
  let available = false;
  const engine: SoundEngine = {
    prepare: noop,
    unlock: noop,
    setEnabled: noop,
    setHidden: noop,
    update: noop,
    play: (cue) => {
      played.push(cue);
    },
    dispose: noop,
  };
  const context: RunContext = {
    live: {
      onFinished: (result) => finished.push(result),
      record: undefined,
      settings: { ...DEFAULT_SETTINGS, vibration: true },
      controls: "mouse",
      scenery: { lighting: "day", snowfall: false, fog: false },
      replay: null,
    },
    inputRef: { current: scriptedInput() },
    resetHands: () => context.inputRef.current.reset(),
    soundRef: { current: engine },
    announce: (text) => heard.push(text),
    onReplayAvailable: (value) => {
      available = value;
    },
    onReplayChange: (view) => {
      replay = view;
      context.live = { ...context.live, replay };
    },
  };
  const runs = createRunSwitch(
    hill,
    () => context,
    silentSounds,
    () => undefined,
  );
  const playOut = () => {
    for (let f = 0; f < MAX_FRAMES; f++) {
      const run = runs.current();
      run.step(2);
      if (run.settle().over) return run.now().jump;
    }
    throw new Error("the jump never ended");
  };
  return { runs, finished, heard, played, playOut, available: () => available, replay: () => replay };
}

describe("training and its replay", () => {
  beforeEach(() => {
    felt.length = 0;
  });

  it("plays the last jump again to the same end, heard but not felt and not scored again", () => {
    const t = setUp();
    expect(t.available()).toBe(false);
    const live = t.playOut();
    expect(t.finished).toHaveLength(1);
    expect(t.available()).toBe(true);
    const feltLive = [...felt];
    expect(feltLive).toContain("start");
    const playedLive = [...t.played];

    felt.length = 0;
    t.played.length = 0;
    t.runs.controls.watchReplay();
    expect(t.replay()).toEqual({ speed: 1, paused: false });
    expect(t.heard.at(-1)).toBe(UI_TEXT.announcement.replayStarted);
    const again = t.playOut();
    expect(again.state).toEqual(live.state);
    expect(felt).toEqual([]);
    expect(t.played).toEqual(playedLive);
    expect(t.finished).toHaveLength(1);
  });

  it("pauses on a press, and once over leaves for a new training jump", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: true });
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: false });
    t.playOut();
    // Let the notes come up: the replay is over when a press may start a new jump.
    for (let f = 0; f < 1000 && t.replay() !== null; f++) {
      t.runs.current().step(1);
      t.runs.current().settle();
      t.runs.press();
      if (t.replay()?.paused === true) t.runs.press();
    }
    expect(t.replay()).toBeNull();
    expect(t.runs.replaying()).toBe(false);
    expect(t.runs.current().now().jump.state.logic.frame).toBe(1);
  });

  it("plays again from its start when asked while paused", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.runs.current().step(200);
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: true });
    t.runs.controls.restart();
    expect(t.replay()).toEqual({ speed: 1, paused: false });
    expect(t.runs.current().now().jump.state.logic.frame).toBe(1);
  });

  it("has nothing to play before the first jump has ended", () => {
    const t = setUp();
    t.runs.controls.watchReplay();
    expect(t.runs.replaying()).toBe(false);
    expect(t.replay()).toBeNull();
  });
});
