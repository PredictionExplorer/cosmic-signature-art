// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { ART_API_ORIGIN, ART_MEDIA_ORIGINS } from './art/constants';
import { rpcUrl } from './auction/config';
import {
  DEFAULT_RPC_URL,
  REPORT_GROUP,
  contentSecurityPolicy,
  policyDirectives,
  securityHeaders,
  strictScriptPolicy,
} from './security-headers';

/** A policy as a browser reads it: each directive's sources by its name. */
function read(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );
}

describe('the Content-Security-Policy', () => {
  const policy = read(contentSecurityPolicy());

  it('names the venue alone for anything it does not name', () => {
    expect(policy['default-src']).toEqual(["'self'"]);
  });

  it('runs no script from another host and evaluates no string as code', () => {
    expect(policy['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['worker-src']).toEqual(["'self'"]);
    for (const sources of Object.values(policy)) {
      expect(sources).not.toContain("'unsafe-eval'");
      // No wildcard and no bare scheme: every place is named.
      expect(sources.filter((source) => /^\*|^https?:$|^wss?:$/.test(source))).toEqual([]);
    }
  });

  it('loads stills and films from the venue and the publisher’s hosts, and nowhere else', () => {
    expect(policy['img-src']).toEqual(["'self'", 'data:', ...ART_MEDIA_ORIGINS]);
    expect(policy['media-src']).toEqual(["'self'", ...ART_MEDIA_ORIGINS]);
    expect(ART_MEDIA_ORIGINS).toContain(ART_API_ORIGIN);
    expect(policy['font-src']).toEqual(["'self'"]);
  });

  it('calls the venue and the chain’s endpoint the sale is configured with', () => {
    // The endpoint the sale's client reads is the one the policy lets it reach.
    expect(new URL(rpcUrl).origin).toBe(new URL(DEFAULT_RPC_URL).origin);
    expect(policy['connect-src']).toEqual(["'self'", new URL(DEFAULT_RPC_URL).origin]);
    expect(
      read(contentSecurityPolicy({ rpcUrl: 'https://rpc.example.org/v1/key' }))['connect-src'],
    ).toEqual(["'self'", 'https://rpc.example.org']);
    // An address that names no place adds none.
    for (const unreadable of ['not an address', 'javascript:alert(1)', 'data:text/html,x'])
      expect(read(contentSecurityPolicy({ rpcUrl: unreadable }))['connect-src']).toEqual([
        "'self'",
      ]);
  });

  it('frames nothing, is framed by nothing, and posts and bases nowhere else', () => {
    expect(policy['frame-src']).toEqual(["'none'"]);
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'none'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
  });

  it('gives the dev server what it alone needs, and a production build none of it', () => {
    const development = read(contentSecurityPolicy({ development: true }));
    expect(development['script-src']).toContain("'unsafe-eval'");
    expect(development['connect-src']).toContain('ws:');
    expect(contentSecurityPolicy()).not.toMatch(/unsafe-eval|ws:/);
  });

  it('writes each directive once', () => {
    const names = policyDirectives().map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(contentSecurityPolicy()).not.toMatch(/[\n,]/);
  });
});

describe('the script policy of a page rendered on request', () => {
  it('runs a script by this response’s nonce or by its hash, and trusts what those load', () => {
    const policy = read(strictScriptPolicy('bm9uY2U=', ['sha256-AAAA', 'sha256-BBBB']));
    expect(policy['script-src']).toEqual([
      "'nonce-bm9uY2U='",
      "'sha256-AAAA'",
      "'sha256-BBBB'",
      "'strict-dynamic'",
      "'unsafe-inline'",
      'https:',
    ]);
    expect(policy['script-src']).not.toContain("'self'");
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'none'"]);
  });

  it('names a group for its reports, and the venue gives that group no address', async () => {
    // WebKit ignores a report-only policy that names none. Nothing is sent while no
    // Reporting-Endpoints (or Report-To) header gives the group somewhere to send.
    expect(read(strictScriptPolicy('bm9uY2U=', []))['report-to']).toEqual([REPORT_GROUP]);
    const sent = (await nextConfig.headers!()).flatMap((rule) => rule.headers);
    expect(sent.filter((entry) => /^report(ing-endpoints|-to)$/i.test(entry.key))).toEqual([]);
    expect(contentSecurityPolicy()).not.toMatch(/report-(to|uri)/);
  });

  it('lets the dev server evaluate, as the enforced policy does there', () => {
    const development = read(strictScriptPolicy('bm9uY2U=', [], { development: true }));
    expect(development['script-src']).toContain("'unsafe-eval'");
    expect(strictScriptPolicy('bm9uY2U=', [])).not.toContain('unsafe-eval');
  });
});

describe('the headers of every response', () => {
  const header = (key: string) => securityHeaders().find((entry) => entry.key === key)?.value;

  it('carries the policy, enforced', () => {
    expect(header('Content-Security-Policy')).toBe(contentSecurityPolicy());
  });

  it('shares its window with no other site, and refuses a frame in the older way too', () => {
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('is what the configuration sends for every path', async () => {
    const rules = await nextConfig.headers!();
    const everywhere = rules.find((rule) => rule.source === '/:path*');
    expect(everywhere?.headers).toEqual(securityHeaders());
    // No other rule may carry a policy of its own: a browser enforces every policy it is sent.
    const policies = rules
      .flatMap((rule) => rule.headers)
      .filter((entry) => /^content-security-policy/i.test(entry.key));
    expect(policies).toHaveLength(1);
  });

  it('is found by Next wherever the server was started', () => {
    // Next runs the compiled configuration with no filename, so a neighbour it imported was
    // looked for from the working directory, and a server started beside a build, not inside
    // it, stopped at "Cannot find module './src/lib/security-headers.ts'". Here Next's own
    // loader reads the configuration from a directory that holds nothing of the venue.
    const load = `
      const config = require(process.argv[1] + '/node_modules/next/dist/server/config').default;
      config('phase-production-server', process.argv[1], { silent: true })
        .then((loaded) => loaded.headers())
        .then((rules) => process.stdout.write(JSON.stringify(rules)));
    `;
    const rules = JSON.parse(
      execFileSync(process.execPath, ['-e', load, process.cwd()], {
        cwd: tmpdir(),
        encoding: 'utf8',
      }),
    ) as { source: string; headers: { key: string; value: string }[] }[];
    expect(rules.find((rule) => rule.source === '/:path*')?.headers).toEqual(securityHeaders());
  }, 60_000);
});
