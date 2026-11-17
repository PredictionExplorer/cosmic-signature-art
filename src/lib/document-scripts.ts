import { revealScript } from './reveal';
import { roomScript } from './room';
import { settleScript } from './settle';

/**
 * The inline scripts the venue's document writes itself, ahead of anything it paints
 * (src/app/venue-document.tsx): the ground, the reveal, the still. They are the only scripts of
 * the venue's own that sit in a page's HTML; every other inline script is the framework's, and
 * takes the response's nonce.
 *
 * Each is small and fixed for a build, so a Content-Security-Policy can name it by its hash:
 * the browser runs exactly this text and nothing that was put beside it. The document and the
 * proxy both read the list here, so the scripts a page carries are the ones the policy names.
 */
export interface VenueDay {
  /** How many works take turns as the day's work. */
  poolSize: number;
  /** The server's pinned day, when it has one (COSMIC_VENUE_DATE). */
  pinned?: string;
}

/** The scripts of a page that reads its ground from its route, in the order they are written. */
export function documentScripts(venueDay: VenueDay): string[] {
  return [roomScript(venueDay), revealScript, settleScript];
}

/** A script's hash as a policy writes it: `sha256-` and the digest in base64. */
export async function scriptHash(script: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}
