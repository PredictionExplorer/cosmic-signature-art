import type { MetadataRoute } from 'next';
/** Installed, the venue opens on the night ground; the paper tint belongs to the browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cosmic Signature',
    short_name: 'Cosmic Signature',
    description: 'Three bodies. A field of ink. A living collection of generative art.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#f1ebdf',
    icons: [
      { src: '/icons/mark-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/mark-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/mark-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
