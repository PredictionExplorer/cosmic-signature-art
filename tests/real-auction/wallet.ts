import type { EIP1193Provider, Address } from 'viem';
const allowed = new Set([
  'eth_chainId',
  'eth_sendTransaction',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_getBlockByNumber',
  'eth_feeHistory',
]);
let requestId = 0;
export const submitted: Array<{ from: string; to: string; value?: string; data?: string }> = [];
export function localProvider(account: Address): EIP1193Provider {
  return {
    on: () => undefined,
    removeListener: () => undefined,
    async request({ method, params }: { method: string; params?: readonly unknown[] }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
      if (!allowed.has(method)) throw new Error(`Local rehearsal wallet forbids ${method}`);
      if (method === 'eth_sendTransaction') {
        const transaction = params?.[0] as (typeof submitted)[number] | undefined;
        if (
          transaction?.from?.toLowerCase() !== account.toLowerCase() ||
          transaction?.to?.toLowerCase() !== __LOCAL_AUCTION__.auctionAddress.toLowerCase()
        )
          throw new Error('Wallet account or destination mismatch');
        submitted.push(transaction);
      }
      const response = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params: params ?? [] }),
      });
      const body = await response.json();
      if (body.error) throw Object.assign(new Error(body.error.message), body.error);
      return body.result;
    },
  } as EIP1193Provider;
}
