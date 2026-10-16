import type { TrainingJump } from "../game/training-session";
import { detCos } from "../sim/deterministic-math";
import { landingSlope, terrainYM } from "../sim/hill-profile";

/**
 * What a player sees of a jump at one frame, and nothing more: no future wind, no hill data beyond the terrain under
 * the jumper and the edge ahead. The bots decide only from this.
 */
export interface PlayerView {
  /** Simulation frame of the jump. */
  frame: number;
  phase: number;
  speedMPerS: number;
  /** Seconds left to the takeoff edge at the current speed; negative past it. */
  timeToEdgeS: number;
  /** Height of the jumper's point above the terrain under it, in metres. */
  aboveTerrainM: number;
  /** How fast that height shrinks, in m/s (positive while the jumper comes down to the slope). */
  closingMPerS: number;
  bodyAngleRad: number;
  /** Frames since the first airborne frame; null before the jumper has left the ground. */
  framesSinceTakeoff: number | null;
  /**
   * Wind along the hill as the indicator shows it, in m/s, positive from behind the jumper (tail wind). It is the
   * x component of `displayedWindMPerS` (`src/game/wind-display.ts`), computed with the deterministic cosine so a
   * bot decides the same in every engine.
   */
  shownTailWindMPerS: number;
}

/** The view of `jump` at `frame`; `takeoffFrame` is the first airborne frame seen so far, or null. */
export function playerView(jump: TrainingJump, frame: number, takeoffFrame: number | null): PlayerView {
  const { jumper, logic, wind } = jump.state;
  const hill = jump.hill.profile;
  const slope = landingSlope(hill, jumper.xM);
  return {
    frame,
    phase: logic.phase,
    speedMPerS: jumper.speedMPerS,
    timeToEdgeS: jumper.speedMPerS > 0 ? (hill.takeoffXM - jumper.xM) / jumper.speedMPerS : Number.POSITIVE_INFINITY,
    aboveTerrainM: jumper.yM - terrainYM(hill, jumper.xM),
    // y is up and vy positive down, so the height above the slope s = dy/dx shrinks at vy + vx s.
    closingMPerS: jumper.vyMPerS + jumper.vxMPerS * slope,
    bodyAngleRad: logic.bodyAngleRad,
    framesSinceTakeoff: takeoffFrame === null ? null : frame - takeoffFrame,
    shownTailWindMPerS: detCos(wind.indicatorDirectionRad) * wind.speedMPerS,
  };
}
