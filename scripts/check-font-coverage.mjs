import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log, error } from 'node:console';
import { CJK_FACES, literataSource } from './build-font-subsets.mjs';
import { inspectWoff2 } from './lib/woff2.mjs';

/**
 * The glyph check: every character the venue sets, in every locale, must be drawn by one of
 * the shipped faces, so no string ever drops to a system face by accident. Literata and IBM
 * Plex Mono are read glyph by glyph (a unicode-range only says what a cut claims; the cmap
 * says what it draws); each CJK locale adds its own face's slices by their ranges. The arrows
 * are the one deliberate exception: they are typographic devices and may come from the system.
 *
 * The feature check: every OpenType feature the stylesheets ask of the book face (small caps,
 * old-style figures, tabular figures, a feature named outright) must be carried by Literata's
 * shipped cuts, or be listed in PENDING_FEATURES with what the browser does instead.
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

/**
 * Features the stylesheets may ask of Literata that its shipped cuts do not carry, each with
 * what the browser does instead. Empty: the cuts are the complete font's (fonts/literata), and
 * the check fails if a stylesheet asks for a feature they lack. Should a feature ever have to
 * wait, list it here with its reason.
 */
export const PENDING_FEATURES = new Map();

/** CSS requests, each with the OpenType features it needs from the face. */
const REQUESTS = [
  [/font-variant-caps\s*:\s*all-small-caps/, ['smcp', 'c2sc']],
  [/font-variant-caps\s*:\s*small-caps/, ['smcp']],
  [/font-variant-caps\s*:\s*(?:all-)?petite-caps/, ['pcap']],
  [/font-variant-numeric\s*:[^;]*oldstyle-nums/, ['onum']],
  [/font-variant-numeric\s*:[^;]*tabular-nums/, ['tnum']],
  [/font-variant-numeric\s*:[^;]*diagonal-fractions/, ['frac']],
  [/font-variant-numeric\s*:[^;]*slashed-zero/, ['zero']],
  [/font-variant-position\s*:\s*super/, ['sups']],
];

/** The OpenType features a stylesheet asks for, by name. */
export function requestedFeatures(css) {
  const features = new Set();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [pattern, tags] of REQUESTS)
    if (pattern.test(text)) for (const tag of tags) features.add(tag);
  for (const [, settings] of text.matchAll(/font-feature-settings\s*:\s*([^;]+);/g))
    for (const [, tag] of settings.matchAll(/['"]([a-z0-9]{4})['"]/gi)) features.add(tag);
  return features;
}

/** Each face a stylesheet declares: its file and the code points its unicode-range claims. */
export function declaredFaces(css, family) {
  return css
    .split(/(?=@font-face)/)
    .filter((block) => new RegExp(`font-family:\\s*'${family}'\\s*;`).test(block))
    .map((block) => ({
      file: /url\('?(?:[^)']*\/)?([^/')]+\.woff2)'?\)/.exec(block)?.[1],
      ranges: parseRanges(block),
    }))
    .filter((face) => face.file);
}

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

/** The characters of `text` no face draws: neither the `drawn` code points nor the `ranges`. */
export function uncoveredCharacters(text, ranges, drawn = new Set()) {
  const missing = new Set();
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x20 || SYSTEM_GLYPHS.has(character)) continue;
    if (!drawn.has(codePoint) && !covered(codePoint, ranges)) missing.add(character);
  }
  return [...missing];
}

/**
 * What a family's shipped cuts really hold: the code points each draws inside the range it
 * claims, and the features any of them carries. `fileOf` finds a declared file on disk.
 */
export async function shippedFaces(faces, fileOf) {
  const drawn = new Set();
  const features = new Set();
  for (const face of faces) {
    const held = inspectWoff2(await readFile(fileOf(face.file)));
    for (const point of held.codePoints) if (covered(point, face.ranges)) drawn.add(point);
    for (const feature of held.features) features.add(feature);
  }
  return { drawn, features };
}

/** The features the stylesheets ask for that the face does not carry and no reason excuses. */
export function missingFeatures(requested, carried, pending = PENDING_FEATURES) {
  return [...requested].filter((tag) => !carried.has(tag) && !pending.has(tag)).sort();
}

async function packageCss(name, file) {
  const packageRoot = dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
  return readFile(resolve(packageRoot, file), 'utf8');
}

/** Every stylesheet the venue ships. */
async function stylesheets(directory) {
  const { readdir } = await import('node:fs/promises');
  const sheets = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) sheets.push(...(await stylesheets(path)));
    else if (entry.name.endsWith('.css')) sheets.push(await readFile(path, 'utf8'));
  }
  return sheets;
}

async function main() {
  const typefaces = await readFile(resolve(root, 'src/app/typefaces.css'), 'utf8');
  const literata = await shippedFaces(declaredFaces(typefaces, 'Literata'), (file) => {
    const [, subset, style] = /^literata-(.+)-(roman|italic)\.woff2$/.exec(file) ?? [];
    if (!subset) throw new Error(`typefaces.css declares an unknown cut: ${file}`);
    return literataSource(subset, style);
  });
  const plexRoot = dirname(
    fileURLToPath(import.meta.resolve('@fontsource/ibm-plex-mono/package.json')),
  );
  const plex = await shippedFaces(
    declaredFaces(await packageCss('@fontsource/ibm-plex-mono', '400.css'), 'IBM Plex Mono'),
    (file) => resolve(plexRoot, 'files', file),
  );
  const latin = new Set([...literata.drawn, ...plex.drawn]);
  let failures = 0;

  const requested = new Set(
    (await stylesheets(resolve(root, 'src'))).flatMap((css) => [...requestedFeatures(css)]),
  );
  const missing = missingFeatures(requested, literata.features);
  const carried = [...requested].filter((tag) => literata.features.has(tag)).sort();
  if (missing.length) {
    failures += 1;
    error(`The stylesheets ask Literata for ${missing.join(', ')}, which its cuts do not carry.`);
  } else log(`Literata carries ${carried.join(', ') || 'no feature'} the stylesheets ask for.`);
  for (const [tag, instead] of PENDING_FEATURES) {
    if (literata.features.has(tag)) {
      failures += 1;
      error(`Literata now carries ${tag}; remove it from PENDING_FEATURES.`);
    } else if (requested.has(tag)) log(`  pending ${tag}: ${instead}.`);
  }
  const components = await Promise.all(
    (await sourceFiles(resolve(root, 'src'))).map((file) => readFile(file, 'utf8')),
  );
  // Component text is extracted once here; the catalog is extracted per locale below.
  const shared = components.map(catalogText).join('');
  for (const locale of locales) {
    const catalog = await readFile(resolve(root, `src/lib/i18n/${locale}.ts`), 'utf8');
    const source = `${catalogText(catalog)}${shared}`;
    const face = CJK_FACES[locale];
    const ranges = face ? parseRanges(await packageCss(face.package, '400.css')) : [];
    const undrawn = uncoveredCharacters(source, ranges, latin);
    if (undrawn.length) {
      failures += 1;
      error(
        `${locale}: ${undrawn.length} character(s) no shipped face draws: ${undrawn.join(' ')}`,
      );
    } else log(`${locale}: every glyph is drawn${face ? ` (with ${face.family})` : ''}.`);
  }
  if (failures) {
    process.exitCode = 1;
    error('Add the glyph or feature to a shipped face, or list it with a reason.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
