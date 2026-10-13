/** The key in the address of the page that switches the diagnostics on; its value does not matter. */
const DIAGNOSTICS_KEY = "diag";

/** Whether the query string of the page (`location.search`) asks for the diagnostics of the jump loop. */
export function diagnosticsRequested(search: string): boolean {
  return new URLSearchParams(search).has(DIAGNOSTICS_KEY);
}
