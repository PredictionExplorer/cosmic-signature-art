/**
 * The type library stops at ES2022 (tsconfig.json, "lib"): the language that every browser the
 * venue supports has whole (package.json, "browserslist"), so the compiler refuses a built-in
 * that one of them lacks. ES2023 as a whole is not that language: Firefox 111 has no toSorted,
 * toReversed, toSpliced or with. But two of its array methods are older than every supported
 * browser (Chrome 97, Edge 97, Firefox 104, Safari 15.4), and they are declared here one by
 * one, as lib.es2023.array.d.ts declares them. A later method goes here only with its versions.
 */
interface Array<T> {
  findLast<S extends T>(
    predicate: (value: T, index: number, array: T[]) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  findLast(
    predicate: (value: T, index: number, array: T[]) => unknown,
    thisArg?: unknown,
  ): T | undefined;
  findLastIndex(
    predicate: (value: T, index: number, array: T[]) => unknown,
    thisArg?: unknown,
  ): number;
}
interface ReadonlyArray<T> {
  findLast<S extends T>(
    predicate: (value: T, index: number, array: readonly T[]) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  findLast(
    predicate: (value: T, index: number, array: readonly T[]) => unknown,
    thisArg?: unknown,
  ): T | undefined;
  findLastIndex(
    predicate: (value: T, index: number, array: readonly T[]) => unknown,
    thisArg?: unknown,
  ): number;
}
