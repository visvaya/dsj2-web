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
  /** Uncaught page errors and console errors seen so far; any of them fails the test when it ends. */
  pageProblems: string[];
}

export const test = base.extend<Fixtures>({
  traits: async ({ hasTouch, viewport }, provide, testInfo) => {
    await provide({
      project: testInfo.project.name,
      desktop: !hasTouch,
      touch: hasTouch,
      landscape: viewport !== null && viewport.width > viewport.height,
    });
  },
  // Nothing is allow-listed: the game logs no errors of its own, and an error on any screen is a defect.
  pageProblems: [
    async ({ page }, provide) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console error: ${message.text()}`);
      });
      await provide(problems);
      expect(problems, "page errors and console errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
