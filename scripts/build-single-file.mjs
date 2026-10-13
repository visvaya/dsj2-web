// Packs the production build (dist/) into one self-contained HTML file, for
// hosts that accept a single page without separate assets (preview links).
// Usage: node scripts/build-single-file.mjs [out-file]  (run after `vite build`)
//
// The page is written outside dist/, which holds exactly what is deployed. It takes only the title, the
// stylesheet and the script from the build: no manifest, no icons and no marker of the regular build, so
// the single-file page never registers a service worker and fetches nothing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DIST_DIR = "dist";
const out = process.argv[2] ?? join("dist-single", "telemark.html");
const html = readFileSync(join(DIST_DIR, "index.html"), "utf8");

const MIME_BY_EXT = { woff2: "font/woff2", woff: "font/woff", png: "image/png", svg: "image/svg+xml" };

function asset(path) {
  return readFileSync(join(DIST_DIR, path.replace(/^\//, "")));
}

function inlineUrls(css) {
  return css.replaceAll(/url\((\/assets\/[^)]+)\)/g, (_, path) => {
    const ext = path.split(".").pop() ?? "";
    const mime = MIME_BY_EXT[ext];
    if (mime === undefined) throw new Error(`no MIME type for ${path}`);
    return `url(data:${mime};base64,${asset(path).toString("base64")})`;
  });
}

const scriptPath = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html)?.[1];
const stylePaths = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)].map((m) => m[1]);
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "Telemark";
if (scriptPath === undefined) throw new Error("module script not found in dist/index.html");

// An inline script ends at the first "</script", wherever it appears.
const js = asset(scriptPath).toString("utf8").replaceAll("</script", "<\\/script");
const css = stylePaths.map((p) => inlineUrls(asset(p).toString("utf8"))).join("\n");

const page = [
  `<title>${title}</title>`,
  // An empty icon, so the browser does not ask the host for one.
  `<link rel="icon" href="data:,">`,
  `<style>\n${css}\n</style>`,
  `<div id="root"></div>`,
  `<script type="module">\n${js}\n</script>`,
  "",
].join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`${out}: ${Math.round(page.length / 1024)} KiB`);
