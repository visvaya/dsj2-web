/** The first animation frame after the first screen of the game was put on the page. */
export const MARK_FIRST_SCREEN = "telemark:first-screen";
/** The first picture of a jump sent to the canvas. */
export const MARK_FIRST_JUMP_FRAME = "telemark:first-jump-frame";

/** The part of the browser's performance timeline the marks need. */
export interface MarkTimeline {
  getEntriesByName(name: string): ArrayLike<unknown>;
  mark(name: string): unknown;
}

/**
 * Puts a User Timing mark unless one of that name is there already, so each mark tells of the first time in
 * a page load. Returns whether it put the mark.
 */
export function markOnce(name: string, timeline: MarkTimeline = performance): boolean {
  if (timeline.getEntriesByName(name).length > 0) return false;
  timeline.mark(name);
  return true;
}
