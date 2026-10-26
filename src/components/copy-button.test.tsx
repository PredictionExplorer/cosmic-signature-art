import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('copy button', () => {
  it('copies the value, says so for a moment, then returns to its word', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton value="0xabc" label="Copy" copied="Copied" />);
    const button = screen.getByRole('button', { name: 'Copy: 0xabc' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith('0xabc');
    expect(button).toHaveTextContent('Copied');
    act(() => vi.advanceTimersByTime(1300));
    expect(button).toHaveTextContent('Copy');
  });

  it('keeps its word when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CopyButton value="0xabc" label="Copy" copied="Copied" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy');
  });
});
