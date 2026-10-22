export const ART_API_ORIGIN = 'https://a1.cosmicsignature.com';
export const ART_MEDIA_ORIGINS = [
  ART_API_ORIGIN,
  'https://a2.cosmicsignature.com',
  'https://nfts.cosmicsignature.com',
] as const;
export const ART_WIDTH = 3456;
export const ART_HEIGHT = 2234;
export const ART_ASPECT_RATIO = ART_WIDTH / ART_HEIGHT;
export const ART_REQUEST_TIMEOUT_MS = 5_000;
export const ART_REVALIDATE_SECONDS = 60;
export const MEDIA_REVALIDATE_SECONDS = 300;
export const MAX_COLLECTION_LIMIT = 48;

export function seedPackageUrl(seed: `0x${string}`, path: string): string {
  return `${ART_API_ORIGIN}/images/new/cosmicsignature/${seed}/${path}`;
}
