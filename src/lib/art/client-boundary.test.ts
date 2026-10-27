import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The registries behind the curated catalog and the derivative readers weigh more than a page
 * should carry, so they are read on the server and handed to the client as a work's own media.
 * This guards the direct imports; a module a client component imports must keep the same rule.
 */
const SERVER_ONLY_MODULES = [
  'catalog',
  'collection-cards',
  'collection-index',
  'collection-previews',
  'derivatives',
  'media',
  'plate-clips',
  'plate-details',
  'server',
  'still-ladder',
  'work-of-the-day',
];
const importPattern = new RegExp(
  `from\\s+['"](?:@/lib/art|\\.{1,2}(?:/lib/art)?)/(${SERVER_ONLY_MODULES.join('|')})['"]`,
);
const src = join(process.cwd(), 'src');
/** No client component is excused: the sale's page hands its catalogue the curated works. */
const PENDING: string[] = [];

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

describe('the client boundary of the art library', () => {
  const clientFiles = sources(src).filter((path) =>
    /^\s*['"]use client['"]/.test(readFileSync(path, 'utf8')),
  );

  it('finds the client components', () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it('keeps every registry-bearing module out of client components', () => {
    // Type-only imports bundle nothing and are fine anywhere.
    const valueImports = (source: string) => source.replace(/import\s+type\s[^;]+;/g, '');
    const offenders = clientFiles
      .filter((path) => importPattern.test(valueImports(readFileSync(path, 'utf8'))))
      .map((path) => relative(process.cwd(), path))
      .filter((path) => !PENDING.includes(path));
    expect(offenders).toEqual([]);
  });

  it('keeps the art barrel free of the catalog', () => {
    const barrel = readFileSync(join(src, 'lib/art/index.ts'), 'utf8');
    expect(barrel).not.toMatch(/from\s+['"]\.\/catalog['"]/);
  });
});
