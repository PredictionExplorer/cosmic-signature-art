import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { keccak256, type Abi, type Hex } from 'viem';

const address = z
  .templateLiteral(['0x', z.string()])
  .refine((value) => /^0x[\da-f]{40}$/i.test(value));
const fixtureSchema = z.object({
  rpcUrl: z.literal('http://127.0.0.1:8548'),
  chainId: z.literal(31337),
  auctionAddress: address,
  codeHash: z
    .string()
    .regex(/^0x[\da-f]{64}$/i)
    .transform((value) => value as Hex),
  gameAddress: address,
  nftAddress: address,
  tokenId: z.number().int().nonnegative().safe(),
  accounts: z.array(address).min(5),
  eligibleAt: z.string().regex(/^\d+$/),
  snapshotId: z.string().regex(/^0x[\da-f]+$/i),
  gameAbi: z.array(z.unknown()),
  nftAbi: z.array(z.unknown()),
  auctionAbi: z.array(z.unknown()),
  actorAddress: address,
  evidence: z.object({
    game: z.string(),
    issuanceTransaction: z.string().regex(/^0x[\da-f]{64}$/i),
    sourceCycle: z.string().regex(/^\d+$/),
    finalizationBlock: z.number().int().nonnegative(),
    auctionNfts: z.literal(8),
    arbitrumPrecompiles: z.string(),
  }),
});

export type LocalAuctionFixture = Omit<
  z.infer<typeof fixtureSchema>,
  'gameAbi' | 'nftAbi' | 'auctionAbi'
> & { gameAbi: Abi; nftAbi: Abi; auctionAbi: Abi };

export async function readLocalAuctionFixture(): Promise<LocalAuctionFixture> {
  const path = process.env.ART_AUCTION_REHEARSAL_FILE;
  if (!path) throw new Error('Run the owned local rehearsal with npm run test:auction:local');
  return fixtureSchema.parse(JSON.parse(await readFile(path, 'utf8'))) as LocalAuctionFixture;
}

export async function localAuctionRpc<T = unknown>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const { rpcUrl } = await readLocalAuctionFixture();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Local RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message);
  return payload.result as T;
}

/** Tests are serialized: reverting consumes the snapshot, so preserve its replacement for the next browser. */
export async function resetLocalAuctionFixture(): Promise<LocalAuctionFixture> {
  const fixture = await readLocalAuctionFixture();
  const [chain, implementation, runtime] = await Promise.all([
    localAuctionRpc('eth_chainId'),
    localAuctionRpc<string>('web3_clientVersion'),
    localAuctionRpc<Hex>('eth_getCode', [fixture.auctionAddress, 'latest']),
  ]);
  if (
    chain !== '0x7a69' ||
    !implementation.startsWith('HardhatNetwork/') ||
    keccak256(runtime) !== fixture.codeHash
  )
    throw new Error('The owned local rehearsal node no longer matches its deployment');
  if (!(await localAuctionRpc('evm_revert', [fixture.snapshotId])))
    throw new Error('The rehearsal snapshot is unavailable; restart the owned runner');
  fixture.snapshotId = await localAuctionRpc<string>('evm_snapshot');
  await writeFile(process.env.ART_AUCTION_REHEARSAL_FILE!, JSON.stringify(fixture, null, 2));
  return fixture;
}
