import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';

vi.mock('./motion-provider', async (importOriginal) => {
  const original = await importOriginal<typeof import('./motion-provider')>();
  return {
    ...original,
    setTheatre: vi.fn((value: 'playing' | 'hushed') => original.setTheatre(value)),
  };
});

import { AuctionSheet } from './auction-sheet';
import { MotionProvider, setTheatre } from './motion-provider';
import { stubDialog, stubMatchMedia } from '../../tests/dialog-support';

beforeEach(() => {
  stubDialog();
  stubMatchMedia();
});

function Sheet({
  open,
  hush = false,
  onClose,
}: {
  open: boolean;
  hush?: boolean;
  onClose: () => void;
}) {
  return (
    <MotionProvider>
      <button type="button">opener</button>
      <AuctionSheet
        open={open}
        onClose={onClose}
        label="№ 031 · The bid sheet"
        closeLabel={en.close}
        handleLabel={en.sheetHandle}
        hush={hush}
      >
        <p>inside</p>
      </AuctionSheet>
    </MotionProvider>
  );
}

afterEach(() => {
  vi.mocked(setTheatre).mockClear();
  setTheatre('playing');
  vi.unstubAllGlobals();
});

describe('the auction sheet', () => {
  it('opens as a modal that silences the keys, hushes the theatre and hands it back on close', () => {
    const onClose = vi.fn();
    const view = render(<Sheet open hush onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: '№ 031 · The bid sheet' });
    expect(dialog).toHaveAttribute('data-keys-suppressed', '');
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('inside')).toBeVisible();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(setTheatre).toHaveBeenCalledWith('hushed');
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'hushed');
    // The panel's own review may hand the theatre back; an open sheet re-asserts the hush.
    setTheatre('playing');
    view.rerender(<Sheet open hush onClose={onClose} />);
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'hushed');
    view.rerender(<Sheet open={false} hush onClose={onClose} />);
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'playing');
    expect(screen.queryByText('inside')).toBeNull();
  });

  it('closes on Escape, on the handle, on the word and on the backdrop, never from inside', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: en.sheetHandle }));
    fireEvent.click(screen.getByRole('button', { name: en.close }));
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByText('inside'));
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(4);
    // An activity sheet lets the art move: no hush.
    expect(document.querySelector('.site')).toHaveAttribute('data-theatre', 'playing');
  });

  it('returns focus to the word that opened it', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const ref = { current: opener };
    const view = render(
      <MotionProvider>
        <AuctionSheet
          open
          onClose={onClose}
          returnFocusRef={ref}
          label="sheet"
          closeLabel={en.close}
          handleLabel={en.sheetHandle}
        >
          <p>inside</p>
        </AuctionSheet>
      </MotionProvider>,
    );
    view.rerender(
      <MotionProvider>
        <AuctionSheet
          open={false}
          onClose={onClose}
          returnFocusRef={ref}
          label="sheet"
          closeLabel={en.close}
          handleLabel={en.sheetHandle}
        >
          <p>inside</p>
        </AuctionSheet>
      </MotionProvider>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
