import { originalHillId, type HillChoice } from "../game/hill-choice";
import { decodeReplayFile, parseReplayRecord } from "../sim/replay";
import { UI_TEXT } from "../text/ui-text";
import { originalReplaySource, type ReplaySource } from "./jump-replay";

const T = UI_TEXT.replays;

/** What a chosen file gives: a replay to play on one of the hills, or what to tell the player. */
export type OriginalReplayOutcome =
  | { ok: true; hill: HillChoice; source: ReplaySource }
  | { ok: false; message: string };

/**
 * Reads a replay file of the original game against the hills read from the player's Dsj.exe. The file comes from
 * the player's disk and is checked here: its size and checksum by the decoder, its wind as finite numbers, and
 * its hill among those loaded.
 */
export function originalReplayOutcome(file: Uint8Array, hills: readonly HillChoice[]): OriginalReplayOutcome {
  let parts: ReturnType<typeof decodeReplayFile>;
  try {
    parts = decodeReplayFile(file);
  } catch (error) {
    // The decoder's own messages are in English and name the format; the player needs the conclusion.
    return { ok: false, message: error instanceof RangeError ? T.notReplay : T.damaged };
  }
  const record = parseReplayRecord(parts.header, parts.record);
  if (!Object.values(record.wind).every(Number.isFinite)) return { ok: false, message: T.badValues };
  if (hills.length === 0) return { ok: false, message: T.needsGame };
  const hill = hills.find((h) => h.id === originalHillId(record.hillIndex));
  if (!hill) return { ok: false, message: T.noHill(record.hillIndex) };
  return { ok: true, hill, source: originalReplaySource(record) };
}
