import type { Address, Hex } from 'viem';

export const auctionAddress = process.env.NEXT_PUBLIC_AUCTION_ADDRESS as Address | undefined;
// Address presence enables the status panel. Verification separately rejects incomplete or wrong
// deployment details, so a configured-but-unverified address does not masquerade as an inactive sale.
export const auctionConfigured =
  !!auctionAddress &&
  /^0x[0-9a-fA-F]{40}$/.test(auctionAddress) &&
  !/^0x0{40}$/i.test(auctionAddress);
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc';
export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 42161);
export const expectedCodeHash = process.env.NEXT_PUBLIC_AUCTION_CODE_HASH as Hex | undefined;
