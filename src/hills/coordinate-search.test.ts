import { describe, expect, it } from "vitest";
import { coordinateSearch, type AxisMove } from "./coordinate-search";

type Point = readonly [number, number];

const step =
  (axis: 0 | 1, size: number): AxisMove<Point> =>
  (p, direction) => {
    const moved = p[axis] + direction * size;
    if (Math.abs(moved) > 10) return null;
    return axis === 0 ? [moved, p[1]] : [p[0], moved];
  };

/** Highest at (3, -2). */
const height = (p: Point): number => 10 - (p[0] - 3) ** 2 - (p[1] + 2) ** 2;

describe("coordinate search", () => {
  it("walks each axis to the top and reports every gain", () => {
    const gains: Point[] = [];
    const best = coordinateSearch({ point: [0, 0], score: height([0, 0]) }, [step(0, 1), step(1, 1)], height, (s) =>
      gains.push(s.point),
    );
    expect(best).toEqual({ point: [3, -2], score: 10 });
    expect(gains.at(-1)).toEqual([3, -2]);
  });

  it("stops when the budget is spent and never ends below its start", () => {
    let left = 2;
    const budget = (p: Point): number | null => (left-- > 0 ? height(p) : null);
    const best = coordinateSearch({ point: [0, 0], score: height([0, 0]) }, [step(0, 1), step(1, 1)], budget);
    expect(best.point).toEqual([2, 0]);
    expect(best.score).toBeGreaterThan(height([0, 0]));
  });

  it("does not step out of an axis's range", () => {
    const best = coordinateSearch({ point: [9, 0], score: 0 }, [step(0, 5)], (p) => p[0]);
    expect(best.point).toEqual([9, 0]);
  });
});
