import { getArtwork } from '@/lib/art/server';
import { parseArtworkId } from '@/lib/art/validation';

/** Public artwork only. This route has no signing, wallet or financial-state authority. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseArtworkId((await params).id);
  if (id === null) return Response.json({ status: 'not-found', artwork: null }, { status: 404 });
  const result = await getArtwork(id);
  const status = result.status === 'not-found' ? 404 : result.status === 'unavailable' ? 503 : 200;
  return Response.json(result, {
    status,
    headers:
      status === 200
        ? { 'Cache-Control': 'public, max-age=30, s-maxage=60' }
        : { 'Cache-Control': 'no-store' },
  });
}
