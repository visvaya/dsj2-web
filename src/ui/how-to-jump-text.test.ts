import { describe, expect, it } from "vitest";
import { howToJump, STEERING_NAME, type Steering } from "./how-to-jump-text";

const ALL: readonly Steering[] = ["mouse", "touch", "tilt"];

/** Everything the instructions say for one way of steering. */
const text = (steering: Steering): string =>
  howToJump(steering)
    .map((step) => step.text)
    .join(" ");

describe("how to jump", () => {
  it("tells the same steps in the same order for every way of steering, none of them empty", () => {
    const titles = howToJump("mouse").map((step) => step.title);
    expect(titles).toEqual(["Start", "Wybicie", "Lot", "Telemark", "Lądowanie na dwie nogi", "Następny skok", "Menu"]);
    for (const steering of ALL) {
      const steps = howToJump(steering);
      expect(steps.map((step) => step.title)).toEqual(titles);
      for (const step of steps) expect(step.text.length).toBeGreaterThan(20);
      expect(STEERING_NAME[steering].length).toBeGreaterThan(0);
    }
  });

  it("says how the width of a telemark is set, in every way of steering", () => {
    for (const steering of ALL) {
      const telemark = howToJump(steering).find((step) => step.title === "Telemark");
      expect(telemark?.text).toContain("im dłuższa przerwa, tym szerszy telemark");
    }
  });

  it("names what the player has in hand: keys and buttons, the zones, or thumbs on the screen", () => {
    expect(text("mouse")).toContain("Esc");
    expect(text("mouse")).toContain("F11");
    expect(text("touch")).toContain("pola P");
    // With tilt steering there are no zones and no keys to name.
    expect(text("tilt")).not.toMatch(/pol[ae] [LP]\b|Esc|F11|mysz/);
    expect(text("tilt")).toContain("kciuk");
  });
});
