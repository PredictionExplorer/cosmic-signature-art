import { locales, unlocalizedPath } from './i18n/routing';
import { DAY_MS } from './art/day';
import { EXPRESSION_KEY, HOME_RESOLVED_KEY, MOTION_KEY, OVERTURE_KEY } from './storage-keys';

/** The venue's two grounds, both taken from the work: the Ink sheet's paper and the Light field's black. */
export type Room = 'paper' | 'night';
export const ROOM_COLORS: Record<Room, string> = { paper: '#f1ebdf', night: '#000000' };
/**
 * Routes whose first screen is the night ground; the running head takes their material. Verify
 * an orbit stands on the night the orbit section draws on.
 */
export const NIGHT_ROUTES: readonly string[] = ['/process', '/verify'];

/** Views of the collection that open on black: the Spectrum wall and the Light section. */
function nightView(path: string, search: string): boolean {
  if (path !== '/collection') return false;
  const params = new URLSearchParams(search);
  return params.get('order') === 'spectrum' || params.get('expression') === 'light';
}

export function roomFor(pathname: string, search = ''): Room {
  const path = unlocalizedPath(pathname);
  const night =
    NIGHT_ROUTES.some((route) => path === route || path.startsWith(`${route}/`)) ||
    nightView(path, search);
  return night ? 'night' : 'paper';
}

/** The route's ground by pathname alone; views that need the query use roomFor. */
export function roomForPath(pathname: string): Room {
  return roomFor(pathname);
}

/**
 * Inline script for the first paint: sets <html data-room> and the theme colour before
 * hydration, so the running head is never the wrong material for a frame. Mirrors roomFor,
 * and on the home and a work, whose first screen is a plate, it paints the ground of the
 * expression the plate opens on: the URL's, else the session's remembered choice, else the
 * day's, by the arithmetic of src/lib/art/day.ts on the day's-work pool's size and the
 * server's pin. The wing takes the ground over at hydration (src/components/wing.tsx).
 *
 * It also decides the home's one timed event, First Light (src/components/overture.tsx): a first
 * visit to the home, with nothing asked of the plate in the URL and motion welcome, marks
 * <html data-overture="pending">. The day's plate stands alone from the first frame, on its own
 * ground, with the running head held back; the light then performs over it.
 */
export function roomScript({ poolSize, pinned }: { poolSize: number; pinned?: string }): string {
  return [
    '(function(){',
    `var l=${JSON.stringify(locales)},r=${JSON.stringify(NIGHT_ROUTES)};`,
    "var s=location.pathname.split('/');if(l.indexOf(s[1])>-1)s.splice(1,1);",
    "var p=s.join('/')||'/';",
    'var q=new URLSearchParams(location.search);',
    "var n=r.some(function(x){return p===x||p.indexOf(x+'/')===0})||",
    "(p==='/collection'&&(q.get('order')==='spectrum'||q.get('expression')==='light'));",
    "if(!n&&(p==='/'||/^\\/art\\/[^/]+$/.test(p))){",
    "var e=q.get('expression');",
    "if(e!=='ink'&&e!=='light'){",
    `try{e=sessionStorage.getItem(${JSON.stringify(EXPRESSION_KEY)})}catch(x){e=null}`,
    "if(e!=='ink'&&e!=='light'){",
    `var d=Math.floor((${pinned ? `Date.parse(${JSON.stringify(pinned)})` : 'Date.now()'})/${DAY_MS}),`,
    `z=${Math.max(1, poolSize)},t=((d%z)+z)%z+Math.floor(d/z);`,
    "e=((t%2)+2)%2===0?'light':'ink'}}",
    "n=e==='light'}",
    // The Overture: storage that cannot be read never traps a visitor behind the black.
    "if(p==='/'&&!q.get('expression')&&!location.hash){var o=false;",
    `try{o=!localStorage.getItem(${JSON.stringify(OVERTURE_KEY)})&&`,
    `sessionStorage.getItem(${JSON.stringify(MOTION_KEY)})!=='paused'&&`,
    "!matchMedia('(prefers-reduced-motion: reduce)').matches&&",
    // A visitor saving data is not sent a performance unasked.
    '!(navigator.connection&&navigator.connection.saveData)}catch(x){o=false}',
    "if(o){document.documentElement.setAttribute('data-overture','pending');",
    `try{sessionStorage.setItem(${JSON.stringify(HOME_RESOLVED_KEY)},'resolved')}catch(x){}}}`,
    "document.documentElement.setAttribute('data-room',n?'night':'paper');",
    'var m=document.querySelector(\'meta[name="theme-color"]\');',
    `if(m)m.setAttribute('content',n?'${ROOM_COLORS.night}':'${ROOM_COLORS.paper}');`,
    '})()',
  ].join('');
}
