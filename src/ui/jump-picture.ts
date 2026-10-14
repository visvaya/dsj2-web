import { FrameBuffer } from "../render/frame-buffer";
import { VIEW_HEIGHT_PX, pictureScale, viewWidthFor } from "../render/jump-view";

/** The picture of the jump in game pixels, and the same bytes as the canvas takes them. */
export interface JumpPicture {
  fb: FrameBuffer;
  image: ImageData;
}

export function makePicture(width: number): JumpPicture {
  const fb = new FrameBuffer(width, VIEW_HEIGHT_PX);
  return { fb, image: new ImageData(fb.bytes, width, VIEW_HEIGHT_PX) };
}

/** Game pixels between the pause button and the name of the hill beside it. */
const TITLE_GAP_PX = 3;
/** Rows of game pixels at the top of the picture that hold the name of the hill. */
const TITLE_ROWS_PX = 12;

/**
 * How far, in game pixels, the name of the hill has to start from the left edge of the picture to clear the
 * pause button, which lies over the top left corner with tilt steering in landscape; zero when it does not.
 */
export function titleInsetFor(canvas: HTMLCanvasElement, pause: HTMLElement | null, widthPx: number): number {
  if (pause === null) return 0;
  const picture = canvas.getBoundingClientRect();
  const button = pause.getBoundingClientRect();
  if (picture.width === 0 || button.width === 0) return 0;
  const scale = picture.width / widthPx;
  const overTitle =
    button.right > picture.left &&
    button.left < picture.right &&
    button.bottom > picture.top &&
    button.top < picture.top + TITLE_ROWS_PX * scale;
  return overTitle ? Math.ceil((button.right - picture.left) / scale) + TITLE_GAP_PX : 0;
}

/** How the canvas is sized for a stage: game pixels across, and the size on the page in CSS pixels. */
export interface PictureSize {
  widthPx: number;
  cssWidthPx: number;
  cssHeightPx: number;
}

/**
 * As many game pixels across as the shape of the stage asks for, scaled to its edges: in a window as in full
 * screen, a frame around the picture is worse than game pixels that differ by a fraction of a device pixel.
 */
export function pictureSize(stageWidthPx: number, stageHeightPx: number, devicePixelRatio: number): PictureSize {
  const widthPx = viewWidthFor(stageWidthPx, stageHeightPx);
  const fill = Math.min(
    (stageWidthPx * devicePixelRatio) / widthPx,
    (stageHeightPx * devicePixelRatio) / VIEW_HEIGHT_PX,
  );
  const scale = pictureScale(fill);
  return {
    widthPx,
    cssWidthPx: (widthPx * scale) / devicePixelRatio,
    cssHeightPx: (VIEW_HEIGHT_PX * scale) / devicePixelRatio,
  };
}
