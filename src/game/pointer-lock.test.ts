import { describe, expect, it } from "vitest";
import { lockLossAction } from "./pointer-lock";

describe("losing the mouse capture", () => {
  it("leaves the jump when the player took the mouse back with Escape", () => {
    expect(lockLossAction({ releasedByGame: false, focused: true, hidden: false })).toBe("exit");
  });

  it("stays when the game let the mouse go itself", () => {
    expect(lockLossAction({ releasedByGame: true, focused: true, hidden: false })).toBe("stay");
  });

  it("stays when the window lost focus or the tab was hidden", () => {
    expect(lockLossAction({ releasedByGame: false, focused: false, hidden: false })).toBe("stay");
    expect(lockLossAction({ releasedByGame: false, focused: true, hidden: true })).toBe("stay");
  });
});
