import type { WindState } from "../sim/wind";

/**
 * The wind as the player sees it in the indicator box: its direction (which the original turns towards the
 * real one at a limited rate) and the current speed. Wind socks and snow follow the same vector, so everything
 * on screen agrees with the box. In metres per second; x along the hill, y up.
 */
export function displayedWindMPerS(wind: WindState): { x: number; y: number } {
  return {
    x: Math.cos(wind.indicatorDirectionRad) * wind.speedMPerS,
    y: Math.sin(wind.indicatorDirectionRad) * wind.speedMPerS,
  };
}
