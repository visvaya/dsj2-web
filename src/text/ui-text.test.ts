import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_TEXT } from "./ui-text";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * Where Polish letters with diacritics may stay outside the text module. The simulation, the reading of the
 * original's files and the glyphs of the pixel font are left out as a whole; tests are left out too.
 */
const SKIPPED = [/^text\//, /^sim\//, /^original\//, /^render\/pixel-font\.ts$/, /\.test\.tsx?$/];

const ALLOWED = {
  // The names of hills are data: the game's own hill and the original's Polish hills, as v2.10P names them.
  "game/hill-choice.ts": "hill names",
  // The comments quote the part names of the original's colour editor from Dsj.dat.
  "game/outfit.ts": "original texts quoted in comments",
  // A character the Polish font face declares, so that the face is loaded; not a text for the player.
  "ui/web-fonts.ts": "font sample character",
} as const;

const DIACRITIC = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("interface texts", () => {
  /**
   * A rough guard: a Polish text written without any diacritic gets past it. It catches most texts for the
   * player that were typed into a component instead of the text module.
   */
  it("live in the text module, judged by Polish diacritics outside it", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .filter((path) => !SKIPPED.some((pattern) => pattern.test(path)) && !(path in ALLOWED))
      .filter((path) => DIACRITIC.test(readFileSync(join(SRC, path), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps each listed exception needed", () => {
    for (const path of Object.keys(ALLOWED)) expect(DIACRITIC.test(readFileSync(join(SRC, path), "utf8"))).toBe(true);
  });

  it("writes texts with a value the way the screens showed them", () => {
    expect(UI_TEXT.hillLabel("Ćwiczebna", 90)).toBe("Ćwiczebna K90");
    expect(UI_TEXT.hud.distance("98.5")).toBe("98.5 M");
    expect(UI_TEXT.menu.filesRemembered(true)).toBe("Pliki (Dsj.exe, Dsj.dat) zapamiętane w tej przeglądarce.");
  });
});
