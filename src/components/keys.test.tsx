import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardVocabulary, inField } from './keys';
import { closeSheet, useOpenSheet } from './sheets-store';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function Probe() {
  const sheet = useOpenSheet();
  return (
    <>
      <output data-testid="sheet">{sheet ?? 'none'}</output>
      <input aria-label="search" />
      <div data-keys-suppressed="">
        <button type="button">bid</button>
      </div>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  act(() => closeSheet());
});
afterEach(() => vi.useRealTimers());

describe('keyboard vocabulary', () => {
  it('opens the Index on slash, toggles the keys on question mark, and jumps on digits then Enter', () => {
    render(
      <>
        <KeyboardVocabulary locale="ja" />
        <Probe />
      </>,
    );
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByTestId('sheet')).toHaveTextContent('index');
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('sheet')).toHaveTextContent('keys');
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/ja/art/31');
    // A run of digits is forgotten after a pause, and Enter alone goes nowhere.
    fireEvent.keyDown(window, { key: '7' });
    act(() => vi.advanceTimersByTime(3100));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(push).toHaveBeenCalledTimes(1);
    // Escape clears a half-typed number.
    fireEvent.keyDown(window, { key: '7' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('is silent while focus is in a field, a suppressed region, or with a modifier held', () => {
    render(
      <>
        <KeyboardVocabulary locale="en" />
        <Probe />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'search' });
    fireEvent.keyDown(field, { key: '/' });
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
    fireEvent.keyDown(screen.getByRole('button', { name: 'bid' }), { key: '?' });
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
    expect(inField(null)).toBe(false);
    expect(inField(field)).toBe(true);
    expect(inField(document.body)).toBe(false);
  });
});
