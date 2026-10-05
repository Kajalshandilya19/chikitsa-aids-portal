/**
 * Column Index to Letter Conversion Utilities
 * Handles conversion between column indices (0, 1, 2...) and letters (A, B, C... Z, AA, AB...)
 */

/**
 * Convert a column index to its letter representation
 * @param index - Zero-based column index (0 = A, 25 = Z, 26 = AA)
 * @returns Column letter(s)
 * @example columnIndexToLetter(0) => 'A'
 * @example columnIndexToLetter(25) => 'Z'
 * @example columnIndexToLetter(26) => 'AA'
 * @example columnIndexToLetter(701) => 'ZZ'
 * @example columnIndexToLetter(702) => 'AAA'
 */
export function columnIndexToLetter(index: number): string {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error(`Invalid column index: ${index}. Must be a non-negative integer.`);
  }

  let result = '';
  let remaining = index;

  while (remaining >= 0) {
    result = String.fromCharCode((remaining % 26) + 65) + result;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return result;
}

/**
 * Convert a column letter to its index
 * @param letter - Column letter(s) (A, B, C... Z, AA, AB...)
 * @returns Zero-based column index
 * @example letterToColumnIndex('A') => 0
 * @example letterToColumnIndex('Z') => 25
 * @example letterToColumnIndex('AA') => 26
 * @example letterToColumnIndex('ZZ') => 701
 * @example letterToColumnIndex('AAA') => 702
 */
export function letterToColumnIndex(letter: string): number {
  const upperLetter = letter.toUpperCase();
  
  if (!/^[A-Z]+$/.test(upperLetter)) {
    throw new Error(`Invalid column letter: ${letter}. Must contain only letters A-Z.`);
  }

  let result = 0;
  
  for (let i = 0; i < upperLetter.length; i++) {
    result = result * 26 + (upperLetter.charCodeAt(i) - 64);
  }

  return result - 1;
}

/**
 * Get the total number of columns for a given letter
 * Useful for determining grid size from column letter
 * @param letter - Column letter(s)
 * @returns Total number of columns (1-indexed)
 */
export function getColumnCount(letter: string): number {
  return letterToColumnIndex(letter) + 1;
}
