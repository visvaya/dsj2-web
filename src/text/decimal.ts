/** A number as Polish text writes it, with a decimal comma. */
export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}
