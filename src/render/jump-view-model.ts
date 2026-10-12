import type { Outfit } from "../game/outfit";
import type { HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { Lighting } from "./palette";

/** Look of the scene; purely visual, the simulation never sees it. */
export interface Scenery {
  lighting: Lighting;
  snowfall: boolean;
  fog: boolean;
}

export const DAY_SCENERY: Scenery = { lighting: "day", snowfall: false, fog: false };

/** How the player steers: the prompts name the matching controls. */
export type ControlScheme = "mouse" | "touch" | "tilt";

export interface JumpViewModel {
  profile: HillProfile;
  kPointM: number;
  hillName: string;
  playerName: string;
  state: JumpSimState;
  controls: ControlScheme;
  /**
   * Presentation clock in simulation frames; keeps running after the simulation stops,
   * so the judges' notes still appear one by one.
   */
  frame: number;
  /** The simulation has stopped (the jumper stands still). */
  over: boolean;
  /** Hill record distance, drawn as a line on the landing hill. */
  recordM?: number;
  /** This jump set a new hill record. */
  newRecord?: boolean;
  /** Time of day and weather; a clear day when absent. */
  scenery?: Scenery;
  /** The jumper's colours; the original's player 1 when absent. */
  outfit?: Outfit;
  /** Accumulated drift of the displayed wind, in metres, for the falling snow. */
  windDriftM?: { x: number; y: number };
}
