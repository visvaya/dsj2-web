import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * Browser tests of the production build on desktop, phone and tablet profiles.
 *
 * In CI every project runs with the browsers Playwright installs. With BROWSER_TESTS_EDGE set (the local mode,
 * `pnpm test:browser:edge`) only the Chromium-based projects run, in the Microsoft Edge already on the machine,
 * so nothing has to be downloaded; Firefox and WebKit are then not exercised at all.
 */
const PORT = 4317;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const VITE = "node node_modules/vite/bin/vite.js";
const PREVIEW = `${VITE} preview --host 127.0.0.1 --port ${PORT} --strictPort`;
const inCi = Boolean(process.env["CI"]);
const localEdge = Boolean(process.env["BROWSER_TESTS_EDGE"]);

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
/**
 * The Chromium-based projects run in a full browser in its headless mode: Edge locally, Chromium on the runner.
 * Playwright's separate headless shell did not start a jump from a held mouse button on the runner, while the
 * full browser does.
 */
const chromiumChannel = { channel: localEdge ? "msedge" : "chromium" };
/** Builds the simulation harness once; the projects that load it depend on this one. */
const HARNESS_PROJECT = "sim-harness-build";

/** The projects the local mode can run: Edge is Chromium-based. */
const chromiumProjects: Project[] = [
  {
    name: "desktop-chromium",
    use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, ...chromiumChannel },
    dependencies: [HARNESS_PROJECT],
  },
  { name: "android-portrait", use: { ...devices["Pixel 7"], ...chromiumChannel } },
  { name: "android-landscape", use: { ...devices["Pixel 7 landscape"], ...chromiumChannel } },
];

const firefoxAndWebkitProjects: Project[] = [
  {
    name: "desktop-firefox",
    use: { ...devices["Desktop Firefox"], viewport: DESKTOP_VIEWPORT },
    dependencies: [HARNESS_PROJECT],
  },
  {
    name: "desktop-webkit",
    use: { ...devices["Desktop Safari"], viewport: DESKTOP_VIEWPORT },
    dependencies: [HARNESS_PROJECT],
  },
  { name: "iphone-portrait", use: { ...devices["iPhone 14"] } },
  { name: "iphone-landscape", use: { ...devices["iPhone 14 landscape"] } },
  { name: "tablet-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
];

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  // A jump runs in real time and takes about fifteen seconds; a test may need to repeat one.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  // The game keeps real time, so a crowded machine makes it drop simulation steps: one worker fewer than the
  // runner has processors, two on a developer's machine.
  workers: inCi ? 3 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: HARNESS_PROJECT, testMatch: "**/sim-harness.setup.ts" },
    ...chromiumProjects,
    ...(localEdge ? [] : firefoxAndWebkitProjects),
  ],
  // The tests run against the production build. CI has built it in an earlier step and serves exactly the files
  // it has just checked; the local mode builds first, so a stale dist/ is never tested.
  webServer: {
    command: inCi ? PREVIEW : `${VITE} build && ${PREVIEW}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
