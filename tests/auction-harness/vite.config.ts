import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = fileURLToPath(new URL('../../src', import.meta.url));
export default defineConfig({
  root: directory,
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  plugins: [
    react(),
    {
      name: 'local-authentic-art-fixtures',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const match = request.url?.match(/^\/api\/art\/(\d+)$/);
          if (!match) {
            next();
            return;
          }
          // This middleware serves only the repository's existing verified archive.
          // It performs no fetches and creates no new token or media identity.
          const catalog = await server.ssrLoadModule(`${source}/lib/art/catalog.ts`);
          const previews = await server.ssrLoadModule(`${source}/lib/art/collection-previews.ts`);
          const work = catalog.getCuratedArtwork(Number(match[1]));
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              artwork: work
                ? { ...work, media: previews.withCollectionPreviews(work, work.media) }
                : null,
              status: work ? 'found' : 'unavailable',
              source: 'curated-fallback',
            }),
          );
        });
      },
    },
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: [
      { find: '@/lib/auction/client', replacement: `${directory}client.ts` },
      { find: '@/lib/auction/config', replacement: `${directory}config.ts` },
      { find: 'next/link', replacement: `${directory}link.tsx` },
      { find: 'next/navigation', replacement: `${directory}navigation.ts` },
      { find: 'next/image', replacement: `${directory}image.tsx` },
      { find: '@', replacement: source },
    ],
  },
  server: { host: '127.0.0.1', port: 4320, strictPort: true },
});
