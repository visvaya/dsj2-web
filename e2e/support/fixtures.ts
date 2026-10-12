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

interface Options {
  /**
   * The problems a test causes on purpose, as one pattern of their messages: the error the browser logs for a
   * script that is not there, for example. Set with `test.use` on the tests that break something, never wider.
   */
  expectedProblems: RegExp | null;
}

export const test = base.extend<Fixtures & Options>({
  expectedProblems: [null, { option: true }],
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
