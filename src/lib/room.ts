import { locales, unlocalizedPath } from './i18n/routing';

/** The venue's two grounds, both taken from the work: the Ink sheet's paper and the Light field's black. */
export type Room = 'paper' | 'night';
export const ROOM_COLORS: Record<Room, string> = { paper: '#f1ebdf', night: '#000000' };
/** Routes whose first screen is the night ground; the running head takes their material. */
export const NIGHT_ROUTES: readonly string[] = ['/process'];

export function roomForPath(pathname: string): Room {
  const path = unlocalizedPath(pathname);
  return NIGHT_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))
    ? 'night'
    : 'paper';
}

/**
 * Inline script for the first paint: sets <html data-room> and the theme colour before
 * hydration, so the running head is never the wrong material for a frame. Mirrors roomForPath.
 */
export const roomScript = [
  '(function(){',
  `var l=${JSON.stringify(locales)},r=${JSON.stringify(NIGHT_ROUTES)};`,
  "var s=location.pathname.split('/');if(l.indexOf(s[1])>-1)s.splice(1,1);",
  "var p=s.join('/')||'/';",
  "var n=r.some(function(x){return p===x||p.indexOf(x+'/')===0});",
  "document.documentElement.setAttribute('data-room',n?'night':'paper');",
  'var m=document.querySelector(\'meta[name="theme-color"]\');',
  `if(m)m.setAttribute('content',n?'${ROOM_COLORS.night}':'${ROOM_COLORS.paper}');`,
  '})()',
].join('');
