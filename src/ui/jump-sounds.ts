import type { SoundEngine } from "../audio/sound-engine";
import { notesAppearing, soundMix, type MixInput } from "../audio/sound-mix";
import { displayedWindMPerS } from "../game/wind-display";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";

/** Nothing moves and the game is paused: every continuous layer goes quiet. */
const HUSHED: MixInput = {
  airborne: false,
  onTrack: false,
  groundSpeedMPerS: 0,
  airSpeedMPerS: 0,
  windMPerS: 0,
  paused: true,
};

export interface JumpSounds {
  /**
   * Plays the judges' notes as they appear up to presentation frame `clock`, the record jingle once the jump
   * is known to beat the record, and sets the continuous layers for the state.
   */
  play(state: JumpSimState, clock: number, newRecord: boolean, paused: boolean): void;
  /** Quiets the continuous layers at once, for a hidden tab, where no further frames come. */
  hush(): void;
  /** Forgets what was played, for the next jump. */
  reset(): void;
}

/** The sounds of the jumps on one screen, played on whichever engine `engine` gives at the time. */
export function createJumpSounds(engine: () => SoundEngine | null): JumpSounds {
  let heardUpTo = 0;
  let recordPlayed = false;
  return {
    play(state, clock, newRecord, paused) {
      const out = engine();
      if (!out) return;
      for (const note of notesAppearing(state.logic, heardUpTo, clock))
        out.play(note.counted ? "noteCounted" : "noteDropped");
      heardUpTo = clock;
      if (newRecord && !recordPlayed) {
        recordPlayed = true;
        out.play("record");
      }
      const wind = displayedWindMPerS(state.wind);
      out.update(
        soundMix({
          airborne: state.jumper.airborne,
          onTrack: state.logic.phase < PHASE.flightHold,
          groundSpeedMPerS: state.jumper.speedMPerS,
          airSpeedMPerS: Math.hypot(state.jumper.vxMPerS, state.jumper.vyMPerS),
          windMPerS: Math.hypot(wind.x, wind.y),
          paused,
        }),
      );
    },
    hush() {
      engine()?.update(soundMix(HUSHED));
    },
    reset() {
      heardUpTo = 0;
      recordPlayed = false;
    },
  };
}
