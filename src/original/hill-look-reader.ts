import type { HillLook, InrunSupport } from "../render/hill-look";
import { int16, single, type HillDefinition } from "./hill-table";

/**
 * Reads how a hill looks from its definition in the original (docs/hill-format.md): the graphics arguments of the
 * inrun and landing setup and the calls after them (supports 1eee:0437, sky 003f:9da5, background 0baf:1c31,
 * trees 0baf:602e). Returns null when the branch does not have the expected calls or its values make no sense.
 */

const SUPPORTS_CALL = 2;
const SKY_CALL = 3;
const TERRAIN_CALL = 4;
const TREES_CALL = 6;
const SUPPORT_RECORDS = 6;
const SUPPORT_WORDS = 6;
/** The original never draws more than this many marks (1eee:06e1 clamps the count). */
const MAX_MARKS = 13;

const byte = (words: readonly number[], i: number) => (words[i] ?? 0) & 0xff;
const word = (words: readonly number[], i: number) => (words[i] ?? 0) & 0xffff;

function supportsFrom(words: readonly number[]): InrunSupport[] {
  const supports: InrunSupport[] = [];
  for (let k = 0; k < SUPPORT_RECORDS; k++) {
    const at = k * SUPPORT_WORDS;
    const fromXM = single(words, at);
    // A record with x0 = 0 is unused.
    if (fromXM === 0) continue;
    supports.push({
      fromXM,
      toXM: single(words, at + 2),
      colour: byte(words, at + 4),
      frontColour: byte(words, at + 5),
    });
  }
  return supports;
}

/** Whether the values read could come from a sound branch (finite, ranges in order, counts not negative). */
function plausible(look: HillLook): boolean {
  const t = look.trees;
  const numbers = [
    look.inrun.platformStartXM,
    look.marks.fenceStartM,
    ...look.supports.flatMap((s) => [s.fromXM, s.toXM]),
  ];
  return (
    numbers.every((v) => Number.isFinite(v)) &&
    t.firstCount >= 0 &&
    t.secondCount >= 0 &&
    t.toXM > t.fromXM &&
    look.marks.markCount >= 0 &&
    look.supports.every((s) => s.toXM >= s.fromXM)
  );
}

export function readHillLook(def: HillDefinition): HillLook | null {
  const [inrun, landing] = def.calls;
  const supports = def.calls[SUPPORTS_CALL];
  const sky = def.calls[SKY_CALL];
  const terrain = def.calls[TERRAIN_CALL];
  const trees = def.calls[TREES_CALL];
  if (
    !inrun ||
    !landing ||
    supports?.words.length !== SUPPORT_RECORDS * SUPPORT_WORDS ||
    sky?.words.length !== 3 ||
    terrain?.words.length !== 2 ||
    trees?.words.length !== 5
  ) {
    return null;
  }
  const i = inrun.words;
  const l = landing.words;
  const look: HillLook = {
    skyRgb6: [byte(sky.words, 0), byte(sky.words, 1), byte(sky.words, 2)],
    terrain: { seed: word(terrain.words, 0), amplitudeM: int16(terrain.words, 1), baseOverOutrunM: int16(l, 15) },
    trees: {
      firstCount: int16(trees.words, 0),
      secondCount: int16(trees.words, 1),
      fromXM: int16(trees.words, 2),
      toXM: int16(trees.words, 3),
      seed: word(trees.words, 4),
      hidden: def.hiddenTrees,
    },
    supports: supportsFrom(supports.words),
    inrun: {
      platformStartXM: single(i, 0),
      nearWallUpPx: int16(i, 17),
      nearWallDownPx: int16(i, 18),
      wallColour: byte(i, 19),
      gateColour: byte(i, 10),
    },
    marks: {
      firstMarkM: int16(l, 12),
      markCount: Math.min(MAX_MARKS, int16(l, 13)),
      fenceColour: byte(l, 16),
      fenceStartM: single(l, 17),
    },
  };
  return plausible(look) ? look : null;
}
