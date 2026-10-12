import { DEFAULT_OUTFIT, type Outfit } from "../game/outfit";
import type { HillProfile } from "../sim/hill-profile";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import { backdropFor, drawBackdrop, drawBirds, drawSnowfall } from "./jump-view-backdrop";
import { CAMERA_AHEAD_M, CAMERA_BELOW_JUMPER_M, type Camera } from "./jump-view-camera";
import { BAR_HEIGHT_PX, drawBar, drawNotes, drawWindBox, prompt } from "./jump-view-hud";
import { drawJumper } from "./jump-view-jumper";
import { drawDistanceLine, drawHill, drawNearFence, drawSlope, drawWindSocks } from "./jump-view-landing";
import { DAY_SCENERY, type JumpViewModel, type Scenery } from "./jump-view-model";
import { color, withLook } from "./palette";
import { drawText, textWidth } from "./pixel-font";

export { FALLEN_MAX_HEIGHT_M, figureHalfWidthM, figurePoints } from "./jump-view-jumper";
export { windSockDirection } from "./jump-view-landing";
export { type ControlScheme, type JumpViewModel, type Scenery } from "./jump-view-model";

/** Logical height of the original; the width follows the screen's proportions (variant B). */
export const VIEW_HEIGHT_PX = 200;
export const VIEW_MIN_WIDTH_PX = 256;
export const VIEW_MAX_WIDTH_PX = 432;

/** Logical width for a display area, keeping square pixels and the original height. */
export function viewWidthFor(areaWidth: number, areaHeight: number): number {
  if (!(areaWidth > 0 && areaHeight > 0)) return 356;
  const w = Math.round((VIEW_HEIGHT_PX * areaWidth) / areaHeight);
  return Math.min(VIEW_MAX_WIDTH_PX, Math.max(VIEW_MIN_WIDTH_PX, w));
}

/** Frames per blink phase of the prompts (half a second). */
const BLINK_FRAMES = 35;

/** The jumper on the hill without the interface, the camera on the jumper (outfit preview). */
export function drawJumperPreview(
  fb: FrameBuffer,
  m: { profile: HillProfile; state: JumpSimState; outfit: Outfit },
): void {
  withLook({ lighting: "day", fog: false }, () => {
    const s = m.state;
    const cam: Camera = {
      x: s.jumper.xM,
      y: s.jumper.yM,
      cx: Math.round(fb.width / 2),
      cy: Math.round(fb.height * 0.55),
    };
    const backdrop = backdropFor(m.profile, cam);
    drawBackdrop(fb, backdrop, cam, fb.height, false, 0);
    const ground = drawSlope(fb, m.profile, cam, fb.height);
    drawHill(fb, m.profile, cam, ground, false);
    drawJumper(fb, m.profile, s, cam, m.outfit);
    drawNearFence(fb, m.profile, cam, fb.height);
  });
}

/** Draws one frame of the jump at the logical resolution. */
export function drawJumpView(fb: FrameBuffer, m: JumpViewModel): void {
  const scenery = m.scenery ?? DAY_SCENERY;
  withLook({ lighting: scenery.lighting, fog: scenery.fog }, () => drawScene(fb, m, scenery));
}

function drawScene(fb: FrameBuffer, m: JumpViewModel, scenery: Scenery): void {
  const night = scenery.lighting === "night";
  // Fog hides the stars and the moon.
  const clearNight = night && !scenery.fog;
  const s = m.state;
  const h = m.profile;
  const groundBottom = fb.height - BAR_HEIGHT_PX;
  const cam: Camera = {
    x: s.jumper.xM + CAMERA_AHEAD_M,
    y: s.jumper.yM - CAMERA_BELOW_JUMPER_M,
    cx: Math.round(fb.width * 0.45),
    cy: Math.round(groundBottom * 0.45),
  };
  const backdrop = backdropFor(h, cam);
  drawBackdrop(fb, backdrop, cam, groundBottom, clearNight, m.frame);
  if (!night) drawBirds(fb, backdrop, m.frame);
  const ground = drawSlope(fb, h, cam, groundBottom);
  // Lamps are on from dusk.
  drawHill(fb, h, cam, ground, scenery.lighting !== "day");
  drawWindSocks(fb, h, cam, s, m.frame);
  drawDistanceLine(fb, h, cam, m.kPointM, color("kLine"), 0);
  if (m.recordM !== undefined && m.recordM > 0) drawDistanceLine(fb, h, cam, m.recordM, color("recordLine"), 0);
  drawJumper(fb, h, s, cam, m.outfit ?? DEFAULT_OUTFIT);
  drawNearFence(fb, h, cam, groundBottom);
  if (scenery.snowfall) drawSnowfall(fb, m.windDriftM ?? { x: 0, y: 0 }, cam, m.frame, groundBottom);
  // HUD: the hill, the wind box (the only wind reading, as in the original), prompts, notes.
  drawText(fb, 4, 4, `${m.hillName} K${m.kPointM}`, color("yellow"), color("black"));
  drawWindBox(fb, s);
  const finished = s.logic.finished;
  const notesShown = notesShownBy(s.logic, m.frame);
  const lines = prompt(m, notesShown);
  const steady = s.logic.phase === PHASE.flight || s.logic.phase === PHASE.flightHold;
  if (steady || Math.floor(m.frame / BLINK_FRAMES) % 2 === 0) {
    lines.forEach((line, i) => {
      drawText(fb, Math.round((fb.width - textWidth(line)) / 2), 34 + i * 10, line, color("white"), color("black"));
    });
  }
  // A disqualified jump (no takeoff) is never scored, so there are no notes to show.
  if (finished && s.logic.distanceM > 0) drawNotes(fb, s, m.frame);
  if (m.newRecord === true && notesShown && Math.floor(m.frame / BLINK_FRAMES) % 2 === 0) {
    const text = "NOWY REKORD SKOCZNI!";
    drawText(fb, Math.round((fb.width - textWidth(text)) / 2), 22, text, color("yellow"), color("black"));
  }
  drawBar(fb, m, groundBottom, notesShown);
}
