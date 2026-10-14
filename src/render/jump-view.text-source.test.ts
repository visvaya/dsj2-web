import { describe, expect, it, vi } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import {
  isJumpOver,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  stepTrainingJump,
} from "../game/training-session";
import { notesShownBy, type FrameInput } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { makeBot } from "../sim/test-support/synthetic";
import { UI_TEXT } from "../text/ui-text";
import { FrameBuffer } from "./frame-buffer";
import { drawJumpView, VIEW_HEIGHT_PX } from "./jump-view";
import { prompt } from "./jump-view-hud";
import type { ControlScheme } from "./jump-view-model";
import type { drawText } from "./pixel-font";

/**
 * Every text drawn into the picture of the jump must come from the text module. The module is replaced by a
 * pseudo-language that wraps each of its texts in brackets, and every string handed to drawText is recorded:
 * one without the brackets was typed into the drawing code. Numbers (wind, notes, points) are the only exception.
 */
/** Each text of the module in brackets; a text with a value in it is wrapped after the value is put in. */
function pseudo(value: unknown): unknown {
  if (typeof value === "string") return `[${value}]`;
  if (typeof value === "function") {
    return (...args: unknown[]) => {
      const text: unknown = Reflect.apply(value, undefined, args);
      return `[${String(text)}]`;
    };
  }
  if (Array.isArray(value)) return value.map(pseudo);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, pseudo(inner)]));
  }
  return value;
}

const drawn = vi.hoisted(() => new Set<string>());

vi.mock("../text/ui-text", async (importOriginal) => {
  const actual = await importOriginal<{ UI_TEXT: typeof UI_TEXT }>();
  return { UI_TEXT: pseudo(actual.UI_TEXT) };
});

vi.mock("./pixel-font", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { drawText: typeof drawText }>();
  return {
    ...actual,
    drawText: (...args: Parameters<typeof drawText>) => {
      drawn.add(args[3]);
      return actual.drawText(...args);
    },
  };
});

const FROM_MODULE = /^\[.*\]$/s;
const NUMBER = /^-?\d+(\.\d+)?$/;
/**
 * A frame is drawn whenever what the HUD says may change: the phase, the scoring, the notes, the prompts. Drawing
 * every frame would take minutes under coverage; the numbers (speed, distance) are sampled now and then.
 */
const SAMPLE_EVERY_FRAMES = 200;
const TIMEOUT_MS = 60_000;

const hill = OWN_HILLS[0];

/** The input of each frame, given a way to read the state of the jump as it is now. */
type Player = (current: () => JumpSimState) => (frame: number) => FrameInput;

const botPlayer =
  (landingHeightM: number | null): Player =>
  (current) => {
    if (!hill) throw new Error("no hill");
    return makeBot(hill.profile, { startFrame: 70, takeoffLeadM: 3, landingHeightM, leanPattern: () => 0 }, current);
  };

/** Nobody presses start: the countdown runs out and the jump is disqualified. */
const idlePlayer: Player = () => () => ({ left: false, right: false, dy: 0 });

function drawJump(controls: ControlScheme, seed: number, player: Player): void {
  if (!hill) throw new Error("no hill");
  let jump = startTrainingJump(hill, seed);
  const input = player(() => jump.state);
  const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
  let shownBefore = "";
  for (let f = 0; f < 4000 && jump.framesAfterEnd < 300; f++) {
    jump = stepTrainingJump(jump, input(jump.state.logic.frame + 1));
    const frame = presentationFrame(jump);
    const model = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: UI_TEXT.hud.playerName,
      state: jump.state,
      controls,
      hints: true,
      frame,
      over: isJumpOver(jump),
      recordM: 80,
      newRecord: true,
    };
    const { logic } = jump.state;
    const shown = [
      logic.phase,
      logic.finished,
      notesShownBy(logic, frame),
      ...prompt(model, nextJumpAllowed(logic, frame)),
    ].join("|");
    if (shown === shownBefore && frame % SAMPLE_EVERY_FRAMES !== 0) continue;
    shownBefore = shown;
    drawJumpView(fb, model);
  }
}

describe("texts in the picture of the jump", { timeout: TIMEOUT_MS }, () => {
  it("all come from the text module, apart from numbers", () => {
    drawn.clear();
    for (const controls of ["mouse", "touch", "tilt"] as const) drawJump(controls, 7, botPlayer(2.5));
    // No landing press: a fall.
    drawJump("mouse", 11, botPlayer(null));
    drawJump("mouse", 5, idlePlayer);

    const typedIn = [...drawn].filter((text) => !FROM_MODULE.test(text) && !NUMBER.test(text));
    expect(typedIn).toEqual([]);
    // The run reached the texts of every part of a jump, so an empty list means something.
    const { phase, prompts, newRecord, disqualified, playerName } = UI_TEXT.hud;
    const reached = [phase.gate, phase.inrun, phase.takeoff, phase.flight, phase.landing, newRecord, disqualified];
    for (const text of [...reached, playerName, ...Object.values(prompts).flatMap((scheme) => Object.values(scheme))]) {
      expect(drawn).toContain(text);
    }
    expect([...drawn].some((text) => text.endsWith(" M]"))).toBe(true);
  });
});
