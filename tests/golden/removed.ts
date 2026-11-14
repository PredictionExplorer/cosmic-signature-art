// Is each test's new canvas log the old one with lines taken out and nothing else moved, and
// which lines? For a change that removes drawing calls on purpose (tests/golden/vitest.config.ts).
//
//   npm run test:golden:removed -- <before> <after>
//
// An old line that is not the next new line was taken out. The new log must be used up by the
// walk, or it is not the old one with lines removed. The page's logs must be identical.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [before, after] = process.argv.slice(2);
if (!before || !after) {
  console.error('usage: npm run test:golden:removed -- <before> <after>');
  process.exit(2);
}

/** A line with its numbers folded, so that lines of one kind are counted together. */
const kind = (line: string) => line.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, 'N');
const read = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');

const removed = new Map<string, number>();
const problems: string[] = [];
let changed = 0;
for (const file of readdirSync(before).sort()) {
  if (file.endsWith('.page.log')) {
    if (read(before, file) !== read(after, file)) problems.push(`the page differs: ${file}`);
    continue;
  }
  if (!file.endsWith('.canvas.log')) continue;
  const old = read(before, file).split('\n');
  const now = read(after, file).split('\n');
  let next = 0;
  let gone = 0;
  for (const line of old) {
    if (next < now.length && now[next] === line) next += 1;
    else {
      removed.set(kind(line), (removed.get(kind(line)) ?? 0) + 1);
      gone += 1;
    }
  }
  if (next !== now.length) problems.push(`not the old log with lines removed: ${file}`);
  if (gone) changed += 1;
}

const total = [...removed.values()].reduce((sum, count) => sum + count, 0);
console.log(`${total} lines removed, in ${changed} tests:`);
for (const [line, count] of [...removed].sort((a, b) => b[1] - a[1]))
  console.log(`${String(count).padStart(9)}  ${line}`);
if (problems.length) {
  console.error(`\n${problems.length} problems:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nEvery new log is the old one with only those lines removed; the page is identical.');
