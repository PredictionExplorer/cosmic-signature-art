import type { FullConfig } from '@playwright/test';
import { VENUE_DATE } from './venue-day';

/**
 * A server reused from the shell must be on the suite's venue day, or every expectation that
 * rests on the day's expression fails for a reason it would not name. The first-paint script
 * a work page ships names the pin it was rendered with (src/lib/room.ts), so one read says it.
 */
export default async function venueDayGuard(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;
  const page = await fetch(new URL('/art/31', baseURL));
  const html = await page.text();
  if (!html.includes(`Date.parse(${JSON.stringify(VENUE_DATE)})`))
    throw new Error(
      `The server at ${baseURL} is not on the suite's venue day, ${VENUE_DATE}. Build and start it ` +
        `with COSMIC_VENUE_DATE=${VENUE_DATE}, or stop it so Playwright starts its own.`,
    );
}
