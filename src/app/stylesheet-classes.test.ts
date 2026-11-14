import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The seam between a CSS module and the component that wears it. `styles` is typed as a string
 * index, so a class the stylesheet does not define compiles and renders as no class at all, and
 * a class nothing reads stays in the stylesheet unnoticed. A class written bare inside a module
 * is also local to it: `.copy > .eyebrow` selects the module's own `eyebrow`, never the venue's
 * global one, which is how the sale's status line lost its small capitals. So both directions
 * are read here: every `styles.name` exists in its stylesheet, and every local class is read.
 */

// Vitest runs from the repository root; the jsdom environment gives import.meta.url an http scheme.
const root = process.cwd();
const src = join(root, 'src');

/**
 * Classes read by a computed name, which no search can follow: the one place, and the classes
 * it can name. Each must still exist in its stylesheet, and the place must still read that way.
 */
const COMPUTED: Record<string, { read: string; classes: string[] }> = {
  // The plate's presentation is its own class: <section className={styles[presentation]}>.
  'src/components/artwork-viewer.tsx': {
    read: 'styles[presentation]',
    classes: ['gallery', 'auction', 'home'],
  },
};

/**
 * Classes a stylesheet defines and nothing reads, left where they are for the reason given.
 * Each must still be defined and still be unread, so an entry cannot outlive its reason.
 */
const UNREAD: Record<string, string[]> = {
  // `.line .folio`, beside `.line :global(.folio)`: the strip wears the venue's global folio, so
  // the bare one selects nothing. Left while another change is open on these very lines, where
  // taking it out would not merge; it goes, and this entry with it, once that change has landed.
  'src/components/artwork-viewer.module.css': ['folio'],
};

function files(directory: string, keep: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...files(path, keep));
    else if (keep(entry)) found.push(path);
  }
  return found.sort();
}
const named = (path: string) => relative(root, path);

/** A stylesheet without what can hold a dot that is no class: comments and quoted strings. */
function bare(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

/** The text before each "{": a rule's selectors, or an at-rule's own words. */
function preludes(css: string): string[] {
  const found: string[] = [];
  let text = '';
  for (const character of bare(css)) {
    if (character === '{') found.push(text.trim());
    if ('{;}'.includes(character)) text = '';
    else text += character;
  }
  return found;
}

/** A selector without its :global(...) parts, whose classes are the venue's, not the module's. */
function withoutGlobal(selector: string): string {
  let local = '';
  for (let index = 0; index < selector.length; index += 1) {
    if (!selector.startsWith(':global(', index)) {
      local += selector[index];
      continue;
    }
    let depth = 0;
    for (index += ':global'.length; index < selector.length; index += 1) {
      if (selector[index] === '(') depth += 1;
      if (selector[index] === ')' && (depth -= 1) === 0) break;
    }
  }
  return local;
}

/** The classes a module defines as its own. An identifier never starts with a digit: ".5s" is none. */
function localClasses(css: string): Set<string> {
  const classes = new Set<string>();
  for (const prelude of preludes(css)) {
    // A media query or a keyframe's name selects nothing.
    if (prelude.startsWith('@')) continue;
    for (const [, name] of withoutGlobal(prelude).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
      classes.add(name);
  }
  return classes;
}

type Wearer = {
  file: string;
  sheet: string;
  /** Every `styles.name` the file reads. */
  reads: Set<string>;
  /** Every `styles[...]` it reads by a computed name. */
  computed: string[];
  /** Any other use of the binding: handed on whole, where its reads cannot be followed. */
  handedOn: number;
};

function wearers(file: string): Wearer[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)].map(
    ([statement, binding, specifier]) => {
      const sheet = specifier.startsWith('@/')
        ? join(src, specifier.slice(2))
        : resolve(dirname(file), specifier);
      const body = source.replace(statement, '');
      // The binding itself, not a property of that name on something else.
      const mentions = [...body.matchAll(new RegExp(`(?<![.\\w$])${binding}\\b(.?)`, 'g'))];
      return {
        file,
        sheet,
        reads: new Set(
          [...body.matchAll(new RegExp(`(?<![.\\w$])${binding}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
            ([, name]) => name,
          ),
        ),
        computed: [...body.matchAll(new RegExp(`(?<![.\\w$])${binding}\\[[^\\]]*\\]`, 'g'))].map(
          ([read]) => read,
        ),
        handedOn: mentions.filter(([, next]) => next !== '.' && next !== '[').length,
      };
    },
  );
}

describe('stylesheet classes', () => {
  const sheets = files(src, (name) => name.endsWith('.module.css'));
  const worn = files(src, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)).flatMap(
    wearers,
  );
  const classesOf = new Map(
    sheets.map((sheet) => [sheet, localClasses(readFileSync(sheet, 'utf8'))]),
  );

  it('finds the modules and the components that wear them', () => {
    expect(sheets.length).toBeGreaterThan(40);
    expect(worn.length).toBeGreaterThanOrEqual(sheets.length);
    expect(
      worn.filter(({ sheet }) => !classesOf.has(sheet)).map(({ file }) => named(file)),
    ).toEqual([]);
  });

  it('reads the stylesheets in the forms it understands', () => {
    // :global(...) is read above. A new form needs a reader here before it is used.
    const unread = sheets.filter((sheet) =>
      /:global(?!\()|:local\b|\bcomposes\s*:|&/.test(bare(readFileSync(sheet, 'utf8'))),
    );
    expect(unread.map(named)).toEqual([]);
    // And a stylesheet handed on whole is read where this cannot follow it.
    expect(worn.filter(({ handedOn }) => handedOn).map(({ file }) => named(file))).toEqual([]);
  });

  it('reads no class its stylesheet does not define', () => {
    const missing = worn.flatMap(({ file, sheet, reads }) =>
      [...reads]
        .filter((name) => !classesOf.get(sheet)?.has(name))
        .map(
          (name) => `${named(file)} reads styles.${name}, which ${named(sheet)} does not define`,
        ),
    );
    expect(missing).toEqual([]);
  });

  it('defines no class that nothing reads', () => {
    const read = new Map<string, Set<string>>();
    for (const { file, sheet, reads } of worn) {
      const known = read.get(sheet) ?? new Set<string>();
      for (const name of [...reads, ...(COMPUTED[named(file)]?.classes ?? [])]) known.add(name);
      read.set(sheet, known);
    }
    const unread = (sheet: string) =>
      [...(classesOf.get(sheet) ?? [])].filter((name) => !read.get(sheet)?.has(name));
    const dead = sheets.flatMap((sheet) =>
      unread(sheet)
        .filter((name) => !UNREAD[named(sheet)]?.includes(name))
        .map((name) => `${named(sheet)} defines .${name}, which nothing reads`),
    );
    expect(dead).toEqual([]);
    // What is excused must still need excusing: defined, and read by nothing.
    const excused = Object.fromEntries(
      sheets.filter((sheet) => UNREAD[named(sheet)]).map((sheet) => [named(sheet), unread(sheet)]),
    );
    expect(excused).toEqual(UNREAD);
  });

  it('follows every class read by a computed name, in the one place that reads so', () => {
    const computed = Object.fromEntries(
      worn
        .filter(({ computed }) => computed.length)
        .map(({ file, computed }) => [named(file), computed]),
    );
    expect(computed).toEqual(
      Object.fromEntries(Object.entries(COMPUTED).map(([file, { read }]) => [file, [read]])),
    );
    for (const [file, { classes }] of Object.entries(COMPUTED)) {
      const sheet = worn.find((wearer) => named(wearer.file) === file && wearer.computed.length);
      expect(classes.filter((name) => !classesOf.get(sheet?.sheet ?? '')?.has(name))).toEqual([]);
    }
  });
});
