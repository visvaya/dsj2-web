import { DEFAULT_OUTFIT, type Outfit } from "../game/outfit";
import { nextJumpAllowed } from "../game/training-session";
import type { HillProfile } from "../sim/hill-profile";
import { notesShownBy } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import { backdropFor, drawBackdrop, drawSnowfall } from "./jump-view-backdrop";
import { type Camera } from "./jump-view-camera";
import { BAR_HEIGHT_PX, drawBar, drawNotes, drawWindBox, prompt } from "./jump-view-hud";
import { drawGhost } from "./jump-view-ghost";
import { drawJumper } from "./jump-view-jumper";
import { drawHill, drawNearFence, drawSlope } from "./jump-view-landing";
import { drawHillScene } from "./jump-view-scene";
import { DEFAULT_HILL_LOOK } from "./hill-look";
import { drawBirds, drawFloodlights, drawInrunLamps, drawNightSky, drawWindSocks } from "./scene-extras";
import { SQUARE_PIXEL_WIDTH } from "./scene-layers";
import { DAY_SCENERY, type JumpViewModel, type Scenery } from "./jump-view-model";
import { color, withLook } from "./palette";
import { drawText, textWidth } from "./pixel-font";
import { UI_TEXT } from "../text/ui-text";

export { FALLEN_MAX_HEIGHT_M, figureHalfWidthM, figurePoints } from "./jump-view-jumper";
export { windSockDirection } from "./scene-extras";
export { type ControlScheme, type JumpViewModel, type Scenery } from "./jump-view-model";

/** Logical height of the original; the width follows the screen's proportions (variant B). */
export const VIEW_HEIGHT_PX = 200;
export const VIEW_MIN_WIDTH_PX = 256;
export const VIEW_MAX_WIDTH_PX = 432;

/** Logical width for a display area, keeping square pixels and the original height. */
/**
 * Device pixels per game pixel: all the room there is, and never less than one. The picture reaches the edges
 * of its area; a scale that is not whole leaves the game pixels uneven by less than one device pixel.
 */
export function pictureScale(fill: number): number {
  return Math.max(1, fill);
}

export function viewWidthFor(areaWidth: number, areaHeight: number): number {
  if (!(areaWidth > 0 && areaHeight > 0)) return 356;
  const w = Math.round((VIEW_HEIGHT_PX * areaWidth) / areaHeight);
  return Math.min(VIEW_MAX_WIDTH_PX, Math.max(VIEW_MIN_WIDTH_PX, w));
}

/** Rows of the sky bands at the top of the scene; stars and the moon are drawn there only. */
const SKY_ROWS = 48;
/** Frames per blink phase of the line about a new record (half a second). */
const BLINK_FRAMES = 35;
/** Prompts: the height of a line of text with its spacing, and the gap between the last line and the bar. */
const PROMPT_LINE_PX = 10;
const PROMPT_BOTTOM_GAP_PX = 3;

/** Where in the picture the jumper stands, as shares of its width and height. */
export interface PreviewAnchor {
  xShare: number;
  yShare: number;
}

const PREVIEW_ANCHOR: PreviewAnchor = { xShare: 0.5, yShare: 0.55 };

/** The jumper on the hill without the interface, the camera on the jumper (outfit preview, icons). */
export function drawJumperPreview(
  fb: FrameBuffer,
  m: { profile: HillProfile; state: JumpSimState; outfit: Outfit },
  anchor: PreviewAnchor = PREVIEW_ANCHOR,
): void {
  withLook({ lighting: "day", fog: false }, () => {
    const s = m.state;
    const cam: Camera = {
      x: s.jumper.xM,
      y: s.jumper.yM,
      cx: Math.round(fb.width * anchor.xShare),
      cy: Math.round(fb.height * anchor.yShare),
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
  const lightsOn = scenery.lighting !== "day";
  drawHillScene(
    fb,
    {
      profile: h,
      kPointM: m.kPointM,
      look: m.look ?? DEFAULT_HILL_LOOK,
      state: s,
      outfit: m.outfit ?? DEFAULT_OUTFIT,
      recordM: m.recordM ?? 0,
      pixelWidth: SQUARE_PIXEL_WIDTH,
      ...(m.ghost === undefined ? {} : { ghost: m.ghost, drawGhost: (f, g, a) => drawGhost(f, h, g, a) }),
    },
    groundBottom - 1,
    {
      afterSky: (view) => {
        if (clearNight) drawNightSky(fb, view, m.frame, SKY_ROWS);
      },
      afterBackground: (view) => {
        if (!night) drawBirds(fb, view, m.frame);
      },
      afterFarFence: (view) => {
        if (lightsOn) drawFloodlights(fb, h, view);
        drawWindSocks(fb, h, view, s, m.frame);
      },
      afterInrun: (view, railPx) => {
        if (lightsOn) drawInrunLamps(fb, h, view, railPx);
      },
    },
  );
  if (scenery.snowfall) {
    const cam = { x: s.jumper.xM, y: s.jumper.yM, cx: fb.width / 2, cy: groundBottom / 2 };
    drawSnowfall(fb, m.windDriftM ?? { x: 0, y: 0 }, cam, m.frame, groundBottom);
  }
  // HUD: the hill, the wind box (the only wind reading, as in the original), prompts, notes.
  drawText(
    fb,
    Math.max(4, m.titleInsetPx ?? 0),
    4,
    UI_TEXT.hillLabel(m.hillName, m.kPointM),
    color("yellow"),
    color("black"),
  );
  drawWindBox(fb, s);
  const finished = s.logic.finished;
  const notesShown = notesShownBy(s.logic, m.frame);
  const lines = prompt(m, nextJumpAllowed(s.logic, m.frame));
  {
    // At the bottom of the picture, above the bar: the jumper is always in its upper part, and three lines in
    // the middle of the sky covered him.
    const firstLineY = groundBottom - PROMPT_BOTTOM_GAP_PX - lines.length * PROMPT_LINE_PX;
    lines.forEach((line, i) => {
      const x = Math.round((fb.width - textWidth(line)) / 2);
      drawText(fb, x, firstLineY + i * PROMPT_LINE_PX, line, color("white"), color("black"));
    });
  }
  // A disqualified jump (no takeoff) is never scored, so there are no notes to show.
  if (finished && s.logic.distanceM > 0) drawNotes(fb, s, m.frame);
  // A new record blinks from the frame the distance appears in the bar.
  if (m.newRecord === true && finished && Math.floor(m.frame / BLINK_FRAMES) % 2 === 0) {
    const text = UI_TEXT.hud.newRecord;
    drawText(fb, Math.round((fb.width - textWidth(text)) / 2), 22, text, color("yellow"), color("black"));
  }
  drawBar(fb, m, groundBottom, notesShown);
}
