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

/** localStorage: this browser has seen the Overture, which plays on a first visit only. */
export const OVERTURE_KEY = 'cosmic-art-overture-v1';
