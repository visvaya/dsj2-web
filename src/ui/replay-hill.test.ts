import { describe, expect, it } from "vitest";
import { UI_TEXT } from "../text/ui-text";
import { missingHillNote, replayHillLabel } from "./replay-hill";

const earlier = { hill: { id: "own-1", name: "Ćwiczebna", kPointM: 90 } };
const original = { hill: { id: "original-35", name: "Karpacz", kPointM: 85 } };

describe("the hill of a replay", () => {
  it("names a hill whose profile was replaced as the earlier one", () => {
    expect(replayHillLabel(earlier)).toBe("Ćwiczebna K90 (dawny kształt)");
    expect(replayHillLabel(original)).toBe("Karpacz K85");
  });

  it("tells why a replay cannot be watched: a replaced profile is gone, an original hill needs the game files", () => {
    expect(missingHillNote(earlier)).toBe(UI_TEXT.replays.hillRetired);
    expect(missingHillNote(original)).toBe(UI_TEXT.replays.hillMissing);
  });
});
