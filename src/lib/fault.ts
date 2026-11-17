/**
 * What an error page does with the error it is handed.
 *
 * Next gives an error file the value that was thrown and a `retry`, which asks the server for
 * the route's data again and renders it again. That is the right thing to try for nearly every
 * fault: a record that could not be read, a render that threw. One fault it cannot mend, and
 * every deployment can cause it: a page opened before the deployment asks for a file of script
 * the new build no longer has. Rendering again asks for the same file. Loading the page again
 * asks for the new build's document, and the files that document names.
 */
export function isMissingScript(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    // The bundler's own name for it (Turbopack and webpack alike), then each engine's words for
    // a module that could not be fetched.
    error.name === 'ChunkLoadError' ||
    /Failed to load chunk|Loading chunk \S+ failed|dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  );
}

/** "Try again": the route's data and its render once more, or the page afresh for a missing file. */
export function tryAgain(
  error: unknown,
  retry: () => void,
  reload: () => void = () => window.location.reload(),
): void {
  if (isMissingScript(error)) reload();
  else retry();
}

/**
 * The server's reference for a fault it met while rendering. In production Next sends the
 * browser no message of the server's, only this digest, and writes the same digest beside the
 * real error in the host's log. Shown on the error page, it is what lets a visitor's report be
 * matched to that line. A fault met in the browser has none.
 */
export function faultReference(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return undefined;
  const { digest } = error;
  // A digest is a short token; anything else is not shown as one.
  return typeof digest === 'string' && /^[\w@:.-]{1,64}$/.test(digest) ? digest : undefined;
}
