import type { WindState } from "../sim/wind";

/**
 * The original's box draws the wind's cross component as depth seen at a slant: squashed to half and pointing
 * down the screen when positive (1cb6:1ee9).
 */
const CROSS_WIND_ON_SCREEN = 0.5;

/**
 * The wind as the player sees it in the indicator box: its direction (which the original turns towards the
 * real one at a limited rate) and the current speed, as the box's arrow lies on the screen. Snow follows the same
 * vector, and wind socks the same direction and speed, so everything on screen agrees with the box. In metres per
 * second; x along the hill (positive: from behind the jumper), y up the screen.
 */
export function displayedWindMPerS(wind: WindState): { x: number; y: number } {
  return {
    x: Math.cos(wind.indicatorDirectionRad) * wind.speedMPerS,
    y: -Math.sin(wind.indicatorDirectionRad) * wind.speedMPerS * CROSS_WIND_ON_SCREEN,
  };
}
