import { describe, expect, it } from "vitest";
import { TITLE_PAUSE_INSET_WORST_PX } from "../hills/hill-title";
import { VIEW_HEIGHT_PX, VIEW_MIN_WIDTH_PX } from "../render/jump-view";
import { pictureSize, titlePlaceFor } from "./jump-picture";

describe("picture size", () => {
  it("fills a stage of the picture's own shape to its edges", () => {
    expect(pictureSize(712, 400, 1)).toEqual({ widthPx: 356, cssWidthPx: 712, cssHeightPx: 400 });
  });

  it("is the same on the page at any device pixel ratio", () => {
    expect(pictureSize(712, 400, 2)).toEqual({ widthPx: 356, cssWidthPx: 712, cssHeightPx: 400 });
  });

  it("never shows a game pixel smaller than a device pixel", () => {
    const size = pictureSize(100, 50, 1);
    expect(size.cssHeightPx).toBe(VIEW_HEIGHT_PX);
    expect(size.cssWidthPx).toBe(size.widthPx);
  });
});

/** A rectangle on the page, as getBoundingClientRect gives it. */
const rect =
  (left: number, top: number, width: number, height: number): (() => DOMRect) =>
  () => {
    const box = { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
    return { ...box, toJSON: () => box };
  };

describe("title place", () => {
  it("starts where the hill format expects at worst: right of a touch pause button at the smallest scale", () => {
    // The button as the stylesheet places it in landscape: 44 px wide, 8 + 6 px from the corner of the picture. At
    // exactly one CSS pixel per game pixel it lies below the title's rows; just above that it covers them.
    const scale = 1.01;
    const picture = { getBoundingClientRect: rect(0, 0, VIEW_MIN_WIDTH_PX * scale, VIEW_HEIGHT_PX * scale) };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the one method the code reads
    const canvas = picture as HTMLCanvasElement;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the one method the code reads
    const pause = { getBoundingClientRect: rect(14, 14, 44, 44) } as HTMLElement;
    expect(titlePlaceFor(canvas, pause, VIEW_MIN_WIDTH_PX).insetPx).toBe(TITLE_PAUSE_INSET_WORST_PX);
  });
});
