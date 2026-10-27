import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { en } from '@/lib/i18n/en';
import type { Activity } from '@/lib/auction/activity';

const mocks = vi.hoisted(() => ({ readActivity: vi.fn() }));
vi.mock('@/lib/auction/activity', () => ({ readActivity: mocks.readActivity }));

import { YourActivity } from './your-activity';
import { MotionProvider } from './motion-provider';
import { stubDialog, stubMatchMedia } from '../../tests/dialog-support';

const account = '0x2222222222222222222222222222222222222222';
const activity: Activity = {
  account,
  blockTime: 500n,
  ids: [64, 65, 66, 67],
  leading: [{ tokenId: 64, amount: parseEther('0.4') }],
  won: [
    { tokenId: 66, amount: parseEther('2'), delivered: false },
    { tokenId: 67, amount: parseEther('3'), delivered: true },
  ],
  held: [67],
  committed: parseEther('0.4'),
  refundable: parseEther('0.25'),
};
function Sheet({ open = true }: { open?: boolean }) {
  return (
    <MotionProvider>
      <YourActivity open={open} onClose={() => {}} t={en} locale="en" scope={{ page: 0 }} />
    </MotionProvider>
  );
}
beforeEach(() => {
  mocks.readActivity.mockReset();
  stubDialog();
  stubMatchMedia();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('your activity', () => {
  it("reads a typed wallet's leading bids, credit, wins and holdings without sending anything", async () => {
    mocks.readActivity.mockResolvedValue(activity);
    render(<Sheet />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(en.activityAddress), account);
    await user.click(screen.getByRole('button', { name: en.activityLookUp }));
    expect(await screen.findByText('Activity of 0x2222…2222')).toBeVisible();
    expect(mocks.readActivity).toHaveBeenCalledWith(account, { page: 0 });
    const facts = screen.getByRole('region', { name: 'Activity of 0x2222…2222' });
    expect(facts).toHaveTextContent('№ 064 · 0.4 ETH');
    expect(facts).toHaveTextContent('Committed0.4 ETH');
    expect(facts).toHaveTextContent('Refundable credit0.25 ETH');
    expect(facts).toHaveTextContent('№ 066 · 2 ETH');
    expect(screen.getByRole('link', { name: '№ 067' })).toHaveAttribute('href', '/auctions/67');
  });

  it('refuses a malformed address and reports an unreadable chain', async () => {
    render(<Sheet />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(en.activityAddress), '0x12');
    await user.click(screen.getByRole('button', { name: en.activityLookUp }));
    expect(screen.getByRole('status')).toHaveTextContent(en.invalidAddress);
    expect(mocks.readActivity).not.toHaveBeenCalled();
    mocks.readActivity.mockRejectedValue(new Error('outage'));
    await user.clear(screen.getByLabelText(en.activityAddress));
    await user.type(screen.getByLabelText(en.activityAddress), account);
    await user.click(screen.getByRole('button', { name: en.activityLookUp }));
    expect(await screen.findByText(en.activityUnavailable)).toBeVisible();
  });

  it('asks an announced wallet only for its accounts', async () => {
    mocks.readActivity.mockResolvedValue({ ...activity, leading: [], won: [], held: [] });
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') return [account];
      throw new Error(`forbidden ${method}`);
    });
    window.addEventListener('eip6963:requestProvider', () =>
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'test', name: 'Test wallet' }, provider: { request } },
        }),
      ),
    );
    render(<Sheet />);
    const wallet = await screen.findByRole('button', {
      name: `${en.activityUseWallet} · Test wallet`,
    });
    await act(async () => {
      fireEvent.click(wallet);
    });
    expect(await screen.findByText('Activity of 0x2222…2222')).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(screen.getAllByText(en.activityNone)).toHaveLength(3);
  });
});
