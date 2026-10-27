import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { KeySheet } from './key-sheet';
import { closeSheet, openSheet } from './sheets-store';

beforeEach(() => {
  act(() => closeSheet());
  // jsdom has no dialog implementation; the sheet calls what the platform provides.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('key sheet', () => {
  it('lists every key in the visitor’s language and closes from its Close word and on cancel', () => {
    render(<KeySheet t={en} />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).not.toHaveAttribute('open');
    act(() => openSheet('keys'));
    expect(dialog).toHaveAttribute('open');
    for (const meaning of [en.keyPlay, en.keyExpressions, en.keyJump, en.keyIndex, en.keyHelp]) {
      expect(screen.getByText(meaning)).toBeInTheDocument();
    }
    expect(screen.getByText('I L')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.close }));
    expect(dialog).not.toHaveAttribute('open');
    act(() => openSheet('keys'));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).not.toHaveAttribute('open');
  });
});
