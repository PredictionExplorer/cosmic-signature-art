import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeFunctionData,
  encodeFunctionData,
  keccak256,
  zeroAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { auctionAbi } from './abi';
import { GAME_ADDRESS, NFT_ADDRESS } from '../site';
import { MINIMUM_BID, type AuctionRecord } from './rules';

const mocks = vi.hoisted(() => ({
  public: {
    getChainId: vi.fn(),
    readContract: vi.fn(),
    getCode: vi.fn(),
    getBlock: vi.fn(),
    call: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
  },
  wallet: { getAddresses: vi.fn(), getChainId: vi.fn(), sendTransaction: vi.fn() },
}));
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: vi.fn(() => mocks.public),
  createWalletClient: vi.fn(() => mocks.wallet),
}));

const AUCTION = '0x1111111111111111111111111111111111111111' as Address;
const ACCOUNT = '0x2222222222222222222222222222222222222222' as Address;
const OTHER = '0x3333333333333333333333333333333333333333' as Address;
const HASH = `0x${'a'.repeat(64)}` as Hex;
const REPLACEMENT_HASH = `0x${'b'.repeat(64)}` as Hex;
const CODE = '0x60006000' as Hex;
const BLOCK_TIME = 1_800_000_000n;
const BLOCK = 123456n;
let lot: AuctionRecord;
let firstToken = 100n;
let batchCount = 2n;
let game: Address = GAME_ADDRESS;
let nft: Address = NFT_ADDRESS;
const provider = {
  request: vi.fn(),
  on: () => undefined,
  removeListener: () => undefined,
} as EIP1193Provider;

function expectedTransaction(overrides: Record<string, unknown> = {}) {
  const request = mocks.wallet.sendTransaction.mock.calls.at(-1)?.[0];
  return {
    hash: HASH,
    from: ACCOUNT,
    to: AUCTION,
    input: request?.data,
    value: request?.value,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const method of Object.values(mocks.public)) method.mockReset();
  for (const method of Object.values(mocks.wallet)) method.mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(Number(BLOCK_TIME) * 1000);
  vi.stubEnv('NEXT_PUBLIC_AUCTION_ADDRESS', AUCTION);
  vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '42161');
  vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', keccak256(CODE));
  vi.stubEnv('NEXT_PUBLIC_RPC_URL', 'https://rpc.invalid.example');
  firstToken = 100n;
  batchCount = 2n;
  game = GAME_ADDRESS;
  nft = NFT_ADDRESS;
  lot = {
    roundNum: 10n,
    eligibleAt: BLOCK_TIME - 1n,
    endAt: 0n,
    highestBidder: zeroAddress,
    highestBid: 0n,
    registered: true,
    settled: false,
    delivered: false,
    proceedsForwarded: false,
  };
  mocks.public.getChainId.mockResolvedValue(42161);
  mocks.public.getCode.mockResolvedValue(CODE);
  mocks.public.getBlock.mockResolvedValue({ number: BLOCK, timestamp: BLOCK_TIME });
  mocks.public.readContract.mockImplementation(
    async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'game':
          return game;
        case 'nft':
          return nft;
        case 'getAuction':
          return { ...lot };
        case 'minimumNextBid':
          return lot.highestBid === 0n ? MINIMUM_BID : lot.highestBid + (lot.highestBid + 9n) / 10n;
        case 'refundCredits':
          return 123n;
        case 'registeredBatchCount':
          return batchCount;
        case 'firstNftIdByBatchIndex':
          return firstToken;
        default:
          throw new Error(`Unexpected read: ${functionName}`);
      }
    },
  );
  mocks.public.call.mockResolvedValue({ data: '0x' });
  mocks.public.waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    transactionHash: HASH,
  });
  mocks.public.getTransaction.mockImplementation(async () => expectedTransaction());
  mocks.wallet.getAddresses.mockResolvedValue([ACCOUNT]);
  mocks.wallet.getChainId.mockResolvedValue(42161);
  mocks.wallet.sendTransaction.mockResolvedValue(HASH);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function loadClient() {
  return import('./client');
}
const bid = (total = MINIMUM_BID, expectedFunding = total) => ({
  kind: 'bid' as const,
  total,
  expectedFunding,
});

describe('auction deployment and snapshot trust', () => {
  it('keeps a configured address visible but refuses production actions without its code hash', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', '');
    expect((await import('./config')).auctionConfigured).toBe(true);
    const client = await loadClient();
    await expect(client.verifyDeployment()).rejects.toBeInstanceOf(
      client.AuctionConfigurationError,
    );
    expect(mocks.public.readContract).not.toHaveBeenCalled();
  });

  it.each(['', zeroAddress, '0x12'])(
    'rejects an absent or invalid auction address %j',
    async (address) => {
      vi.stubEnv('NEXT_PUBLIC_AUCTION_ADDRESS', address);
      const client = await loadClient();
      await expect(client.verifyDeployment()).rejects.toBeInstanceOf(
        client.AuctionConfigurationError,
      );
    },
  );

  it('pins reads and code verification to the same block', async () => {
    const client = await loadClient();
    const snapshot = await client.readAuction(100, ACCOUNT);
    expect(snapshot).toMatchObject({ blockNumber: BLOCK, blockTime: BLOCK_TIME, refund: 123n });
    for (const [request] of mocks.public.readContract.mock.calls)
      expect(request.blockNumber).toBe(BLOCK);
    expect(mocks.public.getCode).toHaveBeenCalledWith({ address: AUCTION, blockNumber: BLOCK });
    expect(
      mocks.public.readContract.mock.calls.find(
        ([request]) => request.functionName === 'getAuction',
      )?.[0].args,
    ).toEqual([100n]);
  });

  it.each([
    'network',
    'game',
    'nft',
    'empty-code',
    'wrong-code',
    'malformed-hash',
    'unsupported-network',
  ])('fails closed for %s mismatch', async (mismatch) => {
    if (mismatch === 'network') mocks.public.getChainId.mockResolvedValue(1);
    if (mismatch === 'game') game = OTHER;
    if (mismatch === 'nft') nft = OTHER;
    if (mismatch === 'empty-code') mocks.public.getCode.mockResolvedValue('0x');
    if (mismatch === 'wrong-code') mocks.public.getCode.mockResolvedValue('0x6001');
    if (mismatch === 'malformed-hash') vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', '0x123');
    if (mismatch === 'unsupported-network') vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '1');
    const client = await loadClient();
    await expect(client.verifyDeployment()).rejects.toBeInstanceOf(
      client.AuctionConfigurationError,
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('reads all eight batch lots against one verified block without fabricated prices', async () => {
    const originalRead = mocks.public.readContract.getMockImplementation()!;
    mocks.public.readContract.mockImplementation(async (request) =>
      request.functionName === 'getAuction'
        ? { ...lot, highestBid: request.args[0] * MINIMUM_BID }
        : originalRead(request),
    );
    const client = await loadClient();
    const batch = await client.readBatch(0);
    expect(batch.blockTime).toBe(BLOCK_TIME);
    expect(batch.lots).toHaveLength(8);
    expect(batch.lots.map((item) => item.tokenId)).toEqual(batch.ids);
    expect(batch.lots.map((item) => item.lot.highestBid)).toEqual(
      batch.ids.map((id) => BigInt(id) * MINIMUM_BID),
    );
    expect(batch.lots.every((item) => item.lot.registered)).toBe(true);
    const lotReads = mocks.public.readContract.mock.calls.filter(
      ([request]) => request.functionName === 'getAuction',
    );
    expect(lotReads).toHaveLength(8);
    expect(lotReads.map(([request]) => request.args[0])).toEqual(batch.ids.map(BigInt));
    for (const [request] of mocks.public.readContract.mock.calls)
      expect(request.blockNumber).toBe(BLOCK);
  });

  it('permits an explicitly configured local rehearsal while retaining production collection identities', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '31337');
    vi.stubEnv('NEXT_PUBLIC_AUCTION_CODE_HASH', '');
    mocks.public.getChainId.mockResolvedValue(31337);
    const client = await loadClient();
    await expect(client.verifyDeployment()).resolves.toBeUndefined();
    nft = OTHER;
    await expect(client.verifyDeployment()).rejects.toBeInstanceOf(
      client.AuctionConfigurationError,
    );
  });

  it('rejects old or future RPC blocks rather than relabeling them as freshly fetched', async () => {
    const client = await loadClient();
    for (const timestamp of [BLOCK_TIME - 121n, BLOCK_TIME + 31n]) {
      mocks.public.getBlock.mockResolvedValue({ number: BLOCK, timestamp });
      await expect(client.readAuction(100)).rejects.toBeInstanceOf(client.AuctionDataStaleError);
    }
    expect(() => client.assertBlockFresh(BLOCK_TIME - 120n)).not.toThrow();
    expect(() => client.assertBlockFresh(BLOCK_TIME + 30n)).not.toThrow();
  });

  it('rechecks age after slow reads complete', async () => {
    const client = await loadClient();
    const oldRead = mocks.public.readContract.getMockImplementation()!;
    mocks.public.readContract.mockImplementation(async (request) => {
      const result = await oldRead(request);
      if (request.functionName === 'getAuction')
        vi.mocked(Date.now).mockReturnValue(Number(BLOCK_TIME + 121n) * 1000);
      return result;
    });
    await expect(client.readAuction(100)).rejects.toBeInstanceOf(client.AuctionDataStaleError);
  });

  it('uses bounded newest-first batch enumeration and rejects unsafe numeric inputs', async () => {
    const client = await loadClient();
    expect(await client.readBatch(0)).toMatchObject({
      count: 2n,
      ids: [100, 101, 102, 103, 104, 105, 106, 107],
    });
    expect(
      mocks.public.readContract.mock.calls.find(
        ([request]) => request.functionName === 'firstNftIdByBatchIndex',
      )?.[0].args,
    ).toEqual([1n]);
    expect(await client.readBatch(2)).toEqual({
      count: 2n,
      ids: [],
      lots: [],
      blockTime: BLOCK_TIME,
    });
    for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(client.readBatch(invalid)).rejects.toThrow();
      await expect(client.readAuction(invalid)).rejects.toThrow();
    }
    firstToken = BigInt(Number.MAX_SAFE_INTEGER - 6);
    await expect(client.readBatch(0)).rejects.toThrow('Token IDs exceed UI range');
  });
});

describe('reviewed wallet actions', () => {
  it('simulates and sends exactly the entered direct offer, without automatic raising', async () => {
    const client = await loadClient();
    const total = 100n * 10n ** 18n;
    const onHash = vi.fn();
    await client.submitAction(provider, ACCOUNT, 100, bid(total), onHash);
    const simulated = mocks.public.call.mock.calls[0][0];
    const sent = mocks.wallet.sendTransaction.mock.calls[0][0];
    expect(simulated).toMatchObject({ account: ACCOUNT, to: AUCTION, value: total });
    expect(sent.data).toBe(simulated.data);
    expect(sent.value).toBe(simulated.value);
    expect(decodeFunctionData({ abi: auctionAbi, data: sent.data })).toMatchObject({
      functionName: 'bid',
      args: [100n, total],
    });
    expect(onHash).toHaveBeenCalledWith(HASH);
  });

  it('rejects a changed preferred account even when the former account stays authorized', async () => {
    mocks.wallet.getAddresses.mockResolvedValue([OTHER, ACCOUNT]);
    const client = await loadClient();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn())).rejects.toThrow(
      'Wallet state changed',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects a preferred-account switch during simulation even when both accounts remain authorized', async () => {
    mocks.wallet.getAddresses
      .mockResolvedValueOnce([ACCOUNT, OTHER])
      .mockResolvedValue([OTHER, ACCOUNT]);
    const client = await loadClient();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn())).rejects.toThrow(
      'Wallet state changed',
    );
    expect(mocks.public.call).toHaveBeenCalledOnce();
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('sends only the reviewed delta for the current leader', async () => {
    lot.highestBidder = ACCOUNT;
    lot.highestBid = MINIMUM_BID;
    const total = MINIMUM_BID * 2n;
    const client = await loadClient();
    await client.submitAction(provider, ACCOUNT, 100, bid(total, MINIMUM_BID), vi.fn());
    expect(mocks.wallet.sendTransaction.mock.calls[0][0].value).toBe(MINIMUM_BID);
  });

  it('requires another review if the user was outbid after approving a self-raise delta', async () => {
    lot.highestBidder = OTHER;
    lot.highestBid = MINIMUM_BID * 2n;
    const client = await loadClient();
    await expect(
      client.submitAction(
        provider,
        ACCOUNT,
        100,
        bid(MINIMUM_BID * 10n, MINIMUM_BID * 9n),
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(client.AuctionBidReviewChangedError);
    expect(mocks.public.call).not.toHaveBeenCalled();
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('does not silently increase a formerly valid bid when a competing offer changes the minimum', async () => {
    lot.highestBidder = OTHER;
    lot.highestBid = MINIMUM_BID * 10n;
    const client = await loadClient();
    await expect(
      client.submitAction(provider, ACCOUNT, 100, bid(MINIMUM_BID * 2n), vi.fn()),
    ).rejects.toThrow('Bid below minimum');
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(['initial-account', 'initial-network', 'late-account', 'late-network'])(
    'rejects %s changes before requesting a transaction',
    async (change) => {
      if (change === 'initial-account') mocks.wallet.getAddresses.mockResolvedValue([OTHER]);
      if (change === 'initial-network') mocks.wallet.getChainId.mockResolvedValue(1);
      if (change === 'late-account')
        mocks.wallet.getAddresses.mockResolvedValueOnce([ACCOUNT]).mockResolvedValue([OTHER]);
      if (change === 'late-network')
        mocks.wallet.getChainId.mockResolvedValueOnce(42161).mockResolvedValue(1);
      const client = await loadClient();
      await expect(client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn())).rejects.toThrow(
        'Wallet state changed',
      );
      expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it('cannot send when simulation fails, and has no media-readiness dependency', async () => {
    mocks.public.call.mockRejectedValueOnce(new Error('AuctionEnded'));
    const client = await loadClient();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn())).rejects.toThrow(
      'AuctionEnded',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
    mocks.public.call.mockResolvedValue({ data: '0x' });
    await expect(
      client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn()),
    ).resolves.toMatchObject({ status: 'success' });
  });

  it.each(['claimNft', 'withdrawRefund'] as const)(
    'sends the chosen %s recipient without any ETH',
    async (kind) => {
      const client = await loadClient();
      await client.submitAction(provider, ACCOUNT, 100, { kind, recipient: OTHER }, vi.fn());
      const sent = mocks.wallet.sendTransaction.mock.calls[0][0];
      expect(sent.value).toBe(0n);
      const expectedArgs = kind === 'claimNft' ? [100n, OTHER] : [OTHER];
      expect(decodeFunctionData({ abi: auctionAbi, data: sent.data })).toMatchObject({
        functionName: kind,
        args: expectedArgs,
      });
    },
  );

  it.each([zeroAddress, AUCTION])(
    'rejects an invalid delivery/refund destination %s',
    async (recipient) => {
      const client = await loadClient();
      for (const kind of ['claimNft', 'withdrawRefund'] as const) {
        await expect(
          client.submitAction(provider, ACCOUNT, 100, { kind, recipient }, vi.fn()),
        ).rejects.toThrow('Invalid recipient');
      }
      expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it.each(['settle', 'forwardProceeds'] as const)(
    'sends permissionless %s with the exact lot ID',
    async (kind) => {
      const client = await loadClient();
      await client.submitAction(provider, ACCOUNT, 100, { kind }, vi.fn());
      const sent = mocks.wallet.sendTransaction.mock.calls[0][0];
      expect(sent.value).toBe(0n);
      expect(decodeFunctionData({ abi: auctionAbi, data: sent.data })).toMatchObject({
        functionName: kind,
        args: [100n],
      });
    },
  );
});

describe('transaction outcomes and replacements', () => {
  it('preserves a submitted hash if receipt polling cannot determine the outcome', async () => {
    mocks.public.waitForTransactionReceipt.mockRejectedValue(new Error('RPC timeout'));
    const client = await loadClient();
    const onHash = vi.fn();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), onHash)).rejects.toMatchObject({
      transactionHash: HASH,
    });
    expect(onHash).toHaveBeenCalledWith(HASH);
    expect(mocks.wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not claim success for a reverted receipt', async () => {
    mocks.public.waitForTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      transactionHash: HASH,
    });
    const client = await loadClient();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn())).rejects.toThrow(
      'Transaction reverted',
    );
  });

  it('accepts a gas-only replacement with the same reviewed action and updates the displayed hash', async () => {
    mocks.public.waitForTransactionReceipt.mockImplementation(async ({ onReplaced }) => {
      onReplaced({
        reason: 'repriced',
        transaction: expectedTransaction({ hash: REPLACEMENT_HASH }),
      });
      return { status: 'success', transactionHash: REPLACEMENT_HASH };
    });
    mocks.public.getTransaction.mockImplementation(async () =>
      expectedTransaction({ hash: REPLACEMENT_HASH }),
    );
    const client = await loadClient();
    const onHash = vi.fn();
    await expect(client.submitAction(provider, ACCOUNT, 100, bid(), onHash)).resolves.toMatchObject(
      { transactionHash: REPLACEMENT_HASH },
    );
    expect(onHash.mock.calls.map(([hash]) => hash)).toEqual([HASH, REPLACEMENT_HASH]);
  });

  it.each(['cancelled', 'replaced'])(
    'never calls a successful %s transaction an auction success',
    async (reason) => {
      mocks.public.waitForTransactionReceipt.mockImplementation(async ({ onReplaced }) => {
        onReplaced({
          reason,
          transaction: expectedTransaction({
            hash: REPLACEMENT_HASH,
            to: ACCOUNT,
            input: '0x',
            value: 0n,
          }),
        });
        return { status: 'success', transactionHash: REPLACEMENT_HASH };
      });
      const client = await loadClient();
      await expect(
        client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn()),
      ).rejects.toBeInstanceOf(client.AuctionTransactionReplacedError);
    },
  );

  it.each(['to', 'from', 'input', 'value', 'hash'])(
    'validates confirmed transaction %s rather than trusting status alone',
    async (field) => {
      if (field === 'hash')
        mocks.public.waitForTransactionReceipt.mockResolvedValue({
          status: 'success',
          transactionHash: REPLACEMENT_HASH,
        });
      else
        mocks.public.getTransaction.mockImplementation(async () =>
          expectedTransaction({
            [field]:
              field === 'value'
                ? MINIMUM_BID * 2n
                : field === 'input'
                  ? encodeFunctionData({ abi: auctionAbi, functionName: 'settle', args: [100n] })
                  : OTHER,
          }),
        );
      const client = await loadClient();
      await expect(
        client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn()),
      ).rejects.toBeInstanceOf(client.AuctionTransactionMismatchError);
    },
  );

  it('treats an unavailable confirmed transaction body as unconfirmed rather than submitting again', async () => {
    mocks.public.getTransaction.mockRejectedValue(new Error('Not indexed yet'));
    const client = await loadClient();
    await expect(
      client.submitAction(provider, ACCOUNT, 100, bid(), vi.fn()),
    ).rejects.toBeInstanceOf(client.AuctionTransactionUnconfirmedError);
    expect(mocks.wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });
});
