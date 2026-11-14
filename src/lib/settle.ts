/**
 * Inline script that shows a plate's still when the still has loaded, not when script has run.
 *
 * The server sends the full still as `<img class="art-still">` over the plate's inline preview,
 * and the stylesheet keeps it clear until it carries `is-settled` (globals.css, "The arrival").
 * The plate adds the class once it has hydrated (artwork-media.tsx), which is only after the
 * route's script has downloaded, compiled and run: seconds on a slow connection, and never if a
 * script fails. On a desk the still is the Largest Contentful Paint, so that wait was its render
 * delay. This script adds the class itself. `load` does not bubble, so it listens for it in the
 * capture phase, on the document; for a still it waits for the decode, as the plate does, and
 * then settles it. The fade over the preview is the stylesheet's, and is unchanged.
 *
 * The script only ever adds the class, and React never takes it away: the plate's state starts
 * unsettled and only ever becomes settled, so the one write React makes to the still's class
 * adds the same word (artwork-media-settle.test.tsx). The plate's own settling goes on as
 * before, and it alone decides what waits on the still: `data-arrival`, the film's hold, the
 * strip. The listener lasts as long as the document, so it also settles the stills React mounts
 * later (after a Turn, in the room), on the same decode the plate waits for.
 *
 * It stands ahead of every plate, so no still exists when it runs; the sweep is for a document
 * that places it later. It is small and static, so a Content-Security-Policy can name it by its
 * hash.
 */
export const settleScript = [
  '(function(){',
  'function settle(image){',
  "if(!image.matches('img.art-still'))return;",
  "function show(){image.classList.add('is-settled')}",
  'if(image.decode)image.decode().then(show,show);else show()}',
  "document.addEventListener('load',function(event){settle(event.target)},true);",
  "var stills=document.querySelectorAll('img.art-still');",
  'for(var i=0;i<stills.length;i++)',
  'if(stills[i].complete&&stills[i].naturalWidth>0)settle(stills[i])',
  '})()',
].join('');
