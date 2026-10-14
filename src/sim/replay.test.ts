import { describe, expect, it } from "vitest";
import { parseReplayRecord } from "./replay";

const RECORD_BYTES = 0x4b5;

describe("replay record", () => {
  it("reads the version tag as the 13 characters of the header, which has no length byte", () => {
    for (const tag of ["//DSJ_v2.00//", "//DSJ_v2.1P//"]) {
      const header = new TextEncoder().encode(tag);
      expect(parseReplayRecord(header, new Uint8Array(RECORD_BYTES)).versionTag).toBe(tag);
    }
  });
});
