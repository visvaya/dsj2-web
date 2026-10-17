import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hillChoiceOf, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { readOriginalHills, type OriginalHill } from "../original/original-hills";
import { hillGoldenFiles } from "../sim/test-support/golden-files";
import { GEOMETRY_RULE_LEVELS, geometryProblems } from "./hill-geometry";
import { hillDistance, LIKENESS } from "./hill-likeness";
import { jumpScore, oracleJump } from "./hill-oracle";
import { PLAY_RULES, playMeasures, WIND_CLASSES, windClassSeeds, type PlayMeasures } from "./hill-play";
import { EXACT_PLAYER_LEVEL, playJump } from "./hill-players";
import { OWN_HILL_SPECS } from "./own-hills";
import type { HillSpec } from "./hill-spec";
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
/** The likeness check takes about 4 s alone (measured 2026-10-17) and twice that beside the golden tests. */
const LIKENESS_TIMEOUT_MS = 60_000;

function load(): OriginalHill[] {
  const exe = new Uint8Array(readFileSync(exePath ?? ""));
  const dat = golden.dat === undefined ? undefined : new Uint8Array(readFileSync(golden.dat));
  return readOriginalHills(exe, dat);
}

function parseOriginal(
  h: OriginalHill,
): { ok: true; spec: HillSpec } | { ok: false; problems: readonly { rule: string; path: string }[] } {
  if (h.look === null) return { ok: false, problems: [{ rule: "look", path: "look cannot be read" }] };
  return parseHillSpec({
    schemaVersion: 1,
    id: `original-${h.number}`,
    name: "Skocznia",
    kPointM: h.kPointM,
    profile: { inrun: h.definition.inrun, landing: h.definition.landing },
    look: h.look,
  });
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

/** Hill sizes the trained player is compared with the oracle in: K points up to each end, in metres. */
const SIZE_BUCKET_ENDS_M = [90, 120, 160, Number.POSITIVE_INFINITY];

/**
 * How close the trained player must come to the oracle on a size bucket to be trusted there, relative to the
 * smallest bucket (K up to 90) of the same run: the mean and the 90th percentile of the distance the oracle adds
 * (in shares of K) at most this many times those of the smallest bucket, and no fall. Relative, because a policy
 * trained to be robust to the player's own errors deliberately leaves distance to the oracle at every size; the
 * question is whether the bot is as credible on a size as on the sizes already trusted. 1.25 gives the verdict the
 * earlier absolute margin (0.06 K mean, 0.12 K at the 90th percentile) gave with the earlier policy: K90-120 at 1.12
 * and 0.97 times passed, K120-160 at 1.47 and 1.41 failed; with the robust policy K90-120 is at about 1.20 and 1.05
 * and the larger buckets exceed it on the mean or the 90th percentile.
 */
const ORACLE_GAP_MAX_RATIO_TO_SMALLEST = 1.25;

/** One original and wind: what the trained player and the oracle made of it. */
interface OracleGap {
  kPointM: number;
  points: number;
  distanceShareOfK: number;
  playerFell: boolean;
}

/** The trained player against the oracle on one hill, on the strongest seed of each wind class. */
function oracleGaps(hill: HillChoice, seeds: readonly number[]): OracleGap[] {
  return seeds.map((seed) => {
    const player = playJump(hill, seed, EXACT_PLAYER_LEVEL, seed);
    const best = oracleJump(hill, seed);
    return {
      kPointM: hill.kPointM,
      points: best.score - jumpScore(player),
      distanceShareOfK: (best.outcome.distanceM - player.distanceM) / hill.kPointM,
      playerFell: player.fell || player.disqualified,
    };
  });
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const p90 = (v: readonly number[]): number => v.toSorted((a, b) => a - b)[Math.floor(0.9 * (v.length - 1))] ?? 0;

/** The 37 hills, four winds each, about 60 jumps of the oracle per wind: about 75 s alone. */
const ORACLE_TIMEOUT_MS = 900_000;

describe.skipIf(!golden.requested)("own hills against the hills of the original", () => {
  it("has the files it was asked to compare", () => {
    expect(golden.problems).toEqual([]);
  });

  it.skipIf(exePath === undefined)(
    "has no own hill too alike to an original one",
    () => {
      const originals = originalHillChoices(load());
      const tooAlike = ownHills.flatMap((own) =>
        originals.flatMap((o) => {
          const d = hillDistance(own, o);
          return d < LIKENESS.tooAlike ? [`${own.id} is ${d.toFixed(3)} from ${o.id}`] : [];
        }),
      );
      expect(tooAlike).toEqual([]);
    },
    LIKENESS_TIMEOUT_MS,
  );

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

  it.skipIf(exePath === undefined)(
    "keeps the trained player within the margin of the oracle on every size the bots are trusted with",
    () => {
      const seedsByClass = windClassSeeds(1, 256, 1);
      const seeds = WIND_CLASSES.flatMap((c) => seedsByClass[c]);
      const gaps = originalHillChoices(load()).flatMap((hill) => oracleGaps(hill, seeds));
      const buckets = SIZE_BUCKET_ENDS_M.map((end, i) => {
        const start = SIZE_BUCKET_ENDS_M[i - 1] ?? 0;
        const inside = gaps.filter((g) => g.kPointM > start && g.kPointM <= end);
        const shares = inside.map((g) => g.distanceShareOfK);
        return {
          start,
          end,
          hills: inside.length / seeds.length,
          meanShareOfK: mean(shares),
          p90ShareOfK: p90(shares),
          meanPoints: mean(inside.map((g) => g.points)),
          playerFalls: inside.filter((g) => g.playerFell).length,
        };
      });
      const table = buckets
        .map(
          (b) =>
            `K ${b.start}..${b.end}: ${b.hills} hills, gap ${b.meanShareOfK.toFixed(3)} K mean, ` +
            `${b.p90ShareOfK.toFixed(3)} K p90, ${b.meanPoints.toFixed(1)} points, ${b.playerFalls} falls`,
        )
        .join("; ");
      const trusted = buckets.filter((b) => b.start < PLAY_RULES.botReliableMaxKPointM);
      const [smallest] = buckets;
      if (smallest === undefined) throw new Error("no size bucket");
      const r = ORACLE_GAP_MAX_RATIO_TO_SMALLEST;
      const outside = trusted.filter(
        (b) =>
          !(b.meanShareOfK <= r * smallest.meanShareOfK && b.p90ShareOfK <= r * smallest.p90ShareOfK) ||
          b.playerFalls > 0,
      );
      expect({ outside: outside.map((b) => `K ${b.start}..${b.end}`), table }).toEqual({ outside: [], table });
    },
    ORACLE_TIMEOUT_MS,
  );

  it.skipIf(exePath === undefined)("reads every original hill through the hill format", () => {
    const rejected = load().flatMap((h) => {
      const result = parseOriginal(h);
      return result.ok ? [] : result.problems.map((p) => `original-${h.number}: ${p.rule} at ${p.path}`);
    });
    expect(rejected).toEqual([]);
  });

  // Every hill of the game plays, so none may fail a rule a hill needs to be admitted.
  it.skipIf(exePath === undefined)("passes every admission rule of the geometry on every original hill", () => {
    const specs = load().flatMap((h) => {
      const result = parseOriginal(h);
      return result.ok ? [result.spec] : [];
    });
    const problems = specs.map((spec) => ({ spec, problems: geometryProblems(spec) }));
    const refused = problems.flatMap(({ spec, problems: found }) =>
      found.filter((p) => p.level === "admission").map((p) => `${spec.id}: ${p.rule} (${p.message})`),
    );
    // Shown only when an admission rule fails: how many originals pass each rule, to place the levels again.
    const passing = Object.entries(GEOMETRY_RULE_LEVELS)
      .map(([rule, level]) => {
        const count = problems.filter(({ problems: found }) => !found.some((p) => p.rule === `geometry.${rule}`));
        return `${rule} (${level}): ${count.length}/${specs.length}`;
      })
      .join("; ");
    expect(refused, `originals passing each rule: ${passing}`).toEqual([]);
  });
});
