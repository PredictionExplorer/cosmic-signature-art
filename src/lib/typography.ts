/**
 * The venue's small typographic rules for composed strings, kept in one place so every line
 * that joins words in code breaks the way a typesetter would break it.
 */

/** A no-break space: binds a number to its unit and a separator to the item before it. */
export const NBSP = '\u00a0';

/**
 * The middle dot between the items of a line. Its leading space is unbreakable, so a line may
 * end on the dot but never open with it.
 */
export const SEPARATOR = `${NBSP}· `;

/** A quantity and its unit, never parted at a line's end: "116 s", "632 nm", "2,234 px". */
export function withUnit(value: string, unit: string): string {
  return `${value}${NBSP}${unit}`;
}

/** Spaces inside a phrase that must stay on one line, such as a clock: "11:15 PM UTC". */
export function unbroken(phrase: string): string {
  return phrase.replace(/[ \u202f]/g, NBSP);
}

/**
 * A figure stays with the word it counts or names: "Cycle 0", "72 works", "June 2026". For
 * a short catalogue line made of such phrases, where a break inside one would strand a figure.
 */
export function bindFigures(text: string): string {
  return text.replace(/(\S) (?=\d)/g, `$1${NBSP}`).replace(/(\d) (?=\S)/g, `$1${NBSP}`);
}

const UNIT = String.raw`(?:px|fps|nm|ms|s|MB|GB|kB|KB|bit)`;

/**
 * Binds the numbers in a catalog sentence the way a typesetter would: a digit group ("3 456",
 * as Ukrainian groups thousands), a dimension ("3,456 × 2,234") and a quantity with its unit
 * ("60 fps", "700 nm") never break across lines. Words are left as the translator wrote them.
 */
export function bindNumbers(text: string): string {
  return text
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/(\d) × (?=\d)/g, `$1${NBSP}×${NBSP}`)
    .replace(new RegExp(String.raw`(\d) (?=${UNIT}\b)`, 'g'), `$1${NBSP}`);
}
