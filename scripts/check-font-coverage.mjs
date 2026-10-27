import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log, error } from 'node:console';
import { CJK_FACES } from './build-font-subsets.mjs';

/**
 * The glyph check: every character the venue sets, in every locale, must fall inside a
 * unicode-range that one of the shipped faces declares, so no string ever drops to a
 * system face by accident. Literata and IBM Plex Mono cover Latin, Cyrillic, Greek and
 * Vietnamese; each CJK locale adds its own face. The arrows are the one deliberate
 * exception: they are typographic devices and may come from the system.
 */
/** The repository root; under a test runner whose module URLs are not file URLs, the working directory. */
function repositoryRoot() {
  try {
    return fileURLToPath(new URL('..', import.meta.url));
  } catch {
    return process.cwd();
  }
}
const root = repositoryRoot();
const locales = ['en', 'zh', 'zh-TW', 'zh-HK', 'uk', 'ko', 'ja', 'vi'];
export const SYSTEM_GLYPHS = new Set(['←', '→', '↑', '↓', '↗', '↙', '↻']);

export function parseRanges(css) {
  const ranges = [];
  for (const [, list] of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const token of list.split(',')) {
      const match = /^\s*U\+([0-9a-f?]+)(?:-([0-9a-f]+))?\s*$/i.exec(token);
      if (!match) throw new Error(`Unreadable unicode-range token: ${token}`);
      if (match[1].includes('?')) {
        const start = parseInt(match[1].replaceAll('?', '0'), 16);
        const end = parseInt(match[1].replaceAll('?', 'f'), 16);
        ranges.push([start, end]);
      } else {
        const start = parseInt(match[1], 16);
        ranges.push([start, match[2] ? parseInt(match[2], 16) : start]);
      }
    }
  }
  return ranges;
}

export function covered(codePoint, ranges) {
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/**
 * Every quoted or template literal in a source file, plus JSX text between tags, so the words
 * a component sets itself (a label, a separator, a key cap) are checked beside the catalogs.
 */
export function catalogText(source) {
  const literals = [
    ...source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g),
  ]
    .map((match) => (match[1] ?? match[2] ?? match[3]).replace(/\\(.)/g, '$1'))
    .join('');
  const jsxText = [...source.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]).join('');
  return `${literals}${jsxText}`;
}

/** The venue's own source: components and routes, read with every catalog. */
export async function sourceFiles(directory) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !/\/i18n\/[a-zA-Z-]+\.ts$/.test(path)
    )
      files.push(path);
  }
  return files;
}

export function uncoveredCharacters(text, ranges) {
  const missing = new Set();
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x20 || SYSTEM_GLYPHS.has(character)) continue;
    if (!covered(codePoint, ranges)) missing.add(character);
  }
  return [...missing];
}

async function packageCss(name, file) {
  const packageRoot = dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
  return readFile(resolve(packageRoot, file), 'utf8');
}

async function main() {
  const latin = [
    await packageCss('@fontsource-variable/literata', 'opsz.css'),
    await packageCss('@fontsource-variable/literata', 'opsz-italic.css'),
    await packageCss('@fontsource/ibm-plex-mono', '400.css'),
  ].flatMap(parseRanges);
  let failures = 0;
  const components = await Promise.all(
    (await sourceFiles(resolve(root, 'src'))).map((file) => readFile(file, 'utf8')),
  );
  // Component text is extracted once here; the catalog is extracted per locale below.
  const shared = components.map(catalogText).join('');
  for (const locale of locales) {
    const catalog = await readFile(resolve(root, `src/lib/i18n/${locale}.ts`), 'utf8');
    const source = `${catalogText(catalog)}${shared}`;
    const face = CJK_FACES[locale];
    const ranges = face
      ? [...latin, ...parseRanges(await packageCss(face.package, '400.css'))]
      : latin;
    const missing = uncoveredCharacters(source, ranges);
    if (missing.length) {
      failures += 1;
      error(
        `${locale}: ${missing.length} character(s) outside the shipped faces: ${missing.join(' ')}`,
      );
    } else log(`${locale}: every glyph is covered${face ? ` (${face.family})` : ''}.`);
  }
  if (failures) {
    process.exitCode = 1;
    error('Add the glyph to a shipped face or to SYSTEM_GLYPHS with a reason.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
