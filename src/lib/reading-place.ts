/*
  The reader's place, kept across a change of language (src/components/reading-place.tsx). Every
  language renders the same page from the same components, so its structure is the same in all of
  them; only the words differ, and with them the heights. So a place is kept against the
  structure, never as a scroll offset: the heading, paragraph or figure at the reading line, by its
  id where it has one and otherwise by its place among the page's marks, and how far down it the
  line fell. On the other side the same mark is put back at the line.
*/

/** The page's marks: what a reader's eye rests on, in the order the page reads. */
export const MARKS = 'h1, h2, h3, h4, p, li, dt, dd, figure, table, blockquote, pre';

/** A mark's box as the viewport has it. */
export interface Box {
  top: number;
  height: number;
}

/** A place kept for an address in another language. */
export interface Place {
  /** The path the place is kept for. */
  to: string;
  /** The mark's id, where it has one. */
  id?: string;
  /** Its place among the page's marks, and how many marks the page had. */
  index: number;
  count: number;
  /** How far down the mark the reading line fell: 0 at its top, 1 at its foot. */
  share: number;
}

/**
 * The mark at the reading line: the first, in reading order, that is not wholly above it, and how
 * far down it the line falls (0 where the mark begins below the line).
 */
export function placeAt(boxes: Box[], line: number): { index: number; share: number } | null {
  for (let index = 0; index < boxes.length; index += 1) {
    const { top, height } = boxes[index];
    if (top + height <= line) continue;
    const share = height > 0 ? Math.min(1, Math.max(0, (line - top) / height)) : 0;
    return { index, share };
  }
  return null;
}

/** The scroll at which the reading line falls `share` of the way down a mark now at `box`. */
export function scrollFor(box: Box, share: number, line: number, scrollY: number): number {
  return Math.max(0, Math.round(scrollY + box.top + share * box.height - line));
}

/** A kept place read back, or null if it is not one: storage is the visitor's to change. */
export function readPlace(raw: string | null): Place | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Place>;
    const finite = (number: unknown): number is number =>
      typeof number === 'number' && Number.isFinite(number);
    if (
      typeof value.to !== 'string' ||
      !value.to.startsWith('/') ||
      !finite(value.index) ||
      !finite(value.count) ||
      !finite(value.share) ||
      value.index < 0 ||
      value.index >= value.count ||
      (value.id !== undefined && typeof value.id !== 'string')
    )
      return null;
    return {
      to: value.to,
      id: value.id,
      index: value.index,
      count: value.count,
      share: Math.min(1, Math.max(0, value.share)),
    };
  } catch {
    return null;
  }
}
