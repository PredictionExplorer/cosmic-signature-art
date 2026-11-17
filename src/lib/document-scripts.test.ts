// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { documentScripts, scriptHash } from './document-scripts';
import { revealScript } from './reveal';
import { roomScript } from './room';
import { settleScript } from './settle';

describe('the document’s own inline scripts', () => {
  const day = { poolSize: 3, pinned: '2026-11-06' };

  it('are the ground, the reveal and the still, in the order the document writes them', () => {
    expect(documentScripts(day)).toEqual([roomScript(day), revealScript, settleScript]);
    // The document writes exactly these, by these names, and no other script of its own: one
    // added there without its hash here would be reported on every page rendered on request.
    const written = [
      ...readFileSync(join(process.cwd(), 'src/app/venue-document.tsx'), 'utf8').matchAll(
        /<script dangerouslySetInnerHTML=\{\{ __html: (\w+)[^}]*\}\} \/>/g,
      ),
    ].map((match) => match[1]);
    expect(written).toEqual(['roomScript', 'revealScript', 'settleScript']);
  });

  it('are hashed as a policy names a script: SHA-256 of the very text, in base64', async () => {
    for (const script of [...documentScripts(day), '', 'é ≠ e'])
      expect(await scriptHash(script)).toBe(
        `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`,
      );
  });

  it('change their hash with the day’s pool or the pinned day, which the first is written with', async () => {
    const hashes = await Promise.all(
      [day, { ...day, poolSize: 4 }, { poolSize: 3 }].map(
        async (venueDay) => (await Promise.all(documentScripts(venueDay).map(scriptHash)))[0],
      ),
    );
    expect(new Set(hashes).size).toBe(3);
  });
});
