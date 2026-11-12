import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { locales } from './routing';

/**
 * A message catalog holds every string the venue says in one language, and the venue speaks
 * eight. They stay on the server, and there are two ways out:
 *
 * - as code: a Client Component that imports a catalog, itself or through any module it
 *   imports, puts all eight into the script every page downloads;
 * - as data: a Server Component that hands a Client Component the catalog it holds has React
 *   write the whole of it into the document, since every prop that crosses is serialised.
 *
 * So a Client Component names the strings it reads in a list beside it (key-sheet.words.ts),
 * and a Server Component hands it those alone (words(), src/lib/i18n/words.ts). This reads
 * the sources as the compiler does, and fails when either way out opens again.
 */
const root = process.cwd();
const src = join(root, 'src');
const english = join(src, 'lib/i18n/en.ts');

/** The modules that hold whole catalogs: one a language, and the one that gathers them. */
const CATALOGS = ['messages', ...locales].map((name) => join(src, 'lib/i18n', `${name}.ts`));

/**
 * Client Components still handed the whole catalog. The orbit files declare `t: Messages` and
 * are left as they are while another branch rewrites them; each comes off this list in the
 * change that lists its words, and the test below fails if one stays here after that.
 */
const PENDING = ['OrbitPicker', 'OrbitScore', 'OrbitVerifier'];

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

const named = (path: string) => relative(root, path);

/** Every node of a source file, in order. */
function each(source: ts.SourceFile, visit: (node: ts.Node) => void) {
  const walk = (node: ts.Node) => {
    visit(node);
    node.forEachChild(walk);
  };
  walk(source);
}

describe('the client boundary of the message catalogs', () => {
  const files = sources(src);
  const clientFiles = new Set(
    files.filter((path) => /^\s*['"]use client['"]/.test(readFileSync(path, 'utf8'))),
  );
  let program: ts.Program;
  let checker: ts.TypeChecker;
  let options: ts.CompilerOptions;
  /** The type every catalog has: `Messages`, from the English one. */
  let catalog: ts.Type;

  // Reading the project as the compiler does takes a second or two, and several on CI.
  beforeAll(() => {
    const { config } = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    options = {
      ...ts.parseJsonConfigFileContent(config, ts.sys, root).options,
      incremental: false,
    };
    program = ts.createProgram({ rootNames: files, options });
    checker = program.getTypeChecker();
    catalog = checker.getDeclaredTypeOfSymbol(
      checker
        .getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(english)!)!)
        .find((symbol) => symbol.name === 'Messages')!,
    );
  }, 120_000);

  /** The source modules a module imports for their values; a type-only import bundles nothing. */
  function valueImports(path: string): string[] {
    const source = program.getSourceFile(path);
    if (!source) return [];
    const specifiers: string[] = [];
    each(source, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typesOnly =
          clause?.isTypeOnly ||
          (clause &&
            !clause.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.every((element) => element.isTypeOnly));
        if (!typesOnly) specifiers.push(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        if (!node.isTypeOnly) specifiers.push(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        // Loaded later is still loaded by the browser.
        specifiers.push(node.arguments[0].text);
      }
    });
    return specifiers.flatMap((specifier) => {
      const resolved = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule;
      const file = resolved?.resolvedFileName;
      return file && file.startsWith(src) && /\.tsx?$/.test(file) ? [file] : [];
    });
  }

  it('finds the client components and the catalogs', () => {
    expect(clientFiles.size).toBeGreaterThan(10);
    for (const path of CATALOGS) expect(files, named(path)).toContain(path);
    expect(checker.getPropertiesOfType(catalog).length).toBeGreaterThan(500);
  });

  it('keeps every catalog out of the script a browser downloads', () => {
    // From each Client Component, through everything it imports, to a catalog: the way there.
    const ways: string[] = [];
    for (const entry of clientFiles) {
      const from = new Map<string, string | null>([[entry, null]]);
      const queue = [entry];
      for (let path = queue.shift(); path; path = queue.shift()) {
        if (CATALOGS.includes(path)) {
          const way = [path];
          for (let step = from.get(path); step; step = from.get(step)) way.unshift(step);
          ways.push(way.map(named).join(' → '));
          break;
        }
        for (const next of valueImports(path))
          if (!from.has(next)) {
            from.set(next, path);
            queue.push(next);
          }
      }
    }
    expect(ways).toEqual([]);
  });

  it('hands a Client Component the words it reads, never the catalog', () => {
    const size = checker.getPropertiesOfType(catalog).length;
    const whole = (type: ts.Type) =>
      checker.getPropertiesOfType(type).length >= size && checker.isTypeAssignableTo(type, catalog);

    const handed: { component: string; where: string }[] = [];
    for (const path of files) {
      // Between two Client Components nothing is serialised: the boundary is a module without
      // the directive rendering a component from a module with it.
      if (!path.endsWith('.tsx') || clientFiles.has(path)) continue;
      const source = program.getSourceFile(path)!;
      each(source, (node) => {
        if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
        const symbol = checker.getSymbolAtLocation(node.tagName);
        const component =
          symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const declared = component?.declarations?.[0]?.getSourceFile().fileName;
        if (!declared || !clientFiles.has(declared)) return;
        for (const attribute of node.attributes.properties) {
          const value = ts.isJsxAttribute(attribute)
            ? attribute.initializer && ts.isJsxExpression(attribute.initializer)
              ? attribute.initializer.expression
              : undefined
            : attribute.expression;
          if (!value) continue;
          // The catalog itself, or an object that carries it one level down.
          const type = checker.getTypeAtLocation(value);
          const carried =
            whole(type) ||
            checker
              .getPropertiesOfType(type)
              .some((property) => whole(checker.getTypeOfSymbolAtLocation(property, value)));
          if (!carried) continue;
          const tag = node.tagName.getText(source);
          const { line } = source.getLineAndCharacterOfPosition(attribute.getStart(source));
          handed.push({
            component: tag,
            where: `${named(path)}:${line + 1} hands <${tag}> the whole catalog`,
          });
        }
      });
    }

    expect(
      handed.filter(({ component }) => !PENDING.includes(component)).map(({ where }) => where),
    ).toEqual([]);
    // A component whose words are now listed is no longer excused.
    expect(PENDING.filter((name) => !handed.some(({ component }) => component === name))).toEqual(
      [],
    );
  });

  it('lists for a module no string the module does not read', () => {
    // The other direction is the compiler's: a string read but not listed is a type error.
    const en = program.getSourceFile(english)!;
    /** A catalog, or any pick of one: every property is one the English catalog declares. */
    const ofCatalog = (type: ts.Type) => {
      const properties = checker.getPropertiesOfType(type);
      return (
        properties.length > 0 &&
        properties.every((property) =>
          property.declarations?.some((declaration) => declaration.getSourceFile() === en),
        )
      );
    };

    const unread: string[] = [];
    for (const list of files.filter((path) => path.endsWith('.words.ts'))) {
      // key-sheet.words.ts lists what key-sheet.tsx reads; format.words.ts, what format.ts does.
      const beside = ['.tsx', '.ts']
        .map((extension) => list.replace(/\.words\.ts$/, extension))
        .find((path) => files.includes(path));
      expect(beside, `${named(list)} stands beside no module`).toBeDefined();

      // What the list names itself; a spread list is held to its own module.
      const listed = new Set<string>();
      each(program.getSourceFile(list)!, (node) => {
        if (ts.isArrayLiteralExpression(node))
          for (const element of node.elements)
            if (ts.isStringLiteral(element)) listed.add(element.text);
      });

      // What the module reads: `t.close`, and `t[TABLE[key]]` for each key the table can give.
      const read = new Set<string>();
      each(program.getSourceFile(beside!)!, (node) => {
        if (ts.isPropertyAccessExpression(node)) {
          if (ofCatalog(checker.getTypeAtLocation(node.expression))) read.add(node.name.text);
        } else if (ts.isElementAccessExpression(node)) {
          if (!ofCatalog(checker.getTypeAtLocation(node.expression))) return;
          const key = checker.getTypeAtLocation(node.argumentExpression);
          for (const part of key.isUnion() ? key.types : [key])
            if (part.isStringLiteral()) read.add(part.value);
        }
      });

      for (const key of listed)
        if (!read.has(key))
          unread.push(`${named(list)} lists '${key}', which ${named(beside!)} does not read`);
    }
    expect(unread).toEqual([]);
  });
});
