import { describe, expect, it } from "vitest";
import { lockLossAction, requestMouseCapture } from "./pointer-lock";

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

describe("asking for the mouse capture", () => {
  it("asks the element once", () => {
    let asked = 0;
    requestMouseCapture({
      requestPointerLock: () => {
        asked++;
        return Promise.resolve();
      },
    });
    expect(asked).toBe(1);
  });

  it("ignores an engine that returns nothing instead of a promise", () => {
    expect(() => requestMouseCapture({ requestPointerLock: () => undefined })).not.toThrow();
  });

  it("ignores an engine that throws", () => {
    expect(() =>
      requestMouseCapture({
        requestPointerLock: () => {
          throw new Error("refused");
        },
      }),
    ).not.toThrow();
  });

  it("leaves no unhandled rejection when the capture is refused", async () => {
    const refusal = Promise.reject(new Error("refused"));
    requestMouseCapture({ requestPointerLock: () => refusal });
    await expect(refusal).rejects.toThrow("refused");
  });
});
