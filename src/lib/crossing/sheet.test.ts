import { describe, expect, it } from 'vitest';
import {
  EDGE_PX,
  PACE_SHARE,
  TRAIL_SHARE,
  arrived,
  edgeOf,
  frontAt,
  groundPace,
  laySheet,
  laySheets,
  ordersOf,
  passed,
  sheetBytes,
  sheetTime,
  smoothstep,
  trailOf,
  unstep,
  type Box,
  type Order,
} from './sheet';

/**
 * A map as the pipeline makes one: each texel takes the earliest of (a seed's time plus the way
 * from it at one pace), in steps of the map, rounded to a byte.
 */
function mapOf(
  width: number,
  height: number,
  pace: number,
  seeds: readonly (readonly [number, number, number])[],
) {
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let earliest = Infinity;
      for (const [sx, sy, at] of seeds)
        earliest = Math.min(earliest, at + pace * Math.hypot(x - sx, y - sy));
      bytes[y * width + x] = Math.min(255, Math.round(earliest));
    }
  return bytes;
}

const orderOf = (bytes: Uint8Array, width: number, height: number): Order =>
  unstep(bytes, width, height);

/** A work 240 × 160 hung at (20, 30) of a stage 280 × 220: walls beside it, a head above, a strip below. */
const ART: Box = { x: 20, y: 30, width: 240, height: 160 };
const REGION: Box = { x: 0, y: 0, width: 280, height: 220 };

describe('unstep', () => {
  it('keeps every value within half a step of the byte it was read as', () => {
    const bytes = mapOf(120, 80, 0.7, [[30, 40, 0]]);
    const { data } = unstep(bytes, 120, 80);
    for (let p = 0; p < data.length; p++)
      expect(Math.abs(data[p] - bytes[p])).toBeLessThanOrEqual(0.5);
  });

  it('gives a slow, stepped ramp its slope back', () => {
    // A ramp of 0.13 steps a texel stands on each byte for nearly eight texels.
    const width = 160;
    const bytes = new Uint8Array(width * 8);
    for (let p = 0; p < bytes.length; p++) bytes[p] = Math.round(0.13 * (p % width));
    const { data } = unstep(bytes, width, 8, { radius: 4, passes: 6 });
    // Across the middle of the ramp no two neighbours are a whole step apart any more.
    let steepest = 0;
    for (let x = 20; x < width - 20; x++)
      steepest = Math.max(steepest, data[4 * width + x + 1] - data[4 * width + x]);
    expect(steepest).toBeLessThan(0.5);
  });
});

describe('groundPace', () => {
  it('reads the pace of a map of one broad front', () => {
    const pace = groundPace(orderOf(mapOf(200, 130, 0.72, [[60, 50, 0]]), 200, 130));
    expect(pace).toBeGreaterThan(0.72 * 0.96);
    expect(pace).toBeLessThan(0.72 * 1.04);
  });

  it('reads the pace of a map of many small fronts from the places between them', () => {
    const seeds: [number, number, number][] = [];
    for (let y = 8; y < 130; y += 16)
      for (let x = 8; x < 200; x += 16) seeds.push([x, y, (x * 7 + y * 3) % 5]);
    const pace = groundPace(orderOf(mapOf(200, 130, 4, seeds), 200, 130));
    expect(pace).toBeGreaterThan(4 * 0.85);
    expect(pace).toBeLessThan(4 * 1.1);
  });

  it('reads no pace from a map too small to hold a slope', () => {
    expect(groundPace({ data: new Float32Array(4), width: 2, height: 2 })).toBe(0);
  });
});

describe('laySheet', () => {
  const pace = 0.7;
  const seed: [number, number, number] = [80, 60, 0];
  const order = orderOf(mapOf(240, 160, pace, [seed]), 240, 160);
  const sheet = laySheet(order, REGION, ART);
  /** A map texel's place on the stage. */
  const place = (x: number, y: number) => ({
    x: ART.x + ((x + 0.5) / 240) * ART.width,
    y: ART.y + ((y + 0.5) / 160) * ART.height,
  });
  const source = place(seed[0], seed[1]);

  it('lays a cell for every pixel of a small stage, the work among them', () => {
    expect(sheet.cols).toBe(280);
    expect(sheet.rows).toBe(220);
    expect(sheet.cell).toBe(1);
    expect(sheet.region).toEqual(REGION);
    expect(sheet.art).toEqual(ART);
  });

  it('keeps a little under the map’s own pace', () => {
    // One texel is one pixel here, and a step is 1/255 of the order.
    expect(sheet.pace).toBeGreaterThan((PACE_SHARE * pace * 0.96) / 255);
    expect(sheet.pace).toBeLessThan((PACE_SHARE * pace * 1.04) / 255);
  });

  /** How far a time lies from what a straight way of `way` pixels gives, in pixels of travel. */
  const off = (time: number, way: number) =>
    Math.abs(time - (sheet.first + way * sheet.pace)) / sheet.pace;

  it('draws the front round: a place’s time is its straight way from where the front began', () => {
    // Along an axis, a diagonal and the directions between, where a chamfered way runs up to
    // three pixels long in a hundred. The front begins on the few texels the map rounds to its
    // first byte, so a pixel of travel is allowed.
    const times = [0, 22.5, 45, 67.5, 90, 135, 200, 290].map((angle) => {
      const radians = (angle * Math.PI) / 180;
      return sheetTime(sheet, source.x + 55 * Math.cos(radians), source.y + 55 * Math.sin(radians));
    });
    for (const time of times) expect(off(time, 55)).toBeLessThan(1);
    // And every direction keeps the same time, to a third of a pixel of travel.
    expect((Math.max(...times) - Math.min(...times)) / sheet.pace).toBeLessThan(0.35);
  });

  it('carries the same front on past the work’s edge, at the same pace', () => {
    // The head above the work, the strip below it and the wall beside it.
    for (const [x, y] of [
      [140, 8],
      [140, 212],
      [6, 110],
      [276, 4],
    ])
      expect(off(sheetTime(sheet, x, y), Math.hypot(x - source.x, y - source.y))).toBeLessThan(1);
  });

  it('keeps the map’s own order on the work', () => {
    // Two fronts, the second begun a little later: the place between them turns as the map says.
    const bytes = mapOf(240, 160, pace, [
      [50, 80, 0],
      [190, 80, 30],
    ]);
    const two = laySheet(orderOf(bytes, 240, 160), REGION, ART);
    let worst = 0;
    for (let y = 4; y < 160; y += 6)
      for (let x = 4; x < 240; x += 6) {
        const { x: px, y: py } = place(x, y);
        const map = bytes[y * 240 + x] / 255;
        // The sheet's fronts run at a share of the map's pace, so its times are that share of the map's.
        worst = Math.max(worst, Math.abs((sheetTime(two, px, py) - two.first) / PACE_SHARE - map));
      }
    // Within three steps of the map anywhere: the later front still begins at its own time.
    expect(worst).toBeLessThan(15 / 255);
  });

  it('finds the earliest of every source, as a search of them all would', () => {
    // A small stage with a handful of sources at different times, some later than their neighbours.
    const seeds: [number, number, number][] = [
      [10, 12, 0],
      [44, 9, 6],
      [30, 34, 2],
      [8, 40, 9],
      [52, 44, 4],
    ];
    const small = orderOf(mapOf(60, 50, 1.2, seeds), 60, 50);
    const region = { x: 0, y: 0, width: 80, height: 70 };
    const art = { x: 10, y: 10, width: 60, height: 50 };
    const laid = laySheet(small, region, art);
    // Every cell of the work is a source with its own time; search them all for each cell.
    const own: [number, number, number][] = [];
    for (let row = 0; row < laid.rows; row++)
      for (let col = 0; col < laid.cols; col++) {
        const x = (col + 0.5) * laid.cell;
        const y = (row + 0.5) * laid.cell;
        if (x < art.x || x > art.x + art.width || y < art.y || y > art.y + art.height) continue;
        const u = ((x - art.x) / art.width) * 60 - 0.5;
        const v = ((y - art.y) / art.height) * 50 - 0.5;
        const tx = Math.min(59, Math.max(0, Math.round(u)));
        const ty = Math.min(49, Math.max(0, Math.round(v)));
        own.push([col, row, small.data[ty * 60 + tx] / 255]);
      }
    let worst = 0;
    for (let row = 0; row < laid.rows; row += 3)
      for (let col = 0; col < laid.cols; col += 3) {
        let earliest = Infinity;
        for (const [sc, sr, at] of own)
          earliest = Math.min(
            earliest,
            at + laid.pace * laid.cell * Math.hypot(col - sc, row - sr),
          );
        worst = Math.max(worst, Math.abs(laid.time[row * laid.cols + col] - earliest));
      }
    // Within a cell's own travel of the exhaustive answer, everywhere.
    expect(worst).toBeLessThan(laid.pace * laid.cell);
  });

  it('knows its earliest and latest times, and the work’s own latest', () => {
    expect(sheet.first).toBeCloseTo(0, 2);
    expect(sheet.last).toBeGreaterThan(sheet.lastOnWork);
    let last = -Infinity;
    for (const value of sheet.time) last = Math.max(last, value);
    expect(sheet.last).toBe(last);
    // The work's far corner from the source is its latest place.
    const corner = Math.hypot(ART.x + ART.width - source.x, ART.y + ART.height - source.y);
    expect(sheet.lastOnWork).toBeCloseTo(sheet.first + corner * sheet.pace, 2);
  });

  it('lays larger cells on a stage too large for one a pixel', () => {
    const wide = laySheet(
      order,
      { x: 0, y: 0, width: 2800, height: 2200 },
      { x: 200, y: 300, width: 2400, height: 1600 },
    );
    // One texel of the map is ten pixels there, and a cell is no smaller.
    expect(wide.cell).toBeCloseTo(10, 5);
    expect(wide.cols * wide.rows).toBeLessThanOrEqual(320_000);
  });

  it('turns a region that holds none of the work at once', () => {
    const apart = laySheet(
      order,
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 500, y: 500, width: 240, height: 160 },
    );
    expect(apart.first).toBe(0);
    expect(apart.last).toBe(0);
    expect(sheetTime(apart, 20, 20)).toBe(0);
  });
});

describe('sheetTime', () => {
  const order = orderOf(mapOf(240, 160, 0.7, [[80, 60, 0]]), 240, 160);
  const sheet = laySheet(order, REGION, ART);

  it('reads the sheet between its cells', () => {
    // Half-way between two cell centres, half-way between their times.
    const a = sheet.time[100 * sheet.cols + 140];
    const b = sheet.time[100 * sheet.cols + 141];
    expect(sheetTime(sheet, 141, 100.5)).toBeCloseTo((a + b) / 2, 6);
  });

  it('goes on past the region from the nearest point of it, at the ground’s pace', () => {
    const edge = sheetTime(sheet, 280, 150);
    expect(sheetTime(sheet, 330, 150)).toBeCloseTo(edge + 50 * sheet.pace, 6);
    const corner = sheetTime(sheet, 280, 220);
    expect(sheetTime(sheet, 310, 260)).toBeCloseTo(corner + 50 * sheet.pace, 6);
    // Above the region, as a page scrolled past the head would lie.
    expect(sheetTime(sheet, 100, -40)).toBeCloseTo(sheetTime(sheet, 100, 0) + 40 * sheet.pace, 6);
  });
});

describe('the front', () => {
  const order = orderOf(mapOf(240, 160, 0.7, [[80, 60, 0]]), 240, 160);
  const sheet = laySheet(order, REGION, ART);

  it('has a soft edge ten pixels across, and a trail a tenth of the work’s height long', () => {
    expect(edgeOf(sheet)).toBe(EDGE_PX * sheet.pace);
    expect(trailOf(sheet)).toBe(TRAIL_SHARE * ART.height * sheet.pace);
  });

  it('begins just before the first place and ends with everything turned and every mark arrived', () => {
    const edge = edgeOf(sheet);
    expect(frontAt(sheet, 0)).toBe(sheet.first - edge);
    const end = frontAt(sheet, 1);
    expect(passed(sheet.last, end, edge)).toBe(1);
    expect(arrived(sheet.lastOnWork, end, trailOf(sheet))).toBeCloseTo(1, 6);
    // Nothing has turned as it begins.
    expect(passed(sheet.first, frontAt(sheet, 0), edge)).toBe(0);
  });

  it('travels evenly, and holds at either end', () => {
    const a = frontAt(sheet, 0.25) - frontAt(sheet, 0);
    const b = frontAt(sheet, 0.75) - frontAt(sheet, 0.5);
    expect(a).toBeCloseTo(b, 9);
    expect(frontAt(sheet, -1)).toBe(frontAt(sheet, 0));
    expect(frontAt(sheet, 2)).toBe(frontAt(sheet, 1));
  });

  it('goes on to the page beyond the sheet where the screen shows it', () => {
    const edge = edgeOf(sheet);
    const beyond = sheet.last + 300 * sheet.pace;
    expect(frontAt(sheet, 1, beyond)).toBe(beyond + edge);
    // A page that turns sooner than the sheet's own far corner asks for nothing more.
    expect(frontAt(sheet, 1, sheet.first)).toBe(frontAt(sheet, 1));
  });

  it('passes a place across the edge, half-way as it stands on it', () => {
    expect(passed(0.5, 0.4, 0.02)).toBe(0);
    expect(passed(0.5, 0.5, 0.02)).toBeCloseTo(0.5, 9);
    expect(passed(0.5, 0.6, 0.02)).toBe(1);
  });

  it('brings a mark in behind the front, over the trail', () => {
    expect(arrived(0.5, 0.5, 0.1)).toBe(0);
    expect(arrived(0.5, 0.55, 0.1)).toBeCloseTo(0.5, 9);
    expect(arrived(0.5, 0.7, 0.1)).toBe(1);
    // Ahead of the front nothing has arrived.
    expect(arrived(0.5, 0.3, 0.1)).toBe(0);
  });

  it('eases as GLSL’s smoothstep does', () => {
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 9);
    expect(smoothstep(2, 4, 5)).toBe(1);
  });
});

describe('sheetBytes', () => {
  it('carries each time in sixteen bits across two channels', () => {
    const order = orderOf(mapOf(240, 160, 0.7, [[80, 60, 0]]), 240, 160);
    const sheet = laySheet(order, REGION, ART);
    const bytes = sheetBytes(sheet);
    expect(bytes.length).toBe(sheet.time.length * 4);
    const span = sheet.last - sheet.first;
    for (const p of [0, 1234, 30_000, sheet.time.length - 1]) {
      const read = sheet.first + (span * (bytes[p * 4] * 256 + bytes[p * 4 + 1])) / 65535;
      expect(Math.abs(read - sheet.time[p])).toBeLessThanOrEqual(span / 65535);
      expect(bytes[p * 4 + 3]).toBe(255);
    }
  });
});

describe('a work’s two sheets', () => {
  it('lays the night in Light’s order and the paper in Ink’s', () => {
    // Light first drew at the left of the work, Ink first came to rest at its right.
    const maps = {
      width: 240,
      height: 160,
      light: mapOf(240, 160, 0.7, [[30, 80, 0]]),
      ink: mapOf(240, 160, 0.7, [[210, 80, 0]]),
    };
    const { night, paper } = laySheets(ordersOf(maps), REGION, ART);
    const left = { x: ART.x + 30, y: ART.y + 80 };
    const right = { x: ART.x + 210, y: ART.y + 80 };
    expect(sheetTime(night, left.x, left.y)).toBeLessThan(sheetTime(night, right.x, right.y));
    expect(sheetTime(paper, right.x, right.y)).toBeLessThan(sheetTime(paper, left.x, left.y));
  });
});
