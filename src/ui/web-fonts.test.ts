import { describe, expect, it } from "vitest";
import { FONT_WAIT_LIMIT_MS, webFontsReady, type FontLoader } from "./web-fonts";

const never = new Promise<never>(() => undefined);
const neverWait = (): Promise<void> => never;

/** Resolves to true when the promise settles within a few turns of the event loop, to false otherwise. */
function settlesSoon(promise: Promise<void>): Promise<boolean> {
  const later = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, 20);
  });
  return Promise.race([promise.then(() => true), later]);
}

describe("webFontsReady", () => {
  it("asks for every face with a text from its unicode range", async () => {
    const asked: string[] = [];
    const fonts: FontLoader = {
      load: (font, text) => {
        asked.push(`${font} for ${text ?? ""}`);
        return Promise.resolve([]);
      },
    };
    await webFontsReady(fonts, FONT_WAIT_LIMIT_MS, neverWait);
    expect(asked).toEqual(['1em "Silkscreen" for Telemark', '1em "Silkscreen" for Ā', '1em "Telemark Polish" for ą']);
  });

  it("waits until the fonts have loaded", async () => {
    const finishLoading: (() => void)[] = [];
    const loading = new Promise<void>((resolve) => {
      finishLoading.push(resolve);
    });
    const ready = webFontsReady({ load: () => loading }, FONT_WAIT_LIMIT_MS, neverWait);
    expect(await settlesSoon(ready)).toBe(false);
    for (const finish of finishLoading) finish();
    expect(await settlesSoon(ready)).toBe(true);
  });

  it("stops waiting at the limit when a font never loads", async () => {
    const limits: number[] = [];
    const wait = (ms: number): Promise<void> => {
      limits.push(ms);
      return Promise.resolve();
    };
    const ready = webFontsReady({ load: () => never }, 250, wait);
    expect(await settlesSoon(ready)).toBe(true);
    expect(limits).toEqual([250]);
  });

  it("does not fail when a font cannot be loaded", async () => {
    const fonts: FontLoader = { load: () => Promise.reject(new Error("no such font")) };
    await expect(webFontsReady(fonts, FONT_WAIT_LIMIT_MS, neverWait)).resolves.toBeUndefined();
  });

  it("does not wait where fonts cannot be loaded from script", async () => {
    await expect(webFontsReady(undefined, FONT_WAIT_LIMIT_MS, neverWait)).resolves.toBeUndefined();
  });
});
