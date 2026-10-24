import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { Rehearsal } from './types.ts';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = fileURLToPath(new URL('../../src', import.meta.url));
const fixtureFile = process.env.ART_AUCTION_REHEARSAL_FILE;
if (!fixtureFile) throw new Error('An owned local rehearsal fixture is required');
const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8')) as Rehearsal;
const endpoint = new URL(fixture.rpcUrl);
if (
  fixture.chainId !== 31337 ||
  endpoint.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
  endpoint.port !== '8548'
)
  throw new Error('Real browser rehearsal permits only its disposable loopback node on8548');
const reads = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getCode',
  'eth_call',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBalance',
]);
type Request = { id?: number; method?: string; params?: unknown[] };
function permitted(value: Request) {
  if (reads.has(value.method ?? '')) return true;
  if (value.method !== 'eth_sendTransaction' || !Array.isArray(value.params)) return false;
  const transaction = value.params[0] as { from?: string; to?: string } | undefined;
  return (
    typeof transaction?.from === 'string' &&
    typeof transaction.to === 'string' &&
    fixture.accounts.some((account) => account.toLowerCase() === transaction.from!.toLowerCase()) &&
    transaction.to.toLowerCase() === fixture.auctionAddress.toLowerCase()
  );
}
export default defineConfig({
  root: directory,
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'real-rehearsal-network-identities',
      enforce: 'pre',
      async resolveId(request, importer) {
        if (
          request !== '../site' &&
          request !== '@/lib/site' &&
          request !== `${source}/lib/site.ts`
        )
          return null;
        const resolved = await this.resolve(request, importer, { skipSelf: true });
        return resolved?.id.split('?')[0] === `${source}/lib/site.ts`
          ? `${directory}identity.ts`
          : null;
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== '/rpc') {
            next();
            return;
          }
          response.setHeader('Content-Type', 'application/json');
          try {
            if (request.method !== 'POST') throw new Error('POST required');
            if (request.headers.origin !== 'http://127.0.0.1:4321')
              throw new Error('Only the rehearsal browser origin may use this gateway');
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of request) {
              bytes += chunk.length;
              if (bytes > 1_048_576) throw new Error('RPC body exceeds test limit');
              chunks.push(Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString('utf8');
            const parsed = JSON.parse(body) as Request | Request[];
            const calls = Array.isArray(parsed) ? parsed : [parsed];
            if (
              !calls.length ||
              calls.length > 100 ||
              calls.some((call) => !call || !permitted(call))
            )
              throw new Error('RPC method, account, or destination is outside this rehearsal');
            const upstream = await fetch(fixture.rpcUrl, {
              method: 'POST',
              redirect: 'error',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: AbortSignal.timeout(15_000),
            });
            response.statusCode = upstream.status;
            response.end(await upstream.text());
          } catch (error) {
            response.statusCode = 400;
            response.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32600,
                  message: error instanceof Error ? error.message : 'Invalid local request',
                },
              }),
            );
          }
        });
      },
    },
  ],
  define: {
    __LOCAL_AUCTION__: JSON.stringify({
      ...fixture,
      gameAbi: undefined,
      nftAbi: undefined,
      auctionAbi: undefined,
      snapshotId: undefined,
    }),
    'process.env': JSON.stringify({
      NEXT_PUBLIC_AUCTION_ADDRESS: fixture.auctionAddress,
      NEXT_PUBLIC_CHAIN_ID: '31337',
      NEXT_PUBLIC_RPC_URL: 'http://127.0.0.1:4321/rpc',
      NEXT_PUBLIC_AUCTION_CODE_HASH: fixture.codeHash,
    }),
  },
  resolve: {
    alias: [
      { find: 'next/link', replacement: `${directory}../auction-harness/link.tsx` },
      { find: '@', replacement: source },
    ],
  },
  server: { host: '127.0.0.1', port: 4321, strictPort: true },
});
