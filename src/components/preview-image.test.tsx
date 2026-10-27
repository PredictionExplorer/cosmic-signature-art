import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_ATTEMPTS, PreviewImage } from './preview-image';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('preview image', () => {
  it('asks again after a failed load, with the same bytes, and gives up after the last attempt', () => {
    const failure = vi.fn();
    render(<PreviewImage src="/art/23-ink-640.webp" alt="№ 023 · Ink" onFailure={failure} />);
    const first = screen.getByRole('img', { name: '№ 023 · Ink' });
    expect(first).toHaveAttribute('data-attempt', '1');
    fireEvent.error(first);
    act(() => vi.advanceTimersByTime(1200));
    const second = screen.getByRole('img', { name: '№ 023 · Ink' });
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('src', '/art/23-ink-640.webp');
    expect(second).toHaveAttribute('data-attempt', '2');
    fireEvent.error(second);
    act(() => vi.advanceTimersByTime(2400));
    const third = screen.getByRole('img', { name: '№ 023 · Ink' });
    expect(third).toHaveAttribute('data-attempt', String(PREVIEW_ATTEMPTS));
    expect(failure).not.toHaveBeenCalled();
    fireEvent.error(third);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('img', { name: '№ 023 · Ink' })).toHaveAttribute('data-failed', '');
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('starts over when the source changes', () => {
    const { rerender } = render(<PreviewImage src="/a.webp" alt="a" />);
    fireEvent.error(screen.getByRole('img', { name: 'a' }));
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('img', { name: 'a' })).toHaveAttribute('data-attempt', '2');
    rerender(<PreviewImage src="/b.webp" alt="a" />);
    expect(screen.getByRole('img', { name: 'a' })).toHaveAttribute('data-attempt', '1');
    expect(screen.getByRole('img', { name: 'a' })).not.toHaveAttribute('data-failed');
  });
});
