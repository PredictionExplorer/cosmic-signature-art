import { describe, expect, it, vi } from 'vitest';
import { NIGHT_ROUTES, ROOM_COLORS } from '@/lib/room';
import { nightViewport, venueViewport } from './viewport';

// The pages read the catalogue's server module; only their viewport export is read here.
vi.mock('server-only', () => ({}));

/** Each night route's page, as the router finds it; a route added to the list needs its page here. */
const pages: Record<string, () => Promise<{ viewport?: unknown }>> = {
  '/process': () => import('./[locale]/process/page'),
  '/verify': () => import('./[locale]/verify/orbit/[id]/page'),
  '/collection/all-the-light': () => import('./[locale]/collection/all-the-light/page'),
  '/collection/orrery': () => import('./[locale]/collection/orrery/page'),
};

describe('the theme colour the server sends', () => {
  it('is the paper on the venue and the night on a night route, otherwise alike', () => {
    expect(venueViewport.themeColor).toBe(ROOM_COLORS.paper);
    expect(nightViewport).toEqual({ ...venueViewport, themeColor: ROOM_COLORS.night });
  });

  it('is the night on every night route, so React never renders a second, paper one', async () => {
    expect(Object.keys(pages).sort()).toEqual([...NIGHT_ROUTES].sort());
    for (const route of NIGHT_ROUTES) expect((await pages[route]!()).viewport).toBe(nightViewport);
  }, 30_000);

  it('is the night on the 404', async () => {
    expect((await import('./global-not-found')).viewport).toBe(nightViewport);
  });
});
