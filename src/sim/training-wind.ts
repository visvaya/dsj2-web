import type { BorlandRandom } from "./borland-random";
import { detCos, detSin } from "./deterministic-math";
import { f32 } from "./physics-constants";
import { INDICATOR_MAX_TURN_RATE_RAD, randomCentered, randomUnit, type WindState } from "./wind";

const TRAINING_WIND_MAX_M_PER_S = 4.5;
/** Random(6282) / 1000 covers 0..2*pi in steps of 1 mrad. */
const DIRECTION_STEPS = 6282;

/**
 * Tail of the hill setup routine (0baf:8843): the wind a jump starts with
 * outside replays. Consumes the generator in the original's order.
 */
export function createStartWind(rng: BorlandRandom): WindState {
  // Byte 4D30 (purpose unknown, not used by the simulation): Random(2) * Random(255).
  rng.below(2);
  rng.below(255);
  const a = rng.below(20);
  const b = rng.below(20);
  let speed = f32(randomCentered(rng, 5) + (a / 10 + b / 10) * 2);
  if (!(speed >= 0)) speed = 0;
  if (!(speed <= TRAINING_WIND_MAX_M_PER_S)) speed = f32(TRAINING_WIND_MAX_M_PER_S);
  const direction = f32(rng.below(DIRECTION_STEPS) / 1000);
  const first = randomUnit(rng, 4);
  const second = randomUnit(rng, 4);
  return {
    xMPerS: f32(detCos(direction) * speed),
    yMPerS: f32(detSin(direction) * speed),
    variabilityMPerS: f32((first + second) / 3 + 0.05),
    speedMPerS: speed,
    directionRad: direction,
    indicatorDirectionRad: direction,
    indicatorTurnRateRad: 0,
    indicatorMaxTurnRateRad: f32(INDICATOR_MAX_TURN_RATE_RAD),
  };
}
