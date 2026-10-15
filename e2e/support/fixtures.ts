import { test as base, expect } from "@playwright/test";

/** What a test needs to know about the device profile it runs on. */
export interface DeviceTraits {
  /** Name of the Playwright project, for the tests that run on named projects only. */
  project: string;
  /** Mouse and keyboard, no touch zones. */
  desktop: boolean;
  /** A coarse pointer: the game shows its touch zones and the pause button. */
  touch: boolean;
  landscape: boolean;
}

interface Fixtures {
  traits: DeviceTraits;
  /** Uncaught page errors and console errors seen so far; any unexpected one fails the test when it ends. */
  pageProblems: string[];
}

/**
 * The motion sensor a test's browser has: none (the default, so a touch screen leans with the finger as most
 * tests expect), one that reads steadily, one that gives no readings, or one that asks the player first and
 * then gives it or refuses it (as on an iPhone; the first request, made without a tap, is always refused).
 */
export type MotionSensor = "none" | "steady" | "silent" | "asks-grant" | "asks-deny";

interface Options {
  motionSensor: MotionSensor;
  /**
   * The problems a test causes on purpose, as one pattern of their messages: the error the browser logs for a
   * script that is not there, for example. Set with `test.use` on the tests that break something, never wider.
   */
  expectedProblems: RegExp | null;
}

/**
 * The local mode runs a real browser without a window, and such a browser can still take the mouse of the
 * machine when the game captures it for a jump: the cursor of whoever is working there freezes. In that mode the
 * capture is refused in the page, which the game allows for (it plays without it). The runner has no cursor
 * to take, so the capture is left alone there.
 */
const REFUSE_MOUSE_CAPTURE = Boolean(process.env["BROWSER_TESTS_EDGE"]);

/** Runs in the page before its scripts: replaces the browser's motion sensor with the one the test asks for. */
function fakeMotionSensor(kind: MotionSensor): void {
  if (kind === "none") {
    Reflect.deleteProperty(window, "DeviceOrientationEvent");
    Object.defineProperty(window, "DeviceOrientationEvent", { value: undefined, configurable: true });
    return;
  }
  const sensor = function DeviceOrientationEvent() {};
  if (kind === "asks-grant" || kind === "asks-deny") {
    let asked = 0;
    Object.defineProperty(sensor, "requestPermission", {
      value: () => {
        asked++;
        if (asked === 1) return Promise.reject(new DOMException("Needs a tap", "NotAllowedError"));
        return Promise.resolve(kind === "asks-grant" ? "granted" : "denied");
      },
    });
  }
  Object.defineProperty(window, "DeviceOrientationEvent", { value: sensor, configurable: true });
  if (kind === "silent") return;
  setInterval(() => {
    window.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 0, beta: 30, gamma: 0 }));
  }, 50);
}

export const test = base.extend<Fixtures & Options>({
  expectedProblems: [null, { option: true }],
  motionSensor: ["none", { option: true }],
  context: async ({ context, motionSensor }, provide) => {
    await context.addInitScript(fakeMotionSensor, motionSensor);
    if (REFUSE_MOUSE_CAPTURE) {
      await context.addInitScript(() => {
        Element.prototype.requestPointerLock = () =>
          Promise.reject(new DOMException("The mouse is not captured in local tests", "NotSupportedError"));
      });
    }
    await provide(context);
  },
  traits: async ({ hasTouch, viewport }, provide, testInfo) => {
    await provide({
      project: testInfo.project.name,
      desktop: !hasTouch,
      touch: hasTouch,
      landscape: viewport !== null && viewport.width > viewport.height,
    });
  },
  // Every page of the test's browser context is watched, so a test that opens a second window is covered too.
  // Nothing is allowed by default: the game logs no errors of its own, and an error on any screen is a defect.
  pageProblems: [
    async ({ context, expectedProblems }, provide) => {
      const problems: string[] = [];
      context.on("weberror", (webError) => problems.push(`page error: ${webError.error().message}`));
      context.on("console", (message) => {
        if (message.type() === "error") problems.push(`console error: ${message.text()}`);
      });
      await provide(problems);
      const unexpected = problems.filter((problem) => expectedProblems?.test(problem) !== true);
      expect(unexpected, "page errors and console errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
