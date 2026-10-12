import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { HARNESS_BUNDLE, HARNESS_ENTRY, HARNESS_FILE, HARNESS_OUT_DIR } from "./sim-harness/paths";

// The simulation is bundled with the project's own Vite, with the defaults of a production build, into one
// script that every engine then runs. The bundle goes to an ignored directory and never into dist/.
test("bundle the simulation harness", async () => {
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      outDir: HARNESS_OUT_DIR,
      emptyOutDir: true,
      lib: { entry: HARNESS_ENTRY, formats: ["iife"], name: "simHarness", fileName: () => HARNESS_FILE },
    },
  });
  expect((await stat(HARNESS_BUNDLE)).size).toBeGreaterThan(0);
});
