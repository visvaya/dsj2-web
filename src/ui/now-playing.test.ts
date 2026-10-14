import { describe, expect, it } from "vitest";
import { UI_TEXT } from "../text/ui-text";
import { nowPlayingFor } from "./now-playing";

describe("what the phone shows of the game's sound", () => {
  it("names the game and the hill, with the game's icon", () => {
    const metadata = nowPlayingFor("Ćwiczebna K90", true);
    expect(metadata.title).toBe(UI_TEXT.appName);
    expect(metadata.artist).toBe("Trening: Ćwiczebna K90");
    expect(metadata.artwork?.map((image) => image.sizes)).toEqual(["192x192", "512x512"]);
  });

  it("leaves the icons out of a page that has none, so nothing is fetched for them", () => {
    expect(nowPlayingFor("Ćwiczebna K90", false)).not.toHaveProperty("artwork");
  });
});
