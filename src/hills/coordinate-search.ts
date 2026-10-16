/** A point of a search and its score. */
export interface Scored<T> {
  point: T;
  score: number;
}

/** One step along one axis from a point, up (1) or down (-1); null when the step leaves the axis's range. */
export type AxisMove<T> = (point: T, direction: 1 | -1) => T | null;

/** The score of a point, or null when the search may not score any more points (its budget is spent). */
export type Score<T> = (point: T) => number | null;

/** Steps one way along an axis while each step gains. */
function walk<T>(
  from: Scored<T>,
  move: AxisMove<T>,
  direction: 1 | -1,
  score: Score<T>,
  onGain: (s: Scored<T>) => void,
) {
  let best = from;
  for (;;) {
    const point = move(best.point, direction);
    const s = point === null ? null : score(point);
    if (point === null || s === null || !(s > best.score)) return best;
    best = { point, score: s };
    onGain(best);
  }
}

/** One round over the axes: each tries a step up, and down when up does not gain, and walks the way that gains. */
function round<T>(from: Scored<T>, moves: readonly AxisMove<T>[], score: Score<T>, onGain: (s: Scored<T>) => void) {
  return moves.reduce((best, move) => {
    const up = walk(best, move, 1, score, onGain);
    return up === best ? walk(best, move, -1, score, onGain) : up;
  }, from);
}

/**
 * Deterministic coordinate search: rounds over the axes until a round gains nothing (or the budget behind `score`
 * is spent). A tie keeps the earlier point, so the search never ends below its start. `onGain` gets each gain.
 */
export function coordinateSearch<T>(
  start: Scored<T>,
  moves: readonly AxisMove<T>[],
  score: Score<T>,
  onGain: (s: Scored<T>) => void = () => undefined,
): Scored<T> {
  let best = start;
  for (;;) {
    const next = round(best, moves, score, onGain);
    if (next === best) return best;
    best = next;
  }
}
