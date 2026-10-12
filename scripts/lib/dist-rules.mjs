// Rules for the production build output, as pure functions over a listing of dist/.
// A listing entry is { path, gzipBytes, head }: the path relative to dist/ with forward
// slashes, the gzip size of the file and its first bytes.

// Gzip budgets, about 15% above the sizes measured on 2026-10-12 after `pnpm build`
// (JavaScript 102179 bytes, CSS 8512 bytes; zlib default level). Tighten them when the
// bundle shrinks; raise one only together with the change that explains the growth.
export const DIST_BUDGETS = {
  JS_GZIP_BUDGET_BYTES: 117_500,
  CSS_GZIP_BUDGET_BYTES: 9_800,
};

// What the build produces: the page, the single-file page (only after `pnpm build:single`)
// and hashed bundles and fonts under assets/.
const ALLOWED_PATH_PATTERNS = [/^index\.html$/, /^telemark\.html$/, /^assets\/[\w.-]+-[\w-]{8}\.(?:js|css|woff2?)$/];

// Files of the original game and data derived from it are never shipped.
const GAME_FILE_PATTERN = /\.(?:exe|dat|rpl|trace|hilltrace)$/i;

// "MZ", the first two bytes of a DOS or Windows executable.
const MZ_SIGNATURE = [0x4d, 0x5a];

function isAllowedPath(path) {
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function startsWithMzSignature(head) {
  return MZ_SIGNATURE.every((byte, index) => head[index] === byte);
}

export function sumGzipBytes(files, extension) {
  return files.filter((file) => file.path.endsWith(extension)).reduce((sum, file) => sum + file.gzipBytes, 0);
}

function findBudgetProblems(files, budgets) {
  const sums = [
    { label: "JavaScript", bytes: sumGzipBytes(files, ".js"), budgetBytes: budgets.JS_GZIP_BUDGET_BYTES },
    { label: "CSS", bytes: sumGzipBytes(files, ".css"), budgetBytes: budgets.CSS_GZIP_BUDGET_BYTES },
  ];
  return sums
    .filter((sum) => sum.bytes > sum.budgetBytes)
    .map((sum) => `${sum.label} gzip size ${sum.bytes} bytes exceeds the budget of ${sum.budgetBytes} bytes`);
}

// Returns one message per problem; an empty list means the build output is acceptable.
export function findDistProblems(files, budgets) {
  const gameFiles = files.filter((file) => GAME_FILE_PATTERN.test(file.path));
  const executables = files.filter((file) => startsWithMzSignature(file.head));
  const unexpected = files.filter((file) => !isAllowedPath(file.path) && !GAME_FILE_PATTERN.test(file.path));
  return [
    ...gameFiles.map((file) => `game file extension: ${file.path}`),
    ...executables.map((file) => `MZ executable signature: ${file.path}`),
    ...unexpected.map((file) => `not on the allow-list: ${file.path}`),
    ...findBudgetProblems(files, budgets),
  ];
}

export function formatDistSummary(files, budgets) {
  const jsBytes = sumGzipBytes(files, ".js");
  const cssBytes = sumGzipBytes(files, ".css");
  return (
    `${files.length} files; JavaScript gzip ${jsBytes} of ${budgets.JS_GZIP_BUDGET_BYTES} bytes; ` +
    `CSS gzip ${cssBytes} of ${budgets.CSS_GZIP_BUDGET_BYTES} bytes`
  );
}
