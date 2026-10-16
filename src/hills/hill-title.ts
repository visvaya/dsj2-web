import { HUD_TOP_RIGHT_RESERVED_PX } from "../render/jump-view-hud";
import { TITLE_AT_PX, VIEW_MIN_WIDTH_PX } from "../render/jump-view";

/**
 * Where the hill's title starts at the latest: right of the pause button when it lies over the picture's top left
 * corner (touch steering in landscape). The button is 44 CSS px wide, 8 + 6 CSS px from the corner, so its right
 * edge is at column 58 or less at any scale from one CSS pixel per game pixel up (at exactly one it lies below the
 * title's rows), and the title keeps 3 more columns from it. A larger safe-area inset on the left moves the button
 * further right; that case is not covered.
 */
export const TITLE_PAUSE_INSET_WORST_PX = 61;

/** The widest hill title that fits between the pause button and the boxes at the top right of the narrowest view. */
export const HILL_TITLE_MAX_WIDTH_PX =
  VIEW_MIN_WIDTH_PX - HUD_TOP_RIGHT_RESERVED_PX - Math.max(TITLE_AT_PX.x, TITLE_PAUSE_INSET_WORST_PX);
