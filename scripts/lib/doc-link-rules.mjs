// Rules of the documentation link check: every relative Markdown link and every backticked path that starts
// with a directory of the repository must name something that exists. Pure functions: scripts/check-doc-links.mjs
// lists the documents and answers whether a path exists.
//
// A document is { file, text } with a repository-relative path that uses forward slashes. A problem is a
// string "file:line: message".
import { posix } from "node:path";

/** An inline Markdown link or image: [text](target) or ![alt](target). */
const LINK = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
/** A backticked token without white space. */
const BACKTICKED = /`([^`\s]+)`/g;
/** A scheme (https:, mailto:) marks an address, not a file of the repository. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Globs and placeholders name a family of files, not one path. */
const PATTERN_CHARACTERS = /[*?<>{}[\]$]/;
const FENCE = /^\s*(```|~~~)/;

/** The path inside a backticked token: without a line number or the punctuation of the sentence around it. */
function pathOfToken(token) {
  return token
    .replace(/[,;.)]+$/, "")
    .replace(/:\d+(-\d+)?$/, "")
    .replace(/\/+$/, "");
}

/** The repository path a relative link points to, or null for an address or an anchor in the same document. */
function pathOfLink(file, target) {
  if (SCHEME.test(target) || target.startsWith("#") === true) return null;
  const withoutSuffix = target.replace(/[?#].*$/, "");
  return posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(withoutSuffix)));
}

/** The lines of a document outside fenced code blocks, with their numbers. */
function proseLines(text) {
  let fenced = false;
  return text.split("\n").flatMap((content, index) => {
    if (FENCE.test(content)) {
      fenced = !fenced;
      return [];
    }
    return fenced ? [] : [{ line: index + 1, content }];
  });
}

function lineProblems(file, { line, content }, { exists, roots }) {
  const links = [...content.matchAll(LINK)].flatMap(([, target]) => {
    const path = pathOfLink(file, target);
    return path === null || exists(path) === true ? [] : [`${file}:${line}: link \`${target}\` does not exist`];
  });
  const paths = [...content.matchAll(BACKTICKED)].flatMap(([, token]) => {
    const path = pathOfToken(token);
    const isRepositoryPath = roots.includes(path.split("/")[0]) === true && !PATTERN_CHARACTERS.test(path);
    return !isRepositoryPath || exists(path) === true ? [] : [`${file}:${line}: \`${path}\` does not exist`];
  });
  return [...links, ...paths];
}

/**
 * The dead references of the documents, in document and line order. `roots` are the top-level directories of
 * the repository: a backticked token counts as a path only when it starts with one of them.
 */
export function findDocLinkProblems(docs, facts) {
  return docs.flatMap(({ file, text }) => proseLines(text).flatMap((line) => lineProblems(file, line, facts)));
}
