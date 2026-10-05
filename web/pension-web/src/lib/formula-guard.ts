/**
 * CSV / spreadsheet formula injection guard (OWASP "CSV Injection"). A cell that starts with
 * = + - @ (or a tab / carriage return) is opened by Excel as a formula; prefix it with a single
 * quote so it stays text. Applied to every cell this app writes into a CSV or xlsx file.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function guardFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}
