// The recorder behind tests/golden/vitest.config.ts: one log of the drawing and one of the page
// for each test, written under GOLDEN_OUT and compared with the same test's under GOLDEN_BASE.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, expect } from 'vitest';

const out = process.env.GOLDEN_OUT;
const base = process.env.GOLDEN_BASE;
if (!out) throw new Error('golden: set GOLDEN_OUT to the folder the recording is written to');
mkdirSync(out, { recursive: true });

/** A value as one line: numbers exactly, elements by what they are. */
function show(value: unknown): string {
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined || typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return 'fn';
  if (value instanceof HTMLCanvasElement) {
    const layer = value.getAttribute('data-layer');
    return `<canvas${layer ? ` ${layer}` : ''} ${value.width}x${value.height}>`;
  }
  if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
  if (Array.isArray(value)) return `[${value.map(show).join(',')}]`;
  if (ArrayBuffer.isView(value))
    return `${value.constructor.name}(${(value as unknown as { length: number }).length})`;
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** Where a node stands in the page: enough to tell it from its neighbours. */
function where(node: Node | null): string {
  if (!node) return 'null';
  if (node.nodeType === Node.TEXT_NODE) return `${where(node.parentNode)}/#text`;
  if (!(node instanceof Element)) return node.nodeName;
  const marks = [node.tagName.toLowerCase()];
  if (node.id) marks.push(`#${node.id}`);
  const layer = node.getAttribute('data-layer');
  if (layer) marks.push(`[${layer}]`);
  // Class names are hashed the same way in every run of one tree.
  const classes = node.getAttribute('class');
  if (classes) marks.push(`.${classes.split(/\s+/).join('.')}`);
  return marks.join('');
}

let drawing: string[] = [];
let page: string[] = [];
let watcher: MutationObserver | null = null;
const recorded: Record<string, { drawing: number; page: number }> = {};
const differing: string[] = [];

function note(records: MutationRecord[]) {
  for (const record of records) {
    if (record.type === 'attributes') {
      const target = record.target as Element;
      const now = target.getAttribute(record.attributeName!);
      page.push(
        `attr ${where(target)} ${record.attributeName}=${show(now)} (was ${show(record.oldValue)})`,
      );
    } else if (record.type === 'characterData') {
      page.push(
        `text ${where(record.target)} ${show(record.target.textContent)} (was ${show(record.oldValue)})`,
      );
    } else {
      for (const added of record.addedNodes)
        page.push(
          `add ${where(record.target)} <- ${added instanceof Element ? added.outerHTML : show(added.textContent)}`,
        );
      for (const removed of record.removedNodes)
        page.push(
          `remove ${where(record.target)} -> ${removed instanceof Element ? where(removed) : show(removed.textContent)}`,
        );
    }
  }
}

/** The file a test's log is kept in: named by the test, whatever its place in the file. */
const fileOf = (test: string, kind: 'canvas' | 'page') =>
  `${createHash('sha1').update(test).digest('hex').slice(0, 12)}.${kind}.log`;

const golden = {
  call(name: string, args: unknown[]) {
    drawing.push(`${name}(${args.map(show).join(', ')})`);
  },
  set(name: string, value: unknown) {
    drawing.push(`${name} = ${show(value)}`);
  },
  /** Called before the test's own cleanup takes the page down. */
  finish(scrolled: unknown[]) {
    if (!watcher) return;
    note(watcher.takeRecords());
    watcher.disconnect();
    watcher = null;
    const test = expect.getState().currentTestName ?? 'unnamed';
    const active = document.activeElement;
    const logs = {
      canvas: drawing.join('\n'),
      page: [
        ...page,
        '--- end',
        `focus: ${where(active)} ${show(active?.textContent?.slice(0, 80))}`,
        `scrolled: ${show(scrolled)}`,
        `page: ${document.body.innerHTML}`,
      ].join('\n'),
    };
    recorded[test] = { drawing: drawing.length, page: page.length };
    for (const kind of ['canvas', 'page'] as const) {
      writeFileSync(path.join(out, fileOf(test, kind)), logs[kind]);
      if (!base) continue;
      const before = path.join(base, fileOf(test, kind));
      if (!existsSync(before)) differing.push(`no recording to compare (${kind}): ${test}`);
      else if (readFileSync(before, 'utf8') !== logs[kind])
        differing.push(`differs in ${kind} (${fileOf(test, kind)}): ${test}`);
    }
  },
};
(globalThis as unknown as { __golden: typeof golden }).__golden = golden;

beforeEach(() => {
  drawing = [];
  page = [];
  watcher = new MutationObserver(note);
  watcher.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
  });
});

afterAll(() => {
  writeFileSync(path.join(out, 'index.json'), JSON.stringify(recorded, null, 1));
  const tests = Object.keys(recorded).length;
  const lines = Object.values(recorded).reduce((sum, one) => sum + one.drawing + one.page, 0);
  const verdict = !base
    ? 'recorded'
    : differing.length
      ? `${differing.length} differ:\n  ${differing.join('\n  ')}`
      : 'identical to the recording it was compared with';
  const summary = `golden: ${tests} tests, ${lines} lines; ${verdict}`;
  writeFileSync(path.join(out, 'summary.txt'), `${summary}\n`);
  console.log(summary);
  if (differing.length) throw new Error(summary);
});
