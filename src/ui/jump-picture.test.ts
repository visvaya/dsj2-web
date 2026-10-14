import { describe, expect, it } from "vitest";
import { VIEW_HEIGHT_PX } from "../render/jump-view";
import { pictureSize } from "./jump-picture";

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
