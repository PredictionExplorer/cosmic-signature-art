import { describe, expect, it } from 'vitest';
import data from './all-the-light.json' with { type: 'json' };
import ladder from './still-ladder.json' with { type: 'json' };
import { allTheLight, bindSky } from './all-the-light';

describe('all the light', () => {
  it('binds the committed sky to the ladder, cycle by cycle, at both widths', () => {
    const sky = allTheLight()!;
    expect(sky.works).toHaveLength(72);
    expect(sky.skies.map((entry) => entry.upTo)).toEqual([0, 1, 2]);
    for (const entry of sky.skies) {
      expect(entry.srcSet).toMatch(
        /^\/art\/light\/sky-\d-1280-[a-f0-9]{16}\.webp 1280w, \/art\/light\/sky-\d-1920-[a-f0-9]{16}\.webp 1920w$/,
      );
      expect(entry.src).toContain('-1280-');
      expect([entry.width, entry.height]).toEqual([1920, 1242]);
    }
    expect(sky.works[0]).toMatchObject({ id: 0, cycle: 0 });
    expect(sky.works[0].still).toMatch(/^\/art\/stills\/0-light-1280-[a-f0-9]{16}\.webp$/);
    expect(sky.grid.across * sky.grid.columns).toBe(1024);
  });

  it('is not shown once any Light rung it was summed from has changed', () => {
    const rungs = ladder.rungs.map((rung) =>
      rung.id === 31 && rung.expression === 'light' && rung.width === 1920
        ? { ...rung, sha256: '0'.repeat(64) }
        : rung,
    );
    expect(bindSky(data, { ...ladder, rungs })).toBeUndefined();
    expect(bindSky(data, { rungs: ladder.rungs.filter((rung) => rung.id !== 31) })).toBeUndefined();
    expect(bindSky({ ...data, schemaVersion: 2 }, ladder)).toBeUndefined();
    expect(
      bindSky({ ...data, skies: data.skies.filter((sky) => sky.upTo !== 1) }, ladder),
    ).toBeUndefined();
  });
});
