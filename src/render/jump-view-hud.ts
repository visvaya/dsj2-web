import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import type { ControlScheme, JumpViewModel } from "./jump-view-model";
import { color } from "./palette";
import { drawText, textWidth } from "./pixel-font";

export const BAR_HEIGHT_PX = 11;
const MS_TO_KMH = 3.6;

export function drawWindBox(fb: FrameBuffer, s: JumpSimState): void {
  const x = fb.width - 30;
  const y = 4;
  fb.rect(x, y, 26, 24, color("black"));
  fb.rect(x, y, 26, 1, color("grey"));
  fb.rect(x, y + 23, 26, 1, color("grey"));
  fb.rect(x, y, 1, 24, color("grey"));
  fb.rect(x + 25, y, 1, 24, color("grey"));
  const d = s.wind.indicatorDirectionRad;
  const cx = x + 13;
  const cy = y + 9;
  const ex = cx + Math.cos(d) * 6;
  const ey = cy - Math.sin(d) * 6;
  fb.line(cx - Math.cos(d) * 6, cy + Math.sin(d) * 6, ex, ey, color("red"));
  fb.line(ex, ey, ex - Math.cos(d - 0.6) * 4, ey + Math.sin(d - 0.6) * 4, color("red"));
  fb.line(ex, ey, ex - Math.cos(d + 0.6) * 4, ey + Math.sin(d + 0.6) * 4, color("red"));
  const label = s.wind.speedMPerS.toFixed(1);
  drawText(fb, x + 13 - Math.floor(textWidth(label) / 2), y + 15, label, color("yellow"));
}

/** Judges' notes in a column under the wind box, each from its own frame; the two discarded ones are dimmed. */
export function drawNotes(fb: FrameBuffer, s: JumpSimState, frame: number): void {
  const x = fb.width - 31;
  let y = 32;
  for (const judge of s.logic.judges) {
    if (frame < judge.showFrame) continue;
    fb.rect(x, y, 27, 11, color("noteBorder"));
    fb.rect(x + 1, y + 1, 25, 9, color("noteBox"));
    const label = judge.note.toFixed(1);
    drawText(
      fb,
      x + 14 - Math.ceil(textWidth(label) / 2),
      y + 2,
      label,
      color(judge.counted ? "yellow" : "noteDropped"),
    );
    y += 12;
  }
}

function phaseLabel(s: JumpSimState): string {
  const phase = s.logic.phase;
  if (phase === PHASE.crash) return "UPADEK";
  if (phase === PHASE.gate) return "BELKA";
  if (phase <= PHASE.crouch) return "NAJAZD";
  if (phase <= PHASE.afterTakeoff) return "WYBICIE";
  if (phase <= PHASE.flight) return "LOT";
  if (phase <= PHASE.landing) return "LĄDOWANIE";
  return "WYBIEG";
}

/**
 * What the screen asks for, per way of playing. With finger steering the buttons are the zones L and P; with
 * tilt steering there are no zones: the first thumb on the screen is the left button and the second the right.
 */
interface Prompts {
  nextJump: string;
  start: string;
  takeoff: string;
  lean: string;
  telemark: string;
  twoFeet: string;
}

const PROMPTS: Readonly<Record<ControlScheme, Prompts>> = {
  mouse: {
    nextJump: "KLIKNIJ: JESZCZE RAZ   ESC: SKOCZNIE",
    start: "LEWY PRZYCISK: START",
    takeoff: "OBA PRZYCISKI NA PROGU",
    lean: "MYSZ: POCHYLENIE",
    telemark: "LEWY LUB PRAWY TUŻ NAD ZIEMIĄ: TELEMARK",
    twoFeet: "OBA NARAZ: NA DWIE NOGI",
  },
  touch: {
    nextJump: "L: JESZCZE RAZ",
    start: "L: START",
    takeoff: "L+P NA PROGU: WYBICIE",
    lean: "PRZECIĄGAJ W POLU L: POCHYLENIE",
    telemark: "P TUŻ NAD ZIEMIĄ: TELEMARK",
    twoFeet: "L+P: NA DWIE NOGI",
  },
  tilt: {
    nextJump: "DOTKNIJ EKRANU: JESZCZE RAZ",
    start: "DOTKNIJ EKRANU: START",
    takeoff: "DWA KCIUKI NA PROGU: WYBICIE",
    lean: "PRZECHYLAJ TELEFON: POCHYLENIE",
    telemark: "KCIUK TUŻ NAD ZIEMIĄ: TELEMARK",
    twoFeet: "DWA KCIUKI NARAZ: NA DWIE NOGI",
  },
};

export function prompt(m: JumpViewModel, nextJumpAllowed: boolean): readonly string[] {
  const phase = m.state.logic.phase;
  const text = PROMPTS[m.controls];
  // The next jump can start as soon as the notes are up; the jumper may still be sliding out.
  if (nextJumpAllowed) return [text.nextJump];
  if (phase === PHASE.gate) return [text.start];
  if (phase === PHASE.inrun || phase === PHASE.crouch) return [text.takeoff];
  // The original starts the landing (telemark) on a press of either button; about 0.4 s before touchdown scores
  // best. Both buttons at once land on two feet: safer on a very long jump, with lower notes.
  if (phase === PHASE.flightHold || phase === PHASE.flight) return [text.lean, text.telemark, text.twoFeet];
  return [];
}

/** Bottom bar: player, then the phase and speed; after the jump the distance (half metres) and points, as in the original. */
export function drawBar(fb: FrameBuffer, m: JumpViewModel, top: number, notesShown: boolean): void {
  const s = m.state;
  const L = s.logic;
  fb.rect(0, top, fb.width, BAR_HEIGHT_PX, color("bar"));
  fb.rect(0, top, fb.width, 1, color("grey"));
  const nameEnd = drawText(fb, 4, top + 2, m.playerName, color("yellow"));
  const middle = Math.round(fb.width * 0.47);
  if (L.finished && L.distanceM === 0) {
    drawText(fb, middle, top + 2, "DYSKWALIFIKACJA", color("red"));
    return;
  }
  if (L.finished) {
    drawText(fb, middle, top + 2, `${L.distanceHalfM.toFixed(1)} M`, color("yellow"));
    if (notesShown) {
      const points = L.points.toFixed(1);
      drawText(fb, fb.width - 4 - textWidth(points), top + 2, points, color("yellow"));
    }
    return;
  }
  drawText(fb, nameEnd + 10, top + 2, phaseLabel(s), L.phase === PHASE.crash ? color("red") : color("green"));
  // The simulation keeps `speedMPerS` for the ground; in the air the velocity vector is shown.
  const v = s.jumper.airborne ? Math.hypot(s.jumper.vxMPerS, s.jumper.vyMPerS) : s.jumper.speedMPerS;
  const speed = `${(v * MS_TO_KMH).toFixed(1)} KM/H`;
  drawText(fb, fb.width - 4 - textWidth(speed), top + 2, speed, color("white"));
}
