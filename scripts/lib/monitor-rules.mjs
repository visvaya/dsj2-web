// What the scheduled monitor adds to the check of the deployed files (scripts/check-deployment.mjs), as pure
// functions: the commit the served release names, the certificate, and the time the start page takes. The
// requests are made by scripts/monitor-deployment.mjs.

export const MONITOR_LIMITS = {
  // The host renews its certificate weeks before the end; fewer days left means the renewal did not happen.
  CERTIFICATE_MIN_DAYS_LEFT: 14,
  // For the median of the samples, as seen from a runner in a data centre. Far above what the host normally
  // takes: the monitor is after an address that barely answers, not after a slow day.
  START_PAGE_MEDIAN_BUDGET_MS: 1500,
  START_PAGE_SAMPLES: 5,
};

const MS_PER_DAY = 86_400_000;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;

// The release an address serves, from its release.json: { sourceSha, contentId }. The commit is handed to git
// afterwards, so anything that is not a full commit hash is refused here.
export function releaseOfAddress(releaseText) {
  let release;
  try {
    release = JSON.parse(releaseText);
  } catch {
    throw new Error("/release.json: not JSON");
  }
  if (typeof release?.sourceSha !== "string" || !SOURCE_SHA_PATTERN.test(release.sourceSha)) {
    throw new Error("/release.json: names no commit");
  }
  return { sourceSha: release.sourceSha, contentId: String(release.contentId) };
}

export function certificateDaysLeft(validToMs, nowMs) {
  return Math.floor((validToMs - nowMs) / MS_PER_DAY);
}

// A certificate is { validFromMs, validToMs }; that it is trusted and names the host is checked when the
// connection is made.
export function findCertificateProblems(certificate, nowMs, minDaysLeft) {
  if (Number.isNaN(certificate.validFromMs) || Number.isNaN(certificate.validToMs)) {
    return ["certificate: its dates cannot be read"];
  }
  if (nowMs < certificate.validFromMs) return ["certificate: not valid yet"];
  const daysLeft = certificateDaysLeft(certificate.validToMs, nowMs);
  if (daysLeft < 0) return ["certificate: expired"];
  return daysLeft < minDaysLeft ? [`certificate: ${daysLeft} days left, expected at least ${minDaysLeft}`] : [];
}

export function medianOf(values) {
  if (values.length === 0) return Number.NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The median, so one slow answer among the samples is not a problem; no sample at all is.
export function findResponseTimeProblems(samplesMs, budgetMs) {
  if (samplesMs.length === 0) return ["start page: no answer was timed"];
  const median = medianOf(samplesMs);
  return median > budgetMs ? [`start page: median answer ${Math.round(median)} ms, budget ${budgetMs} ms`] : [];
}

const formatMs = (samplesMs) => samplesMs.map((sample) => Math.round(sample)).join(", ");
const counted = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

// The report of one run, as lines of Markdown. Anything not measured (a failed step) is left out.
export function monitorSummary({ origin, release, commitsBehind, daysLeft, samplesMs, problems }) {
  const lines = ["### Monitor", "", `- Address: ${origin}`];
  if (release !== undefined) {
    lines.push(`- Served commit: ${release.sourceSha}`, `- Served content: ${release.contentId}`);
  }
  if (commitsBehind !== undefined) lines.push(`- Commits on the branch after the served one: ${commitsBehind}`);
  if (daysLeft !== undefined) lines.push(`- Certificate: ${counted(daysLeft, "day")} left`);
  if (samplesMs !== undefined && samplesMs.length > 0) {
    lines.push(`- Start page: median ${Math.round(medianOf(samplesMs))} ms (samples: ${formatMs(samplesMs)})`);
  }
  lines.push(problems.length === 0 ? "- Result: no problems" : `- Result: ${counted(problems.length, "problem")}`);
  return [...lines, ...problems.map((problem) => `  - ${problem}`)];
}
