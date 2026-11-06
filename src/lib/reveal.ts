/**
 * Inline script for the first paint in WebKit. React streams a large Suspense boundary behind
 * its fallback: its runtime queues the boundary in $RB and reveals the batch with $RV on the
 * next animation frame. During a navigation WebKit can withhold every frame until the page has
 * something to paint (the plate's inline preview is enough) or has loaded. Behind a route's
 * fallback there is nothing to paint until the reveal, so each waits for the other until the
 * hero's still arrives. While no frame has come and React is still waiting for one, this
 * reveals the queued batch itself, as the frame would have. Browsers that paint promptly never
 * reach it. If React renames its runtime, the script does nothing, and the WebKit first-paint
 * tests fail.
 */
export const revealScript = [
  '(function(){',
  'var framed=false;requestAnimationFrame(function(){framed=true});',
  'function check(){',
  'if(framed)return;',
  'var batch=window.$RB;',
  "if(batch&&batch.length&&typeof window.$RT!=='number'&&typeof window.$RV==='function'){",
  'window.$RV(batch);return}',
  "if(document.readyState==='loading')setTimeout(check,50)}",
  'setTimeout(check,50)',
  '})()',
].join('');
