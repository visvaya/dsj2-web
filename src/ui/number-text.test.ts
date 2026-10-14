import { describe, expect, it } from "vitest";
import { formatDecimal, formatSize } from "./number-text";

describe("numbers as the player reads them", () => {
  it("are written with a decimal comma and a fixed number of digits", () => {
    expect(formatDecimal(67.37999725341797, 2)).toBe("67,38");
    expect(formatDecimal(62, 1)).toBe("62,0");
    expect(formatDecimal(-17.5, 1)).toBe("-17,5");
  });

  it("give a size in kilobytes or megabytes, kept on one line with its unit", () => {
    expect(formatSize(2048)).toBe("2,0\u00a0KB");
    expect(formatSize(999_949)).toBe("999,9\u00a0KB");
    expect(formatSize(5_000_000)).toBe("5,0\u00a0MB");
  });
});
