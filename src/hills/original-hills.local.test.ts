import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hillChoiceOf, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { readOriginalHills, type OriginalHill } from "../original/original-hills";
import { hillGoldenFiles } from "../sim/test-support/golden-files";
import { hillDistance, LIKENESS } from "./hill-likeness";
import { playMeasures, type PlayMeasures } from "./hill-play";
import { OWN_HILL_SPECS } from "./own-hills";
import { parseHillSpec } from "./parse-hill-spec";

/**
 * Own hills compared with the hills of the original game. The original's data stays outside the repository, so
 * this runs only with the player's game files (DSJ2_GAME_DIR), never in CI; nothing read from them is stored.
 */
const golden = hillGoldenFiles();
const exePath = golden.exe;

/** Originals with a K point this close to an own hill's are hills of a similar size. */
const SIMILAR_K_M = 15;
/** One evaluation of a hill takes about 8 s alone; several run here. */
const ENVELOPE_TIMEOUT_MS = 600_000;

function load(): OriginalHill[] {
  const exe = new Uint8Array(readFileSync(exePath ?? ""));
  const dat = golden.dat === undefined ? undefined : new Uint8Array(readFileSync(golden.dat));
  return readOriginalHills(exe, dat);
}

/** A measure of how a hill plays, and how far past the originals' range an own hill may lie. */
interface EnvelopeMeasure {
  name: string;
  of: (m: PlayMeasures, hill: HillChoice) => number;
  marginWidth: number;
}

/**
 * The margins: about the difference the sample size of the measures leaves between two runs of the same hill, so
 * that a hill at the edge of the originals' range is not failed by noise, while one clearly outside still is.
 */
const ENVELOPE: readonly EnvelopeMeasure[] = [
  { name: "best median minus K (m)", of: (m, h) => m.bestMedianM - h.kPointM, marginWidth: 3 },
  { name: "good player's median minus K (m)", of: (m, h) => m.medianGoodM - h.kPointM, marginWidth: 3 },
  {
    name: "takeoff speed (km/h)",
    of: (m) => (m.takeoffSpeedMinKmPerH + m.takeoffSpeedMaxKmPerH) / 2,
    marginWidth: 2,
  },
  { name: "good player's flight time (s)", of: (m) => m.medianGoodFlightS, marginWidth: 0.2 },
  { name: "median takeoff window (frames)", of: (m) => m.windowMedianFrames, marginWidth: 1 },
  { name: "wind spread as a share of K", of: (m, h) => m.windSpreadM / h.kPointM, marginWidth: 0.01 },
];

const ownHills = OWN_HILL_SPECS.map(hillChoiceOf);

describe.skipIf(!golden.requested)("own hills against the hills of the original", () => {
  it("has the files it was asked to compare", () => {
    expect(golden.problems).toEqual([]);
  });

  it.skipIf(exePath === undefined)("has no own hill too alike to an original one", () => {
    const originals = originalHillChoices(load());
    const tooAlike = ownHills.flatMap((own) =>
      originals.flatMap((o) => {
        const d = hillDistance(own, o);
        return d < LIKENESS.tooAlike ? [`${own.id} is ${d.toFixed(3)} from ${o.id}`] : [];
      }),
    );
    expect(tooAlike).toEqual([]);
  });

  it.skipIf(exePath === undefined)(
    "plays every own hill inside the range of the originals of a similar size",
    () => {
      const originals = originalHillChoices(load());
      const near = (own: HillChoice) => originals.filter((o) => Math.abs(o.kPointM - own.kPointM) <= SIMILAR_K_M);
      const needed = originals.filter((o) => ownHills.some((own) => near(own).includes(o)));
      const measured = new Map(needed.map((o) => [o.id, playMeasures(o)] as const));
      const outside = ownHills.flatMap((own) => {
        const mine = playMeasures(own);
        const theirs = near(own).map((o) => ({ hill: o, m: measured.get(o.id) }));
        if (theirs.length === 0) return [`${own.id}: no original within ${SIMILAR_K_M} m of K ${own.kPointM} m`];
        return ENVELOPE.flatMap(({ name, of, marginWidth }) => {
          const values = theirs.flatMap(({ hill, m }) => (m === undefined ? [] : [of(m, hill)]));
          const lo = Math.min(...values) - marginWidth;
          const hi = Math.max(...values) + marginWidth;
          const value = of(mine, own);
          return value >= lo && value <= hi
            ? []
            : [`${own.id}: ${name} ${value.toFixed(3)} outside ${lo.toFixed(3)}..${hi.toFixed(3)}`];
        });
      });
      expect(outside).toEqual([]);
    },
    ENVELOPE_TIMEOUT_MS,
  );

  it.skipIf(exePath === undefined)("reads every original hill through the hill format", () => {
    const rejected = load().flatMap((h) => {
      if (h.look === null) return [`original-${h.number}: look cannot be read`];
      const result = parseHillSpec({
        schemaVersion: 1,
        id: `original-${h.number}`,
        name: "Skocznia",
        kPointM: h.kPointM,
        profile: { inrun: h.definition.inrun, landing: h.definition.landing },
        look: h.look,
      });
      return result.ok ? [] : result.problems.map((p) => `original-${h.number}: ${p.rule} at ${p.path}`);
    });
    expect(rejected).toEqual([]);
  });
});
