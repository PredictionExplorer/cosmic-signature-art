/**
 * The venue's storage keys, named once. Several are read twice: by the component that keeps
 * them, and by the first-paint script (src/lib/room.ts), which runs before any module does.
 */

/** sessionStorage: the expression the visit chose; a new visit opens on the day's (turn.tsx). */
export const EXPRESSION_KEY = 'cosmic-art-expression-v1';

/** sessionStorage: an explicit Pause or Play, over the system's preference (motion-provider.tsx). */
export const MOTION_KEY = 'cosmic-art-motion-v1';

/** sessionStorage: the home's arrival has resolved this visit, so it opens on the still. */
export const HOME_RESOLVED_KEY = 'cosmic-art-home-film-v1';

/**
 * localStorage: this browser has seen the home's one timed event, which plays on a first visit
 * only. First Light succeeds the Overture under a new key, so a visitor who saw the Overture is
 * shown First Light once (docs/first-light.md §4).
 */
export const OVERTURE_KEY = 'cosmic-art-first-light-v1';

/**
 * sessionStorage: where the reader stood when they changed language, kept for the page in the
 * other language and let go on arrival (src/components/reading-place.tsx).
 */
export const PLACE_KEY = 'cosmic-art-place-v1';
