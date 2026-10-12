// Loads a TypeScript module of this project into Node for a command-line script.
//
// The sources import each other without file extensions, which Node's own TypeScript
// support cannot resolve, so the module goes through Vite's server-side module loader: the
// same resolution and transform the tests and the build use, with no further dependency.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The scripts are plain JavaScript that the linter checks without type information. A static
// import of Vite would bring Node's type declarations into all of them and change what the
// type-aware rules report in every script, so Vite is loaded at run time instead.
const { createServer } = createRequire(import.meta.url)("vite");

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `modulePath` is relative to the project root, for example "src/sim/replay.ts".
export async function loadTypeScript(modulePath) {
  const server = await createServer({
    root: PROJECT_ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    return await server.ssrLoadModule(`/${modulePath}`);
  } finally {
    await server.close();
  }
}
