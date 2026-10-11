import { detAtan, detSin } from "./deterministic-math";
import type { BorlandRandom } from "./borland-random";
import { f32 } from "./physics-constants";

/** Wind state block of the original (DS:4D10..4D2F, stored verbatim in replays). */
export interface WindState {
  /** Horizontal component along the hill, m/s; positive is a tail wind. */
  xMPerS: number;
  yMPerS: number;
  /** Scale of the random walk applied every WIND_UPDATE_PERIOD_FRAMES. */
  variabilityMPerS: number;
  speedMPerS: number;
  directionRad: number;
  /** Direction shown by the indicator, turning towards directionRad. */
  indicatorDirectionRad: number;
  indicatorTurnRateRad: number;
  indicatorMaxTurnRateRad: number;
}

export const WIND_UPDATE_PERIOD_FRAMES = 10;
export const WIND_SOFT_LIMIT_M_PER_S = 3.8;
export const WIND_DAMPING_DIVISOR = 50;
export const WIND_GAUSS_SAMPLES = 5;
export const INDICATOR_TURN_STEP_RAD = 0.05;
export const INDICATOR_DEAD_ZONE = 0.05;
export const INDICATOR_MAX_TURN_RATE_RAD = 0.2;
const RANDOM_WORD_RANGE = 0xffff;

/** x87 FISTP with the default rounding mode: nearest, ties to even. */
export function roundHalfEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** 1980:009c: mean of n draws of Random(65535) mapped to [-1, 1]. */
export function randomCentered(rng: BorlandRandom, samples: number): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += rng.below(RANDOM_WORD_RANGE);
  }
  return f32((sum / samples / (RANDOM_WORD_RANGE - 1)) * 2 - 1);
}

/** 1980:000c: like randomCentered, folded to [0, 1]. */
export function randomUnit(rng: BorlandRandom, samples: number): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += rng.below(RANDOM_WORD_RANGE);
  }
  return f32(Math.abs((sum / samples / (RANDOM_WORD_RANGE - 1)) * 2 - 1));
}

/** 0baf:976a, called once per frame before the physics step. */
export function updateWind(prev: WindState, frame: number, dtS: number, rng: BorlandRandom): WindState {
  if (roundHalfEven(frame * dtS * 70) % WIND_UPDATE_PERIOD_FRAMES !== 0) {
    return prev;
  }
  const w: WindState = { ...prev };
  w.yMPerS = f32(randomCentered(rng, WIND_GAUSS_SAMPLES) * w.variabilityMPerS + w.yMPerS);
  w.xMPerS = f32(randomCentered(rng, WIND_GAUSS_SAMPLES) * w.variabilityMPerS + w.xMPerS);
  if (w.xMPerS !== 0) {
    if (w.xMPerS > 0) {
      w.directionRad = f32(detAtan(w.yMPerS / w.xMPerS));
    }
    if (w.xMPerS <= 0) {
      w.directionRad = f32(detAtan(w.yMPerS / w.xMPerS) + Math.PI);
    }
  } else {
    w.directionRad = w.yMPerS > 0 ? f32(Math.PI / 2) : f32(-Math.PI / 2);
  }
  w.speedMPerS = f32(Math.sqrt(w.yMPerS * w.yMPerS + w.xMPerS * w.xMPerS));
  if (!(WIND_SOFT_LIMIT_M_PER_S >= w.speedMPerS)) {
    const damping = 1 - (w.speedMPerS - WIND_SOFT_LIMIT_M_PER_S) / WIND_DAMPING_DIVISOR;
    w.yMPerS = f32(damping * w.yMPerS);
    w.xMPerS = f32(damping * w.xMPerS);
  }
  w.indicatorMaxTurnRateRad = f32(INDICATOR_MAX_TURN_RATE_RAD);
  if (!(INDICATOR_DEAD_ZONE >= detSin(w.directionRad - w.indicatorDirectionRad))) {
    if (!(w.indicatorTurnRateRad >= 0)) {
      w.indicatorTurnRateRad = f32(INDICATOR_TURN_STEP_RAD + w.indicatorTurnRateRad);
    }
    w.indicatorTurnRateRad = f32(INDICATOR_TURN_STEP_RAD + w.indicatorTurnRateRad);
    if (!(w.indicatorTurnRateRad <= w.indicatorMaxTurnRateRad)) {
      w.indicatorTurnRateRad = w.indicatorMaxTurnRateRad;
    }
    w.indicatorDirectionRad = f32(w.indicatorDirectionRad + w.indicatorTurnRateRad);
  }
  if (!(-INDICATOR_DEAD_ZONE <= detSin(w.directionRad - w.indicatorDirectionRad))) {
    if (!(w.indicatorTurnRateRad <= 0)) {
      w.indicatorTurnRateRad = f32(w.indicatorTurnRateRad - INDICATOR_TURN_STEP_RAD);
    }
    w.indicatorTurnRateRad = f32(w.indicatorTurnRateRad - INDICATOR_TURN_STEP_RAD);
    if (!(-w.indicatorMaxTurnRateRad <= w.indicatorTurnRateRad)) {
      w.indicatorTurnRateRad = f32(-w.indicatorMaxTurnRateRad);
    }
    w.indicatorDirectionRad = f32(w.indicatorDirectionRad + w.indicatorTurnRateRad);
  }
  return w;
}
