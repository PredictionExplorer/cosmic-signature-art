import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseRequestedIds,
  sourceByteLimit,
  validateSourceRange,
} from './build-collection-previews.mjs';

const request = {
  status: 206,
  contentRange: 'bytes 200-999/1000',
  requestRange: 'bytes=200-',
  expectedBytes: 1000,
  expectedEtag: '"original"',
  etag: '"original"',
};

test('accepts a correct open-ended range and exact single-byte probe', () => {
  assert.deepEqual(validateSourceRange(request), {
    start: 200,
    end: 999,
    total: 1000,
    length: 800,
  });
  assert.deepEqual(
    validateSourceRange({ ...request, contentRange: 'bytes 0-0/1000', requestRange: 'bytes=0-0' }),
    { start: 0, end: 0, total: 1000, length: 1 },
  );
});

test('rejects full-response fallback and redirects before consuming source bytes', () => {
  for (const status of [200, 301, 302, 307, 308, 404, 416, 500])
    assert.throws(() => validateSourceRange({ ...request, status }));
});

test('rejects an object that changed size or validator after probing', () => {
  for (const change of [
    { contentRange: 'bytes 200-999/1001' },
    { etag: '"changed"' },
    { etag: null },
  ])
    assert.throws(() => validateSourceRange({ ...request, ...change }));
});

test('rejects malformed, reversed, overshooting, unsafe, and unrelated ranges', () => {
  for (const contentRange of [
    null,
    '',
    'bytes */1000',
    'bytes 0-999/1000',
    'bytes 200-199/1000',
    'bytes 200-1000/1000',
    'bytes 200-99999999999999999999/1000',
  ])
    assert.throws(() => validateSourceRange({ ...request, contentRange }));
  for (const requestRange of [
    null,
    'bytes=-200',
    'bytes=200-199',
    'bytes=0-1,5-6',
    'bytes=9007199254740993-',
  ])
    assert.throws(() => validateSourceRange({ ...request, requestRange }));
});

test('supports sources without an ETag while keeping range identity mandatory', () => {
  assert.equal(validateSourceRange({ ...request, etag: null, expectedEtag: null }).length, 800);
  assert.throws(() =>
    validateSourceRange({
      ...request,
      etag: null,
      expectedEtag: null,
      contentRange: 'bytes 100-999/1000',
    }),
  );
});

test('caps source reads below a complete original and below the global ceiling', () => {
  assert.equal(sourceByteLimit(10_000_000), 9_000_000);
  assert.equal(sourceByteLimit(200_000_000), 96 * 1024 * 1024);
  for (const size of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => sourceByteLimit(size));
});

test('accepts only nonnegative safe integer token selectors', () => {
  assert.deepEqual(parseRequestedIds(['0', '31', '71']), [0, 31, 71]);
  for (const argument of [
    '-1',
    '3.1',
    'NaN',
    '../31',
    'https://example.com',
    '31;echo',
    '9007199254740992',
  ])
    assert.throws(() => parseRequestedIds([argument]));
});
