import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BODY_RADIUS,
  HOLLOW,
  bearsOut,
  hollowAt,
  inOwnHollow,
  paperLevel,
} from './ink-hollows.mjs';

const PAPER = 235;
const INK = 40;
/** A sheet 400 × 200 of bare paper: a body's radius is 5 px on it. */
function sheet() {
  return { grey: new Uint8Array(400 * 200).fill(PAPER), width: 400, height: 200 };
}
/** Ink laid where `inside(x, y)` holds. */
function ink({ grey, width, height }, inside) {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (inside(x, y)) grey[y * width + x] = INK;
}
const ring = (cx, cy, inner, outer) => (x, y) => {
  const distance = Math.hypot(x - cx, y - cy);
  return distance >= inner && distance <= outer;
};

test('bare paper is the sheet’s bright majority', () => {
  const page = sheet();
  ink(page, (x) => x < 100);
  assert.equal(paperLevel(page.grey), PAPER);
  assert.equal(BODY_RADIUS * page.height, 5);
});

test('a body in the hollow it left is found there, centred and of a body’s size', () => {
  const page = sheet();
  // The hollow: paper inside 5.5 px, ringed by ink to 9 px.
  ink(page, ring(100, 100, 5.5, 9));
  const body = hollowAt(page.grey, page.width, page.height, 100.4, 99.7, PAPER);
  assert.equal(body.paper, true);
  assert.ok(body.hollow.offset < 0.12, `offset ${body.hollow.offset}`);
  assert.ok(Math.abs(body.hollow.radius - 1.1) < 0.1, `radius ${body.hollow.radius}`);
  assert.equal(inOwnHollow(body), true);
});

test('paper that opens out, or ink under the place, is no hollow', () => {
  const page = sheet();
  ink(page, (x, y) => Math.hypot(x - 200, y - 50) <= 4);
  ink(page, ring(60, 100, 5.5, 9));
  // Bare paper all around: open.
  const open = hollowAt(page.grey, page.width, page.height, 300, 100, PAPER);
  assert.deepEqual(open, { paper: true, hollow: null });
  // A body never stands on ink.
  const onInk = hollowAt(page.grey, page.width, page.height, 200, 50, PAPER);
  assert.deepEqual(onInk, { paper: false, hollow: null });
  // A hollow broken by a gap in its ring opens to the paper beyond.
  const broken = sheet();
  ink(broken, (x, y) => ring(100, 100, 5.5, 9)(x, y) && y < 106);
  assert.equal(hollowAt(broken.grey, 400, 200, 100, 100, PAPER).hollow, null);
  // The sheet's edge opens a hollow too.
  const edge = sheet();
  ink(edge, ring(3, 100, 5.5, 9));
  assert.equal(hollowAt(edge.grey, 400, 200, 3, 100, PAPER).hollow, null);
});

test('a hollow too large or off its centre is not the body’s own', () => {
  const page = sheet();
  // Two bodies that ended close share one hollow, twice a body's size.
  ink(page, ring(100, 100, 11, 14));
  const shared = hollowAt(page.grey, page.width, page.height, 104, 100, PAPER);
  assert.ok(shared.hollow.radius > HOLLOW.accept.radius[1]);
  assert.equal(inOwnHollow(shared), false);
  const small = sheet();
  ink(small, ring(100, 100, 5.5, 9));
  const offCentre = hollowAt(small.grey, 400, 200, 103, 100, PAPER);
  assert.ok(offCentre.hollow.offset > HOLLOW.accept.offset);
  assert.equal(inOwnHollow(offCentre), false);
});

test('a still bears out its bodies when all stand on paper and one in its own hollow', () => {
  const own = { paper: true, hollow: { offset: 0.05, radius: 1.02 } };
  const open = { paper: true, hollow: null };
  const onInk = { paper: false, hollow: null };
  assert.equal(bearsOut([own, open, open]), true);
  assert.equal(bearsOut([open, open, open]), false);
  assert.equal(bearsOut([own, own, onInk]), false);
  assert.equal(bearsOut([]), false);
});
