import { describe, expect, it } from "vitest";
import { diagnosticsRequested } from "./diagnostics";

describe("diagnostics switch in the address", () => {
  it("is on when the address has the key, with or without a value", () => {
    expect(diagnosticsRequested("?diag")).toBe(true);
    expect(diagnosticsRequested("?diag=")).toBe(true);
    expect(diagnosticsRequested("?diag=0")).toBe(true);
    expect(diagnosticsRequested("?a=1&diag")).toBe(true);
    expect(diagnosticsRequested("diag")).toBe(true);
  });

  it("is off without the key", () => {
    expect(diagnosticsRequested("")).toBe(false);
    expect(diagnosticsRequested("?")).toBe(false);
    expect(diagnosticsRequested("?diagnostics")).toBe(false);
    expect(diagnosticsRequested("?a=diag")).toBe(false);
    expect(diagnosticsRequested("?DIAG")).toBe(false);
  });
});
