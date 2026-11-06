import { NotFoundPage } from './not-found-page';

/**
 * A page's own notFound(), inside the venue's frame. An unknown work, exhibition or orbit
 * number is refused by the proxy before its page renders (src/lib/addresses.ts); this answers
 * what is left, after the page has begun to stream.
 */
export default function NotFound() {
  return <NotFoundPage />;
}
