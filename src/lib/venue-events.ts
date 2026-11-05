/**
 * The venue's own window events, named once. Parts of a page that speak to one another across
 * it (the Turn and the wing beneath it, a word in the plate's strip and the orbit further down)
 * do so by these, so neither needs the other mounted or imported.
 */

/** The Turn has committed its seam (artwork-viewer.tsx → wing.tsx). */
export const SEAM_EVENT = 'cosmic:seam';

/** A plate's word asks the orbit beneath to go on past the frame (artwork-viewer.tsx → orbit-score.tsx). */
export const AFTER_THE_FRAME_EVENT = 'cosmic:after-the-frame';
