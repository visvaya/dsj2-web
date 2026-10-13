import type { TestInfo } from "@playwright/test";

/** Starts every line of raw measurements in the output of a run, so they can be picked out of a log. */
const LINE_PREFIX = "PERF ";

/**
 * Writes one measurement as a line of JSON to the output of the run and attaches the same to the report. Done
 * for a passing test too: the numbers are what a budget is later set from.
 */
export async function reportMeasurement(
  testInfo: TestInfo,
  measure: string,
  values: Readonly<Record<string, unknown>>,
): Promise<void> {
  const json = JSON.stringify({ measure, project: testInfo.project.name, ...values });
  process.stdout.write(`${LINE_PREFIX}${json}\n`);
  await testInfo.attach(`${measure}.json`, { body: json, contentType: "application/json" });
}

/** The middle value; of an even number of values, the mean of the two in the middle. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) throw new Error("No values to take a median of");
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}
