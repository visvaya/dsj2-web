// A test file that no runner picks up never fails: it passes silently forever. Every file named like a test must
// match one of the runners' own patterns, or it is reported. Keep the patterns in step with the runners:
// vite.config.ts (test.include), playwright.config.ts (testMatch), the test:scripts command in package.json and
// the unittest discovery of the tools job in CI.

/** Patterns of the files each runner picks up, with the generated files that carry a test's name. */
const RUN_PATTERNS = [
  /^src\/(?:.+\/)?[^/]+\.test\.ts$/, // Vitest
  /^e2e\/(?:.+\/)?[^/]+\.(?:spec|perf|setup)\.ts$/, // Playwright
  /^scripts\/(?:.+\/)?[^/]+\.test\.mjs$/, // node --test
  /^tools\/re\/test_[^/]+\.py$/, // python -m unittest discover in tools/re
  /\/__snapshots__\/[^/]+\.snap$/, // Vitest snapshots
  /\.spec\.ts-snapshots\//, // Playwright snapshots
];

/** A name that says "this is a test". */
const looksLikeTest = (path) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return /\.(?:test|spec)\./.test(name) || /^test_.*\.py$/.test(name);
};

/** The files named like a test that no runner picks up, in the order given. Paths use forward slashes. */
export const findUnrunTestFiles = (paths) =>
  paths.filter((path) => looksLikeTest(path) && !RUN_PATTERNS.some((pattern) => pattern.test(path)));
