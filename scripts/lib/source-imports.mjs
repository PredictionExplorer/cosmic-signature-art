/*
  A resolve hook for script tests that read the venue's own modules as the page does: the
  "@/…" alias, and relative imports written without an extension. Node strips the types of a
  `.ts` file it is handed; it does not find one from a bare `./name`. Registered by a test with
  `register('./lib/source-imports.mjs', import.meta.url, { data: { root } })`.
*/
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let root = '';
export function initialize(data) {
  root = data.root;
}

const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile();

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith('@/')) target = path.join(root, 'src', specifier.slice(2));
  else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith('file:')) {
    const parent = fileURLToPath(context.parentURL);
    if (parent.startsWith(path.join(root, 'src')))
      target = path.resolve(path.dirname(parent), specifier);
  }
  if (target)
    for (const candidate of [target, `${target}.ts`, path.join(target, 'index.ts')])
      if (isFile(candidate)) return next(pathToFileURL(candidate).href, context);
  return next(specifier, context);
}
