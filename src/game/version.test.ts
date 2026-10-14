import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_VERSION, versionLabel } from "./version";

function packageVersion(): unknown {
  const pkg: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  return typeof pkg === "object" && pkg !== null && "version" in pkg ? pkg.version : undefined;
}

describe("version of the game", () => {
  it("is the version in package.json", () => {
    expect(GAME_VERSION).toBe(packageVersion());
  });

  it("is shown as a word and the number", () => {
    expect(versionLabel("0.3.1")).toBe("wersja 0.3.1");
  });
});
