import { ART_API_ORIGIN, ART_REQUEST_TIMEOUT_MS, ART_REVALIDATE_SECONDS } from './constants';

type FetchOptions = RequestInit & { next?: { revalidate: number; tags: string[] } };
export type ArtFetchLike = (url: string, options?: FetchOptions) => Promise<Response>;
export const MAX_ART_RESPONSE_BYTES = 2 * 1024 * 1024;

export class ArtReadError extends Error {
  constructor(readonly notFound = false) {
    super('Art source unavailable');
  }
}

function abortable<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) return Promise.reject(new ArtReadError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ArtReadError());
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const size = Number(response.headers.get('content-length'));
  if (size > MAX_ART_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new ArtReadError();
  }
  if (!response.body) throw new ArtReadError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await abortable(reader.read(), signal);
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_ART_RESPONSE_BYTES) throw new ArtReadError();
      chunks.push(result.value);
    }
  } catch (error) {
    // Do not wait for a hostile/failed underlying stream's cancellation callback.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as unknown;
}

/** A single bounded, same-origin JSON transport for every indexed art read. */
export function createArtRequest(config: { fetch?: ArtFetchLike; timeoutMs?: number } = {}) {
  const fetcher: ArtFetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = config.timeoutMs ?? ART_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new RangeError('Invalid art read deadline');

  return async function request(
    pathOrUrl: string,
    revalidate = ART_REVALIDATE_SECONDS,
  ): Promise<unknown> {
    const url = new URL(pathOrUrl, ART_API_ORIGIN);
    // A manifest, query parameter, or upstream cursor can never redirect this transport.
    if (url.origin !== ART_API_ORIGIN || url.username || url.password || url.hash)
      throw new ArtReadError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await abortable(
        fetcher(url.href, {
          signal: controller.signal,
          redirect: 'error',
          headers: { Accept: 'application/json' },
          next: { revalidate, tags: ['art-collection'] },
        }),
        controller.signal,
      );
      const data = await boundedJson(response, controller.signal);
      if (!response.ok) {
        const legacyNotFound =
          data !== null &&
          typeof data === 'object' &&
          'error' in data &&
          data.error === 'record not found';
        throw new ArtReadError(
          (response.status === 400 || response.status === 404) && legacyNotFound,
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  };
}
