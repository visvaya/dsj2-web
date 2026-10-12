// The icons of the installable game: which files exist, and how each is made from the game's own picture
// (src/pwa/icon-picture.ts). A picture is drawn at `pictureSizePx` game pixels and enlarged by a whole factor,
// without smoothing.
//
// The maskable icon is the same picture as the plain one of its size: the figure sits inside the circle a
// launcher may cut the icon to, and the picture fills the square to its edges, so nothing transparent shows.
import { loadTypeScript } from "./load-typescript.mjs";
import { encodePng, scaleNearest } from "./png.mjs";

export const ICON_FILES = [
  { path: "icons/icon-192.png", sizePx: 192, pictureSizePx: 64 },
  { path: "icons/icon-512.png", sizePx: 512, pictureSizePx: 64 },
  { path: "icons/icon-maskable-512.png", sizePx: 512, pictureSizePx: 64 },
  { path: "icons/apple-touch-icon.png", sizePx: 180, pictureSizePx: 60 },
];

// Draws every icon: [{ path, sizePx, rgb, png }].
export async function renderIcons() {
  const { iconPicture } = await loadTypeScript("src/pwa/icon-picture.ts");
  return ICON_FILES.map((icon) => {
    const picture = iconPicture(icon.pictureSizePx);
    const scaled = scaleNearest(
      { width: picture.sizePx, height: picture.sizePx, rgb: picture.rgb },
      icon.sizePx / icon.pictureSizePx,
    );
    return { path: icon.path, sizePx: icon.sizePx, rgb: scaled.rgb, png: encodePng(scaled) };
  });
}
