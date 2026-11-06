import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { log } from 'node:console';

/**
 * CJK display faces, one per locale, published as static stylesheets the layout links only
 * for that locale. Each weight is the vendor's unicode-range slicing (about a hundred slices
 * of 15–60 KB), so a page fetches only the slices its glyphs need and the English venue loads
 * none of them. The Chinese faces add their Light (300) for the display lines that stand
 * beside Literata's hairline; Shippori Mincho B1 and Gowun Batang begin at 400, and the
 * Latin display rises to meet them instead (globals.css, --weight-hairline). The files are
 * copied from node_modules at build time into public/fonts/cjk, which is generated and never
 * committed. Nothing is re-encoded.
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
const output = resolve(root, 'public/fonts/cjk');
const latinOutput = resolve(root, 'public/fonts/literata');

/**
 * Literata, cut by script: the faces src/app/typefaces.css declares, published under
 * public/fonts/literata with stable names so each locale can preload the cuts it reads in
 * (src/lib/fonts.ts) and the CJK pages can declare the same files again at 92 %. The cuts are
 * committed under fonts/literata with the font's licence, made from the complete OFL font by
 * scripts/subset-literata.py; the published copy is generated, like the CJK slices.
 */
const literataCuts = resolve(root, 'fonts/literata');
export const LITERATA_SUBSETS = [
  'latin',
  'latin-ext',
  'cyrillic',
  'cyrillic-ext',
  'greek',
  'greek-ext',
  'vietnamese',
];
export const LITERATA_STYLES = ['roman', 'italic'];

/** The published name of one cut, as typefaces.css and the preloads spell it. */
export function literataFile(subset, style) {
  return `literata-${subset}-${style}.woff2`;
}

/** Where a cut comes from: the committed cuts of the complete font (fonts/literata). */
export function literataSource(subset, style) {
  return resolve(literataCuts, literataFile(subset, style));
}

/** Locale → the OFL face the vision names for it, and the weights the venue sets it in. */
export const CJK_FACES = {
  zh: {
    package: '@fontsource/noto-serif-sc',
    family: 'Noto Serif SC',
    file: 'sc',
    weights: [300, 400],
  },
  'zh-TW': {
    package: '@fontsource/noto-serif-tc',
    family: 'Noto Serif TC',
    file: 'tc',
    weights: [300, 400],
  },
  'zh-HK': {
    package: '@fontsource/noto-serif-hk',
    family: 'Noto Serif HK',
    file: 'hk',
    weights: [300, 400],
  },
  ja: {
    package: '@fontsource/shippori-mincho-b1',
    family: 'Shippori Mincho B1',
    file: 'ja',
    weights: [400],
  },
  ko: { package: '@fontsource/gowun-batang', family: 'Gowun Batang', file: 'ko', weights: [400] },
};

/** Keep only the woff2 sources and point them at the published directory. */
export function rewriteStylesheet(css, publicPath = '/fonts/cjk/files/') {
  const faces = css.split(/(?=@font-face)/).filter((block) => block.includes('@font-face'));
  const rewritten = faces.map((block) => {
    const sources = [...block.matchAll(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)/g)];
    if (sources.length !== 1) throw new Error('Expected exactly one woff2 source per face');
    return block
      .replace(/src: [^;]+;/, `src: url(${publicPath}${sources[0][1]}) format('woff2');`)
      .replace(/\n\n$/, '\n');
  });
  return rewritten.join('\n');
}

export function referencedFiles(css) {
  return [...css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)].map((match) => match[1]);
}

async function main() {
  await rm(latinOutput, { recursive: true, force: true });
  await mkdir(latinOutput, { recursive: true });
  for (const subset of LITERATA_SUBSETS)
    for (const style of LITERATA_STYLES)
      await copyFile(
        literataSource(subset, style),
        resolve(latinOutput, literataFile(subset, style)),
      );
  // The licence travels with the files it covers.
  await copyFile(resolve(literataCuts, 'OFL.txt'), resolve(latinOutput, 'OFL.txt'));
  log(
    `Literata: ${LITERATA_SUBSETS.length * LITERATA_STYLES.length} cuts published under public/fonts/literata.`,
  );

  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'files'), { recursive: true });
  let total = 0;
  for (const [locale, face] of Object.entries(CJK_FACES)) {
    const packageRoot = dirname(fileURLToPath(import.meta.resolve(`${face.package}/package.json`)));
    const stylesheets = [];
    let slices = 0;
    for (const weight of face.weights) {
      const css = await readFile(resolve(packageRoot, `${weight}.css`), 'utf8');
      if (!css.includes(`font-family: '${face.family}'`))
        throw new Error(`${face.package} does not declare ${face.family}`);
      const files = referencedFiles(css);
      for (const file of files) {
        await copyFile(resolve(packageRoot, 'files', file), resolve(output, 'files', file));
      }
      stylesheets.push(rewriteStylesheet(css));
      slices += files.length;
    }
    const header = `/* ${face.family} ${face.weights.join(' and ')} for ${locale}: ${slices} unicode-range slices, generated by scripts/build-font-subsets.mjs. */\n`;
    await writeFile(resolve(output, `${face.file}.css`), header + stylesheets.join('\n'));
    total += slices;
    log(`${locale}: ${face.family} ${face.weights.join('/')}, ${slices} slices`);
  }
  log(`${total} font files published under public/fonts/cjk.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
