import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import {
  FALLEN_MAX_HEIGHT_M,
  VIEW_HEIGHT_PX,
  drawJumpView,
  figureHalfWidthM,
  figurePoints,
  viewWidthFor,
  type Scenery,
} from "./jump-view";
import { terrainYM } from "../sim/hill-profile";
import { prompt } from "./jump-view-hud";
import type { ControlScheme } from "./jump-view-model";
import { color } from "./palette";
import { fnv } from "./test-support/frame-hash";

/** Mean of the colour channels over the whole frame. */
function brightness(fb: FrameBuffer): number {
  let sum = 0;
  for (const p of fb.pixels) sum += (p & 0xff) + ((p >>> 8) & 0xff) + ((p >>> 16) & 0xff);
  return sum / fb.pixels.length;
}

/** The bottom bar (interface). */
function barRows(fb: FrameBuffer): Uint32Array {
  return fb.pixels.slice(fb.width * (VIEW_HEIGHT_PX - 11));
}

describe("jump view", () => {
  it("fits the logical width to the screen with square pixels", () => {
    expect(viewWidthFor(1920, 1080)).toBe(356);
    expect(viewWidthFor(1280, 800)).toBe(320);
    expect(viewWidthFor(2400, 1080)).toBe(432);
    expect(viewWidthFor(390, 844)).toBe(256);
    expect(viewWidthFor(0, 0)).toBe(356);
  });

  it.each<[string, Scenery]>([
    ["day", { lighting: "day", snowfall: false, fog: false }],
    ["night with snow", { lighting: "night", snowfall: true, fog: false }],
    ["dusk with fog", { lighting: "dusk", snowfall: false, fog: true }],
  ])(
    "draws every phase of a jump (%s) without leaving unpainted pixels, the same way each time",
    (_name, scenery) => {
      const hill = OWN_HILLS[0];
      if (!hill) throw new Error("no hill");
      const render = () => {
        let jump = startTrainingJump(hill, 7);
        const bot = makeBot(
          hill.profile,
          { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 },
          () => jump.state,
        );
        const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
        const hashes: string[] = [];
        let unpainted = 0;
        // Past the end of the jump too, while the judges' notes appear.
        for (let f = 0; f < 3000 && jump.framesAfterEnd < 200; f++) {
          jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
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
              scenery,
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
      // Two whole jumps are drawn frame by frame; on a slow or busy machine that takes longer than the default.
    },
    30_000,
  );

  it("on touch prompts to land with the right zone, and for the next jump as soon as the notes are up", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    let jump = startTrainingJump(hill, 7);
    const bot = makeBot(
      hill.profile,
      { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 },
      () => jump.state,
    );
    const schemes: readonly ControlScheme[] = ["touch", "tilt", "mouse"];
    /** Every distinct prompt seen in flight and once the notes are up, per control scheme. */
    const inFlight = new Set<string>();
    const notesUpWhileMoving = new Set<string>();
    for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
      jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
      const frame = presentationFrame(jump);
      const notesShown = notesShownBy(jump.state.logic, frame);
      const model = { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1" };
      const flying = jump.state.logic.phase === PHASE.flight;
      for (const controls of schemes) {
        const lines = prompt({ ...model, state: jump.state, controls, frame, over: false }, notesShown);
        if (flying) inFlight.add(`${controls}: ${lines.join(" / ")}`);
        if (notesShown) notesUpWhileMoving.add(`${controls}: ${lines.join(" / ")}`);
      }
    }
    expect([...inFlight]).toEqual([
      "touch: PRZECIĄGAJ W POLU L: POCHYLENIE / P TUŻ NAD ZIEMIĄ: TELEMARK",
      "tilt: PRZECHYLAJ TELEFON: POCHYLENIE / P TUŻ NAD ZIEMIĄ: TELEMARK",
      "mouse: MYSZ: POCHYLENIE / LEWY LUB PRAWY TUŻ NAD ZIEMIĄ: TELEMARK",
    ]);
    // The notes are up while the jumper is still sliding out: that is when the next jump can already start.
    expect([...notesUpWhileMoving]).toEqual([
      "touch: L: JESZCZE RAZ",
      "tilt: L: JESZCZE RAZ",
      "mouse: KLIKNIJ: JESZCZE RAZ   ESC: SKOCZNIE",
    ]);
  });

  it("shows no judges' notes after a disqualification", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    // Nobody presses start: the countdown runs out and the jump is disqualified.
    let jump = startTrainingJump(hill, 5);
    for (let f = 0; f < 3000 && jump.framesAfterEnd < 50; f++)
      jump = stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.finished).toBe(true);
    expect(jump.state.logic.distanceM).toBe(0);
    const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
    const model = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: jump.state,
    };
    drawJumpView(fb, { ...model, controls: "mouse", frame: presentationFrame(jump), over: true });
    expect(fb.pixels.includes(color("noteBox"))).toBe(false);
  });

  it("darkens the scenery at night but keeps the interface colours", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 9);
    const base = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: jump.state,
    };
    const draw = (scenery: Scenery) => {
      const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
      drawJumpView(fb, { ...base, controls: "mouse", frame: 1, over: false, scenery });
      return fb;
    };
    const day = draw({ lighting: "day", snowfall: false, fog: false });
    const night = draw({ lighting: "night", snowfall: false, fog: false });
    expect(brightness(night)).toBeLessThan(brightness(day) * 0.75);
    // The interface is the same at any time of day.
    expect(barRows(night)).toEqual(barRows(day));
  });

  it("keeps the drawn figure on the snow and within the hill, even in a fall", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    // No landing press at all: the jumper crashes and the pose flails.
    let jump = startTrainingJump(hill, 11);
    const bot = makeBot(
      hill.profile,
      { startFrame: 70, takeoffLeadM: 3, landingHeightM: null, leanPattern: () => 0 },
      () => jump.state,
    );
    let crashed = false;
    let highestWhileLying = -Infinity;
    for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
      jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
      const s = jump.state;
      if (s.logic.fallType !== 0) crashed = true;
      const limit = figureHalfWidthM(hill.profile, s.jumper.xM);
      const lying = s.logic.fallType !== 0 && !s.jumper.airborne;
      for (const p of figurePoints(hill.profile, s)) {
        expect(Math.abs(p.z)).toBeLessThanOrEqual(limit);
        // Near the jumper the terrain is close to its tangent plane; allow for the curvature over a ski's length.
        const terrain = terrainYM(hill.profile, s.jumper.xM + p.x);
        expect(s.jumper.yM + p.y).toBeGreaterThanOrEqual(terrain - 0.2);
        if (lying) highestWhileLying = Math.max(highestWhileLying, s.jumper.yM + p.y - terrain);
      }
    }
    expect(crashed).toBe(true);
    // Lying in the snow, no ski stands up past the fences.
    expect(highestWhileLying).toBeGreaterThan(-Infinity);
    expect(highestWhileLying).toBeLessThanOrEqual(FALLEN_MAX_HEIGHT_M + 0.2);
  });
});
