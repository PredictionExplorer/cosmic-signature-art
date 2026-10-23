import { describe, expect, it, vi } from 'vitest';
import { ART_API_ORIGIN } from './constants';
import { ArtReadError, createArtRequest, MAX_ART_RESPONSE_BYTES } from './request';

describe('bounded art JSON transport', () => {
  it('restricts fetches and redirects to the configured art origin', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}'));
    const request = createArtRequest({ fetch: fetcher });
    for (const url of [
      'http://a1.cosmicsignature.com/test',
      'https://evil.example/test',
      '//evil.example/test',
      'https://user:secret@a1.cosmicsignature.com/test',
      '/metadata/23#fragment',
    ])
      await expect(request(url)).rejects.toThrow(ArtReadError);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(request('/metadata/23', 300)).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls[0]).toMatchObject([
      `${ART_API_ORIGIN}/metadata/23`,
      {
        redirect: 'error',
        headers: { Accept: 'application/json' },
        next: { revalidate: 300, tags: ['art-collection'] },
      },
    ]);
  });

  it('preserves explicit legacy missing-token semantics without confusing 500 with not-found', async () => {
    for (const status of [400, 404, 500]) {
      const request = createArtRequest({
        fetch: async () => new Response('{"error":"record not found"}', { status }),
      });
      await expect(request('/metadata/23')).rejects.toMatchObject({ notFound: status !== 500 });
    }
  });

  it('enforces the deadline even when a fetch implementation ignores its signal', async () => {
    const request = createArtRequest({ timeoutMs: 5, fetch: () => new Promise(() => {}) });
    await expect(request('/metadata/23')).rejects.toThrow(ArtReadError);
  });

  it('enforces the same deadline while reading a stalled response body and cancels it', async () => {
    const cancel = vi.fn();
    const request = createArtRequest({
      timeoutMs: 5,
      fetch: async () => new Response(new ReadableStream({ cancel })),
    });
    await expect(request('/metadata/23')).rejects.toThrow(ArtReadError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('never waits for a broken stream cancellation callback after exceeding the size limit', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const request = createArtRequest({
      timeoutMs: 5,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(MAX_ART_RESPONSE_BYTES + 1));
            },
            cancel,
          }),
        ),
    });
    await expect(request('/metadata/23')).rejects.toThrow(ArtReadError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects invalid UTF-8 rather than corrupting an authored name', async () => {
    const request = createArtRequest({
      fetch: async () => new Response(new Uint8Array([0x22, 0xff, 0x22])),
    });
    await expect(request('/metadata/23')).rejects.toThrow();
  });

  it('rejects an empty response, malformed JSON, and an invalid deadline', async () => {
    await expect(
      createArtRequest({ fetch: async () => new Response(null) })('/metadata/23'),
    ).rejects.toThrow();
    await expect(
      createArtRequest({ fetch: async () => new Response('{') })('/metadata/23'),
    ).rejects.toThrow();
    expect(() => createArtRequest({ timeoutMs: 0 })).toThrow(RangeError);
  });
});
