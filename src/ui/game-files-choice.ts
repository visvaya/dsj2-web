import type { HillChoice } from "../game/hill-choice";
import type { GameFiles } from "../storage/game-files-store";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.gameFiles;

/** What follows from the files the player has chosen so far. */
export interface GameFilesOutcome {
  /** Files to keep for the next visit; null keeps what was kept before. */
  keep: GameFiles | null;
  /** Hills read from the files; null when there is nothing to read them from. */
  hills: HillChoice[] | null;
  message: { text: string; error: boolean };
}

type HillReader = (exe: Uint8Array, dat: Uint8Array | undefined) => HillChoice[];

/**
 * Decides what to keep and what to tell the player. Only files that were read as the game are kept: a file that
 * merely has the right name must not come back on the next visit. A lone Dsj.dat is kept, because files may be
 * chosen one at a time and it is checked together with Dsj.exe once that arrives.
 */
export function gameFilesOutcome(files: GameFiles, readHills: HillReader): GameFilesOutcome {
  const { exe, dat } = files;
  if (!exe) {
    return dat
      ? {
          keep: { dat },
          hills: null,
          message: { text: T.datOnly, error: false },
        }
      : { keep: null, hills: null, message: { text: T.noExe, error: true } };
  }
  try {
    const hills = readHills(exe, dat);
    return {
      keep: dat ? { exe, dat } : { exe },
      hills,
      message: {
        text: dat ? T.loadedWithNames(hills.length) : T.loaded(hills.length),
        error: false,
      },
    };
  } catch {
    // The reader's own message is in English and names file structures; the player needs the conclusion.
    return {
      keep: null,
      hills: null,
      message: {
        text: T.unreadable,
        error: true,
      },
    };
  }
}
