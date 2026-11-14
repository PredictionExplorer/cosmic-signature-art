// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeErrorResult, parseAbi, type Address } from 'viem';
import { publicClient } from './client';
import { rpcUrl } from './config';

/*
  The sale's reading client, as it is made (client.test.ts doubles it; this file does not).
  An RPC that answers a call with a revert asking for an off-chain lookup (EIP-3668) names the
  addresses to fetch next. The venue's client must not go to them.
*/

const AUCTION = '0x1111111111111111111111111111111111111111' as Address;
const ELSEWHERE = 'https://elsewhere.example/{sender}/{data}.json';
/** The revert a hostile RPC would answer with: look this up at an address of my choosing. */
const lookup = encodeErrorResult({
  abi: parseAbi([
    'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
  ]),
  errorName: 'OffchainLookup',
  args: [AUCTION, [ELSEWHERE], '0x1234', '0x12345678', '0x'],
});

let asked: string[] = [];
beforeEach(() => {
  asked = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      asked.push(url);
      if (!url.startsWith(rpcUrl)) return new Response('{}', { status: 200 });
      const sent = JSON.parse(String(init?.body)) as { id: number } | { id: number }[];
      const answer = (one: { id: number }) => ({
        jsonrpc: '2.0',
        id: one.id,
        error: { code: 3, message: 'execution reverted', data: lookup },
      });
      return new Response(JSON.stringify(Array.isArray(sent) ? sent.map(answer) : answer(sent)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('the sale’s reading client', () => {
  it('follows no off-chain lookup an RPC answer asks for', async () => {
    await expect(publicClient.call({ to: AUCTION, data: '0x1234' })).rejects.toThrow();
    // The RPC was asked, and no other address was.
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((url) => !url.startsWith(rpcUrl))).toEqual([]);
  });
});
