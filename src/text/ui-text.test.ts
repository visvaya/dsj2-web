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
  // The names of hills are data: the original's Polish hills, as v2.10P names them, and the game's own hills.
  "game/hill-choice.ts": "hill names",
  "hills/own-hills.ts": "hill names",
  // The comments quote the part names of the original's colour editor from Dsj.dat.
  "game/outfit.ts": "original texts quoted in comments",
  // A character the Polish font face declares, so that the face is loaded; not a text for the player.
  "ui/web-fonts.ts": "font sample character",
} as const;

const DIACRITIC = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

/**
 * A JSX attribute that a player reads or hears, given a non-empty literal instead of a text from the module:
 * "...", {"..."} or {`...`}. An empty one stays allowed (alt="" marks a picture as decoration).
 */
const LITERAL_TEXT_ATTRIBUTE =
  /(?<![\w-])(aria-label|aria-description|aria-roledescription|aria-valuetext|aria-placeholder|title|alt|placeholder|label)=\{?\s*(["'`])(?!\2)/g;

/** The text attributes of a source that hold a literal, as `name=` with the line they are on. */
function literalTextAttributes(source: string): string[] {
  return source
    .split("\n")
    .flatMap((line, index) =>
      [...line.matchAll(LITERAL_TEXT_ATTRIBUTE)].map((match) => `${match[1] ?? ""}= on line ${index + 1}`),
    );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("interface texts", () => {
  /**
   * A rough guard: a Polish text written without any diacritic gets past it. Text typed between JSX tags is
   * caught by the lint rule react/jsx-no-literals and text in the attributes a player reads or hears by the test
   * below, whatever its letters. Texts drawn into the picture of the jump are checked against a pseudo-language in
   * src/render/jump-view.text-source.test.ts. What none of them sees is a text without diacritics in a plain
   * string of another .ts file (a screen reader announcement, for example).
   */
  it("live in the text module, judged by Polish diacritics outside it", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .filter((path) => !SKIPPED.some((pattern) => pattern.test(path)) && !(path in ALLOWED))
      .filter((path) => DIACRITIC.test(readFileSync(join(SRC, path), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("are not typed into the attributes of JSX that a player reads or hears", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replaceAll("\\", "/"))
      .filter((path) => path.endsWith(".tsx") && !SKIPPED.some((pattern) => pattern.test(path)))
      .flatMap((path) => literalTextAttributes(readFileSync(join(SRC, path), "utf8")).map((at) => `${path}: ${at}`));
    expect(offenders).toEqual([]);
  });

  it("finds a literal in a text attribute, in each way JSX can write it", () => {
    const source = [
      '<button aria-label="Start">',
      "<img alt={'flaga'} />",
      "<Pad label={`L: start`} />",
      '<p title="Menu" className="note">',
    ].join("\n");
    expect(literalTextAttributes(source)).toEqual([
      "aria-label= on line 1",
      "alt= on line 2",
      "label= on line 3",
      "title= on line 4",
    ]);
    // Texts from the module, references to other elements, an empty alt and other attributes pass.
    const clean = [
      "<button aria-label={UI_TEXT.back}>",
      '<nav aria-labelledby="menu-title" className="menu">',
      '<img alt="" src={flag} />',
      '<span aria-hidden="true">{JUMP_TEXT.pauseKey}</span>',
    ].join("\n");
    expect(literalTextAttributes(clean)).toEqual([]);
  });

  it("keeps each listed exception needed", () => {
    for (const path of Object.keys(ALLOWED)) expect(DIACRITIC.test(readFileSync(join(SRC, path), "utf8"))).toBe(true);
  });

  it("writes texts with a value the way the screens showed them", () => {
    expect(UI_TEXT.hillLabel("Ćwiczebna", 90)).toBe("Ćwiczebna K90");
    expect(UI_TEXT.hud.distance("98,5")).toBe("98,5\u2009ｍ");
    expect(UI_TEXT.menu.filesRemembered(true)).toBe("Pliki (Dsj.exe, Dsj.dat) zapamiętane w tej przeglądarce.");
  });
});
