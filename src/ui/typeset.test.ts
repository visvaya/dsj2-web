import { describe, expect, it } from "vitest";
import { typeset } from "./typeset";

describe("typeset", () => {
  it("turns the places of division into soft hyphens and the bound spaces into no-break spaces", () => {
    expect(typeset("Za|mknij ją krzy|ży|kiem z~trybu")).toBe("Za­mknij ją krzy­ży­kiem z trybu");
  });

  it("leaves a text without marks as it is", () => {
    expect(typeset("Zachowano. 98,5 m")).toBe("Zachowano. 98,5 m");
  });
});
