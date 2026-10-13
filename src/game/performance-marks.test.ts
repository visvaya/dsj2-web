import { describe, expect, it } from "vitest";
import { MARK_FIRST_JUMP_FRAME, MARK_FIRST_SCREEN, markOnce, type MarkTimeline } from "./performance-marks";

/** A timeline that keeps the names of its marks, like the one of a page. */
function fakeTimeline(): MarkTimeline & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    getEntriesByName: (name) => names.filter((n) => n === name),
    mark: (name) => names.push(name),
  };
}

describe("marks on the performance timeline", () => {
  it("names the two moments of a page load differently", () => {
    expect(MARK_FIRST_SCREEN).toBe("telemark:first-screen");
    expect(MARK_FIRST_JUMP_FRAME).toBe("telemark:first-jump-frame");
  });

  it("puts a mark that is not there yet", () => {
    const timeline = fakeTimeline();
    expect(markOnce(MARK_FIRST_SCREEN, timeline)).toBe(true);
    expect(timeline.names).toEqual([MARK_FIRST_SCREEN]);
  });

  it("leaves a mark that is there alone", () => {
    const timeline = fakeTimeline();
    markOnce(MARK_FIRST_SCREEN, timeline);
    expect(markOnce(MARK_FIRST_SCREEN, timeline)).toBe(false);
    expect(timeline.names).toEqual([MARK_FIRST_SCREEN]);
  });

  it("keeps the marks apart by name", () => {
    const timeline = fakeTimeline();
    markOnce(MARK_FIRST_SCREEN, timeline);
    expect(markOnce(MARK_FIRST_JUMP_FRAME, timeline)).toBe(true);
    expect(timeline.names).toEqual([MARK_FIRST_SCREEN, MARK_FIRST_JUMP_FRAME]);
  });
});
