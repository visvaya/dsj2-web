import { formatDecimal } from "../text/decimal";
import { UI_TEXT } from "../text/ui-text";

export { formatDecimal };

const BYTES_PER_KB = 1000;
const BYTES_PER_MB = 1_000_000;

/** A size as the player reads it: in kilobytes below a megabyte, in megabytes from one up; never split. */
export function formatSize(bytes: number): string {
  return bytes < BYTES_PER_MB
    ? UI_TEXT.size.kb(formatDecimal(bytes / BYTES_PER_KB, 1))
    : UI_TEXT.size.mb(formatDecimal(bytes / BYTES_PER_MB, 1));
}
