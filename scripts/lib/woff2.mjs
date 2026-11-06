import { brotliDecompressSync } from 'node:zlib';

/**
 * A reader for the two things the glyph check needs from a shipped WOFF2 face: the characters
 * its cmap really draws, and the OpenType features its layout tables really carry. A unicode
 * range only says what a face claims; these say what it holds. Nothing else is decoded.
 */

/** The WOFF2 known-table tags, by their index in a directory entry's flag byte (spec §5.1). */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf',
  'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT',
  'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT',
  'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar',
  'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd',
  'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]; // prettier-ignore

function readBase128(bytes, offset) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = bytes[offset + index];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return { value, next: offset + index + 1 };
  }
  throw new Error('Unreadable UIntBase128');
}

/** The face's tables, untransformed ones as bytes (cmap, GSUB and GPOS never are transformed). */
export function woff2Tables(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error('Not a WOFF2 file');
  const numTables = view.getUint16(12);
  const compressedLength = view.getUint32(20);
  let offset = 48;
  const directory = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = bytes[offset];
    offset += 1;
    let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 0x3f) {
      tag = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      offset += 4;
    }
    const version = flags >> 6;
    const original = readBase128(bytes, offset);
    offset = original.next;
    let length = original.value;
    const transformed =
      tag === 'glyf' || tag === 'loca' ? version === 0 : tag === 'hmtx' && version === 1;
    if (transformed) {
      const transform = readBase128(bytes, offset);
      offset = transform.next;
      length = transform.value;
    }
    directory.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(bytes.subarray(offset, offset + compressedLength));
  const tables = new Map();
  let position = 0;
  for (const entry of directory) {
    if (!entry.transformed) tables.set(entry.tag, data.subarray(position, position + entry.length));
    position += entry.length;
  }
  return tables;
}

/** Every code point the face's Unicode cmap maps to a real glyph (formats 4 and 12). */
export function cmapCodePoints(cmap) {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const count = view.getUint16(2);
  const points = new Set();
  for (let index = 0; index < count; index += 1) {
    const platform = view.getUint16(4 + index * 8);
    const encoding = view.getUint16(6 + index * 8);
    const at = view.getUint32(8 + index * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const format = view.getUint16(at);
    if (format === 12) {
      const groups = view.getUint32(at + 12);
      for (let group = 0; group < groups; group += 1) {
        const start = view.getUint32(at + 16 + group * 12);
        const end = view.getUint32(at + 20 + group * 12);
        const glyph = view.getUint32(at + 24 + group * 12);
        for (let point = start; point <= end; point += 1)
          if (glyph + (point - start) !== 0) points.add(point);
      }
    } else if (format === 4) {
      const segments = view.getUint16(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const rangeOffsets = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const end = view.getUint16(ends + segment * 2);
        const start = view.getUint16(starts + segment * 2);
        const delta = view.getUint16(deltas + segment * 2);
        const rangeOffset = view.getUint16(rangeOffsets + segment * 2);
        for (let point = start; point <= end && point !== 0xffff; point += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (point + delta) & 0xffff;
          else {
            const address = rangeOffsets + segment * 2 + rangeOffset + (point - start) * 2;
            glyph = view.getUint16(address);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(point);
        }
      }
    }
  }
  return points;
}

/** The feature tags a GSUB or GPOS table lists. */
export function featureTags(table) {
  if (!table) return new Set();
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const list = view.getUint16(6);
  const count = view.getUint16(list);
  const tags = new Set();
  for (let index = 0; index < count; index += 1) {
    const at = list + 2 + index * 6;
    tags.add(String.fromCharCode(...table.subarray(at, at + 4)));
  }
  return tags;
}

/** What one shipped face holds: the characters it draws and the features it carries. */
export function inspectWoff2(buffer) {
  const tables = woff2Tables(buffer);
  const cmap = tables.get('cmap');
  if (!cmap) throw new Error('The face has no cmap');
  return {
    codePoints: cmapCodePoints(cmap),
    features: new Set([...featureTags(tables.get('GSUB')), ...featureTags(tables.get('GPOS'))]),
  };
}
