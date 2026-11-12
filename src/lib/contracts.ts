/**
 * The two contracts on Arbitrum One that every work answers to: the collection's tokens, and
 * the game whose finished cycles mint them. They stand in a module of their own because the
 * sale reads them in the browser: beside the page metadata (src/lib/site.ts) they would be one
 * import away from every message catalog (src/lib/i18n/client-boundary.test.ts).
 */
export const NFT_ADDRESS = '0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25' as const;
export const GAME_ADDRESS = '0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2' as const;
