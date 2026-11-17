/**
 * The page a reader has when no script runs: script switched off, refused by a filter, or a
 * reader that never runs any (a text browser, an archive, most crawlers that are not a search
 * engine's).
 *
 * Nearly all of the venue needs nothing from this file. A page the venue can set from what it
 * holds itself is sent whole, with no Suspense boundary around it, so its work and its words
 * are in the document where they belong. That matters because of how React streams: once a
 * document has passed 12,800 bytes, React sets the content of every boundary larger than 500
 * bytes aside, in a `<div hidden id="S:…">` at the end of the document, and an inline script
 * moves it into place. Without script it would never be seen.
 *
 * Two things are left, and the document carries this stylesheet in a `<noscript>` for them.
 *
 * **The still.** The server sends a plate's still clear over its preview, and script shows it
 * once it has decoded (src/lib/settle.ts). Without script nothing would, so the stylesheet
 * shows it: the work at full strength is not something script may withhold.
 *
 * **What can only come from the live indexer after the page has begun**: a work imprinted
 * since the index was read, the results of a name search, a work's custody history. Those
 * still stream, and without script nothing moves them into place. So the parts are marked:
 *
 * - `AWAITS_STREAM` marks what only waits for a streamed part: a waiting plate, a line that
 *   says a record is opening. Without script it is taken away, because nothing will replace it.
 * - `STREAMED` marks the root of a streamed part that has no stand-in on the page. Without
 *   script it is shown, between the page and the colophon, where the stream left it.
 *
 * A streamed part whose stand-in already holds its words (a work's entry, set first from the
 * index) is marked with neither and stays set aside: the stand-in is the page.
 *
 * `:has()` came to Firefox in 121. In Firefox 111 to 120 with script off, a marked part stays
 * hidden, as every streamed part was before this file.
 *
 * The instruments are another matter and are not this file's: the Turn, the films, the Index
 * sheet and the orbit's derivation are script, and their words and controls still stand on a
 * page that cannot run them.
 */
export const AWAITS_STREAM = { 'data-awaits-stream': '' } as const;
export const STREAMED = { 'data-streamed': '' } as const;

export const withoutScriptStyles = [
  // One element more than the rule that holds a still clear (globals.css, "The arrival"), so
  // this one wins wherever the document places it.
  '.art-media img.art-still{opacity:1}',
  '[data-awaits-stream]{display:none}',
  // The segments are the body's children, after the site's wrapper. The wrapper gives its
  // children to the body, so a revealed segment can take its place ahead of the colophon.
  'body{display:flex;flex-direction:column;min-height:100svh;overflow-x:clip}',
  '.site{display:contents}',
  '.site-footer{order:2}',
  'div[hidden][id^="S:"]:has(>[data-streamed]){display:block;order:1}',
].join('');
