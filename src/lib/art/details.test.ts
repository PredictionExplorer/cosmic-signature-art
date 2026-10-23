import { describe, expect, it, vi } from 'vitest';
import { ART_API_ORIGIN, MEDIA_REVALIDATE_SECONDS } from './constants';
import { createArtworkDetailsRepository } from './details';
import { parseArtworkDetails } from './details-validation';

const seed = '0x17d61f1c00e5d16c399a8e341e9feaea32b275e5426a4375394e74cc855affcc';

// Published NFT #23 fields, kept small so tests verify the contract, not remote uptime.
function metadata() {
  return {
    metadata_version: '2.0.0',
    attributes: [
      { trait_type: 'Structure', value: 'Orbit Ribbons' },
      { trait_type: 'Palette', value: 'Jade Mono' },
      { trait_type: 'Spectral Class', value: 'F' },
      { trait_type: 'Mass Balance', value: 'Equal Trio' },
      { trait_type: 'Fate', value: 'Eternal Dance' },
      { trait_type: 'Chaos', value: 17, display_type: 'number', max_value: 100 },
      { trait_type: 'Syzygies', value: 1, display_type: 'number' },
      { trait_type: 'Round', value: 0, display_type: 'number' },
    ],
    properties: {
      token_id: 23,
      seed,
      simulation: {
        integrator: 'yoshida4',
        steps: 1_000_000,
        braid: { crossings: 33 },
        masses: [141.7666122857421, 123.42091484633418, 148.542917056232],
        total_energy: -1775.023010537104,
      },
    },
  };
}

describe('published artwork details', () => {
  it('exposes only supported rendering facts for the matching artwork', () => {
    const result = parseArtworkDetails(metadata(), 23, seed);
    expect(result).toEqual({
      status: 'available',
      details: {
        tokenId: 23,
        seed,
        sourceUrl: `${ART_API_ORIGIN}/metadata/23`,
        metadataVersion: '2.0.0',
        structure: 'Orbit Ribbons',
        palette: 'Jade Mono',
        spectralClass: 'F',
        massBalance: 'Equal Trio',
        fate: 'Eternal Dance',
        chaos: 17,
        syzygies: 1,
        integrator: 'yoshida4',
        simulationSteps: 1_000_000,
        braidCrossings: 33,
      },
    });
    // Simulation masses/energy carry no physical-unit contract and stay out of the UI.
    expect(result.details).not.toHaveProperty('masses');
    expect(result.details).not.toHaveProperty('total_energy');
  });

  it('matches case-normalized seeds without changing their numerical representation', () => {
    const document = metadata();
    document.properties.seed = seed.slice(2).toUpperCase();
    expect(parseArtworkDetails(document, 23, seed).status).toBe('available');
    document.properties.seed = '0x0123';
    expect(parseArtworkDetails(document, 23, '0x123').status).toBe('unavailable');
  });

  it.each([
    ['wrong token', { ...metadata(), properties: { ...metadata().properties, token_id: 31 } }],
    ['wrong seed', { ...metadata(), properties: { ...metadata().properties, seed: '0xbeef' } }],
    ['string token', { ...metadata(), properties: { ...metadata().properties, token_id: '23' } }],
    ['missing identity', { attributes: metadata().attributes }],
    ['missing seed', { properties: { token_id: 23 } }],
    ['wrong envelope', { data: metadata() }],
    ['oversized attributes', { ...metadata(), attributes: Array.from({ length: 65 }, () => ({})) }],
    ['non-array attributes', { ...metadata(), attributes: {} }],
  ])('rejects %s rather than attaching unsupported facts', (_name, document) => {
    expect(parseArtworkDetails(document, 23, seed)).toEqual({
      status: 'unavailable',
      details: null,
    });
  });

  it.each([undefined, '', 'invalid', '0x', '0x' + 'f'.repeat(65)])(
    'requires a valid expected seed (%s)',
    (expected) => {
      expect(parseArtworkDetails(metadata(), 23, expected).status).toBe('unavailable');
    },
  );

  it('distinguishes a valid document awaiting rendering traits from a failed read', () => {
    expect(parseArtworkDetails({ properties: { token_id: 23, seed } }, 23, seed)).toMatchObject({
      status: 'pending',
      details: { tokenId: 23, seed },
    });
    expect(
      parseArtworkDetails(
        { attributes: [{ trait_type: 'Round', value: 0 }], properties: { token_id: 23, seed } },
        23,
        seed,
      ).status,
    ).toBe('pending');
  });

  it('does not render ambiguous, control-bearing, or overlong trait values', () => {
    const document = metadata();
    document.attributes = [
      { trait_type: 'Structure', value: 'Orbit Ribbons' },
      { trait_type: 'Structure', value: 'Triangle Web' },
      { trait_type: 'Palette', value: 'Jade\u202e Mono' },
      { trait_type: 'Spectral Class', value: 'x'.repeat(121) },
      { trait_type: 'Mass Balance', value: '' },
      { trait_type: 'Fate', value: 'Eternal\nDance' },
    ];
    const result = parseArtworkDetails(document, 23, seed);
    for (const key of ['structure', 'palette', 'spectralClass', 'massBalance', 'fate'])
      expect(result.details).not.toHaveProperty(key);
  });

  it.each([-1, 100.01, 101, '17', null, Infinity, NaN])(
    'rejects an invalid chaos index (%s)',
    (value) => {
      const document = { ...metadata(), attributes: [{ trait_type: 'Chaos', value }] };
      expect(parseArtworkDetails(document, 23, seed).details).not.toHaveProperty('chaos');
    },
  );

  it('keeps valid zero values and strips unknown traits, URLs, and prose', () => {
    const document = {
      ...metadata(),
      attributes: [
        { trait_type: 'Chaos', value: 0 },
        { trait_type: 'Syzygies', value: 0 },
        { trait_type: 'Unknown trait', value: 'Unverified claim' },
        'not a trait',
        null,
      ],
      external_url: 'javascript:alert(1)',
      image: 'https://example.com/wrong-art.jpg',
      description: 'An unrelated claim.',
    };
    const result = parseArtworkDetails(document, 23, seed);
    expect(result.details).toMatchObject({ chaos: 0, syzygies: 0 });
    expect(result.details).not.toHaveProperty('description');
    expect(result.details?.sourceUrl).toBe(`${ART_API_ORIGIN}/metadata/23`);
  });

  it('keeps simulation facts independently optional and finite', () => {
    const document = {
      ...metadata(),
      metadata_version: 2,
      properties: {
        token_id: 23,
        seed,
        simulation: { steps: 0, integrator: null, braid: { crossings: -1 } },
      },
    };
    expect(parseArtworkDetails(document, 23, seed).details).toMatchObject({
      metadataVersion: undefined,
      integrator: undefined,
      simulationSteps: undefined,
      braidCrossings: undefined,
    });
    for (const simulation of [null, [], 'invalid', { braid: 'invalid' }]) {
      expect(
        parseArtworkDetails(
          { ...metadata(), properties: { token_id: 23, seed, simulation } },
          23,
          seed,
        ).details,
      ).toMatchObject({
        integrator: undefined,
        simulationSteps: undefined,
        braidCrossings: undefined,
      });
    }
  });
});

describe('artwork details repository', () => {
  it('fetches a bounded, fixed-origin metadata URL with explicit caching', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(metadata()));
    const repository = createArtworkDetailsRepository({ fetch: fetcher });
    expect((await repository.getArtworkDetails('23', seed)).status).toBe('available');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${ART_API_ORIGIN}/metadata/23`, {
      signal: expect.any(AbortSignal),
      redirect: 'error',
      headers: { Accept: 'application/json' },
      next: { revalidate: MEDIA_REVALIDATE_SECONDS, tags: ['art-collection'] },
    });
  });

  it('does not fetch when the artwork identity cannot be verified', async () => {
    const fetcher = vi.fn();
    const repository = createArtworkDetailsRepository({ fetch: fetcher });
    for (const input of [-1, Infinity, '23/../../other', '1e3'])
      expect(await repository.getArtworkDetails(input, seed)).toEqual({
        status: 'unavailable',
        details: null,
      });
    for (const invalidSeed of [undefined, '0x', '0xunsafe'])
      expect(await repository.getArtworkDetails(23, invalidSeed as `0x${string}`)).toEqual({
        status: 'unavailable',
        details: null,
      });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([404, 500])(
    'marks HTTP %s as unavailable without erasing the artwork',
    async (status) => {
      const repository = createArtworkDetailsRepository({
        fetch: vi.fn().mockResolvedValue(Response.json({ error: 'not available' }, { status })),
      });
      expect(await repository.getArtworkDetails(23, seed)).toEqual({
        status: 'unavailable',
        details: null,
      });
    },
  );

  it('handles network and JSON failures without fabricated fallback traits', async () => {
    for (const fetcher of [
      vi.fn().mockRejectedValue(new Error('offline')),
      vi.fn().mockResolvedValue(new Response('not json')),
    ])
      expect(
        await createArtworkDetailsRepository({ fetch: fetcher }).getArtworkDetails(23, seed),
      ).toEqual({ status: 'unavailable', details: null });
  });
});
