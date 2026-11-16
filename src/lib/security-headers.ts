import { ART_MEDIA_ORIGINS } from './art/constants.ts';

/**
 * The headers every response of the venue carries, and the Content-Security-Policy among them.
 *
 * A policy is the list of places a page may load from and send to. Whatever a page is tricked
 * into carrying (a script from elsewhere, a picture that phones home, a form that posts away, a
 * frame around the page) the browser refuses, because the place is not on the list. The venue
 * loads from two places, itself and its publisher's media host, and calls one more, the chain's
 * JSON-RPC endpoint, on the sale's pages. Each is named here once, from the constant the code
 * itself uses, so the list cannot drift from what the pages ask for.
 *
 * This file imports with its extension, and nothing of the venue's but constants: next.config.ts
 * loads it through Node's own resolver, before any bundler runs, and in the unit tests Node
 * reads it as it stands. So it, and the constants it imports, keep to TypeScript that needs
 * only its types taken away: no enum, no namespace, no parameter property.
 *
 * **What the enforced policy does not do.** `script-src` allows inline scripts. Next writes each
 * page's data into the document as inline scripts whose text differs on every page, so no list
 * of hashes can name them; and a nonce needs a page rendered for each request, while the
 * prerendered pages (the home, Process, the statement) are files, sent as built. The pages
 * rendered on request can carry a nonce, and do: `strictScriptPolicy` below is sent with them
 * by the proxy (src/proxy.ts) as a report-only policy, where the browser suite holds every such
 * page to it before it is ever enforced. What an inline script could still do is bounded by
 * the rest of this policy: it can load no script from elsewhere, evaluate no string as code,
 * and send what it reads to no place but the three named.
 */

/** The public endpoint the sale reads the chain from when no other is configured. */
export const DEFAULT_RPC_URL = 'https://arb1.arbitrum.io/rpc';

export interface PolicyEnvironment {
  /** The sale's JSON-RPC endpoint (`NEXT_PUBLIC_RPC_URL`). */
  rpcUrl?: string;
  /**
   * `next dev`. React rebuilds server stack traces there with `eval`, and the dev server pushes
   * changes over a socket. A production build asks for neither.
   */
  development?: boolean;
}

/** An address's origin, or nothing for one that does not parse: such an address names no place. */
function originOf(address: string): string | undefined {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

const SELF = "'self'";
const NONE = "'none'";
type Directive = [name: string, sources: string[]];

/** The enforced policy, directive by directive, in the order it is sent. */
export function policyDirectives({
  rpcUrl,
  development = false,
}: PolicyEnvironment = {}): Directive[] {
  const rpc = originOf(rpcUrl || DEFAULT_RPC_URL);
  return [
    // Anything no directive below names may come from the venue alone.
    ['default-src', [SELF]],
    // The venue's own files, and the inline scripts of its documents (see above). No string is
    // ever evaluated as code, and no script comes from another host.
    ['script-src', [SELF, "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])]],
    // Workers are the venue's own modules (ARCHITECTURE.md §5).
    ['worker-src', [SELF]],
    // Stylesheets are the venue's files. Inline styles carry each plate's measured ground and
    // the Turn's seam as custom properties; a style reads nothing and sends nothing.
    ['style-src', [SELF, "'unsafe-inline'"]],
    // Stills: the venue's own rungs and previews, the 640 px preview inline in the document
    // (data:), and the publisher's originals.
    ['img-src', [SELF, 'data:', ...ART_MEDIA_ORIGINS]],
    // Films: the venue's own clips and the publisher's originals.
    ['media-src', [SELF, ...ART_MEDIA_ORIGINS]],
    ['font-src', [SELF]],
    // The venue's own routes, and the chain's endpoint for the sale. A wallet is an extension
    // of the browser: the page speaks to it in the page, not over the network.
    ['connect-src', [SELF, ...(rpc ? [rpc] : []), ...(development ? ['ws:'] : [])]],
    ['manifest-src', [SELF]],
    // Nothing is framed, embedded or plugged in, here or around the venue.
    ['frame-src', [NONE]],
    ['object-src', [NONE]],
    ['frame-ancestors', [NONE]],
    // No <base> may move the venue's relative addresses, and no form posts anywhere else.
    ['base-uri', [NONE]],
    ['form-action', [SELF]],
  ];
}

const written = (directives: Directive[]) =>
  directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');

/** The enforced Content-Security-Policy, as one header value. */
export function contentSecurityPolicy(environment: PolicyEnvironment = {}): string {
  return written(policyDirectives(environment));
}

/**
 * The name the report-only policy gives for its reports. No address stands behind it: there is
 * no Reporting-Endpoints header, so a browser that would report has nowhere to send, and sends
 * nothing. The name is still needed. WebKit sets a report-only policy aside altogether when it
 * names no group ("the policy will have no effect"), and says so as an error on every page.
 * Giving the group an address is how reports would begin to arrive, and that is the owner's to
 * decide: a report carries the page's address and the browser that made it.
 */
export const REPORT_GROUP = 'venue-policy';

/**
 * The script policy a page rendered on request can keep: a script runs only if it carries this
 * response's nonce or is one of the document's own by hash, and what such a script loads is
 * trusted in turn (`'strict-dynamic'`). Nothing written into the page by anyone else runs: not
 * a script element, not a handler in an attribute. `'unsafe-inline'` and `https:` are for a
 * browser too old to know nonces; one that knows them ignores both.
 *
 * It is sent report-only (src/proxy.ts): the browser enforces nothing of it, and says in its
 * console, and to the page as a `securitypolicyviolation` event, what it would have refused.
 * That is what the browser suite reads on every such page, in every engine. What is not yet
 * known, and is the reason it is not enforced, is whether every wallet's extension still
 * reaches the page under it: some write their provider into the page as an inline script.
 */
export function strictScriptPolicy(
  nonce: string,
  hashes: readonly string[],
  { development = false }: Pick<PolicyEnvironment, 'development'> = {},
): string {
  return written([
    [
      'script-src',
      [
        `'nonce-${nonce}'`,
        ...hashes.map((hash) => `'${hash}'`),
        "'strict-dynamic'",
        ...(development ? ["'unsafe-eval'"] : []),
        "'unsafe-inline'",
        'https:',
      ],
    ],
    ['object-src', [NONE]],
    ['base-uri', [NONE]],
    ['report-to', [REPORT_GROUP]],
  ]);
}

/**
 * The headers of every response. Next's `headers()` returns them for every path
 * (next.config.ts), so a page, a file and the API answer alike.
 */
export function securityHeaders(environment: PolicyEnvironment = {}) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(environment) },
    // A window that opens the venue, or that the venue opens, shares nothing with it: there is
    // no reference left through which another site could steer a page a wallet is about to trust.
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // For a browser older than frame-ancestors.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
