import { writeFile } from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import {
  button,
  closeJumpControls,
  openHillList,
  openJump,
  openJumpControls,
  openMenu,
  openOutfit,
  press,
  TEXT,
} from "./support/app";
import { expect, test } from "./support/fixtures";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** One desktop and one phone layout: the markup is the same in every engine, the layout differs by pointer. */
const SCANNED_PROJECTS = ["desktop-chromium", "android-portrait"];

// Every screen of the game. The test fails when one is not reached, so a new screen has to be added here
// instead of escaping the scan. The controls behind the pause button exist only on touch screens.
const SCREENS = ["menu", "hill list", "outfit", "jump"] as const;
const TOUCH_SCREENS = ["jump with the controls open"] as const;
type ScreenName = (typeof SCREENS)[number] | (typeof TOUCH_SCREENS)[number];

interface Unverified {
  screen: ScreenName;
  rule: string;
  nodes: string[];
}

interface Scan {
  scanned: ScreenName[];
  /** Results axe could not decide ("incomplete"): not violations, and not passes either. */
  unverified: Unverified[];
}

async function scan(page: Page, screen: ScreenName, into: Scan): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "no impact"}): ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(", ")}`,
  );
  expect(violations, `axe violations on "${screen}"`).toEqual([]);
  into.scanned.push(screen);
  into.unverified.push(
    ...results.incomplete.map((result) => ({
      screen,
      rule: result.id,
      nodes: result.nodes.map((node) => node.target.join(" ")),
    })),
  );
}

/** The undecided results go into the report and into a file of the test's output, to be read after a run. */
async function recordUnverified(testInfo: TestInfo, unverified: Unverified[]): Promise<void> {
  const path = testInfo.outputPath("axe-incomplete.json");
  await writeFile(path, JSON.stringify(unverified, null, 2));
  await testInfo.attach("axe-incomplete", { path, contentType: "application/json" });
}

test.skip(({ traits }) => !SCANNED_PROJECTS.includes(traits.project), `axe runs on ${SCANNED_PROJECTS.join(" and ")}`);

test("every screen passes an axe WCAG 2.2 AA scan", async ({ page, traits }, testInfo) => {
  const result: Scan = { scanned: [], unverified: [] };

  await openMenu(page);
  await scan(page, "menu", result);

  await openOutfit(page, traits);
  await scan(page, "outfit", result);
  await press(button(page, TEXT.back), traits);

  await openHillList(page, traits);
  await scan(page, "hill list", result);

  await openJump(page, traits);
  await scan(page, "jump", result);
  if (traits.touch) {
    await openJumpControls(page, traits);
    await scan(page, "jump with the controls open", result);
    await closeJumpControls(page, traits);
  }

  await recordUnverified(testInfo, result.unverified);
  expect(result.scanned.toSorted()).toEqual([...SCREENS, ...(traits.touch ? TOUCH_SCREENS : [])].toSorted());
});
