import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { OrbitWords, type Offered } from './orbit-words';

const t = messages('en');
const nothing = () => {};

const atTheWindow: Offered = {
  act: 'window',
  clockWord: t.play,
  onClock: nothing,
  onClosest: nothing,
  onGeneratorView: null,
  onBeyond: nothing,
  onTwin: nothing,
};
const running: Offered = {
  act: 'beyond',
  phase: 'running',
  worthIt: true,
  onFurther: nothing,
  onTell: nothing,
  onAgain: nothing,
  onLeave: nothing,
  onTwin: nothing,
};
const told: Offered = { ...running, phase: 'told' };
const besideTheTwin: Offered = {
  act: 'twin',
  onAgain: nothing,
  onBeyond: nothing,
  onLeave: nothing,
};

const word = (name: string) => screen.getByRole('button', { name });
/** The words as they stand in the row, in order. */
const words = (container: HTMLElement) =>
  [...container.querySelectorAll('button, a')].map((one) => one.textContent);

afterEach(cleanup);

describe('the words beside the line', () => {
  it('keeps a word that stays the same element from one act to the next', () => {
    const row = createRef<HTMLDivElement>();
    const { rerender } = render(<OrbitWords row={row} t={t} offered={atTheWindow} />);
    const after = word(t.afterTheFrame);
    const twin = word(t.oneInATrillion);
    // Past the frame: the two that stay are the elements they were, so a keyboard that pressed
    // After the frame still stands on it.
    rerender(<OrbitWords row={row} t={t} offered={running} />);
    expect(word(t.afterTheFrame)).toBe(after);
    expect(word(t.oneInATrillion)).toBe(twin);
    // Tell me becomes Again, in the same element: the focus that pressed it is on what took
    // its place, and back again when the performance is asked for once more.
    const tell = word(t.beyondTell);
    rerender(<OrbitWords row={row} t={t} offered={told} />);
    expect(word(t.again)).toBe(tell);
    expect(word(t.afterTheFrame)).toBe(after);
    rerender(<OrbitWords row={row} t={t} offered={running} />);
    expect(word(t.beyondTell)).toBe(tell);
    // Beside the twin, and back at the window.
    rerender(<OrbitWords row={row} t={t} offered={besideTheTwin} />);
    expect(word(t.afterTheFrame)).toBe(after);
    expect(word(t.oneInATrillion)).toBe(twin);
    rerender(<OrbitWords row={row} t={t} offered={atTheWindow} />);
    expect(word(t.afterTheFrame)).toBe(after);
    expect(word(t.oneInATrillion)).toBe(twin);
    // The row itself is handed to the section, which measures it.
    expect(row.current).toContainElement(after);
  });

  it('sets the words that come and go before the two that stay, in each act', () => {
    const row = createRef<HTMLDivElement>();
    const { container, rerender } = render(
      <OrbitWords
        row={row}
        t={t}
        offered={{ ...atTheWindow, onGeneratorView: nothing, clockWord: t.pause }}
      />,
    );
    expect(words(container)).toEqual([
      t.orbitGeneratorView,
      t.pause,
      t.toClosestApproach,
      t.afterTheFrame,
      t.oneInATrillion,
    ]);
    rerender(<OrbitWords row={row} t={t} offered={running} />);
    expect(words(container)).toEqual([
      t.beyondOnward,
      t.beyondTell,
      t.afterTheFrame,
      t.oneInATrillion,
    ]);
    rerender(<OrbitWords row={row} t={t} offered={told} />);
    expect(words(container)).toEqual([t.again, t.beyondRecord, t.afterTheFrame, t.oneInATrillion]);
    rerender(<OrbitWords row={row} t={t} offered={besideTheTwin} />);
    expect(words(container)).toEqual([t.again, t.afterTheFrame, t.oneInATrillion]);
  });

  it('says which of the two that stay is the act on view', () => {
    const row = createRef<HTMLDivElement>();
    const { rerender } = render(<OrbitWords row={row} t={t} offered={atTheWindow} />);
    expect(word(t.afterTheFrame)).toHaveAttribute('aria-pressed', 'false');
    expect(word(t.oneInATrillion)).toHaveAttribute('aria-pressed', 'false');
    rerender(<OrbitWords row={row} t={t} offered={running} />);
    expect(word(t.afterTheFrame)).toHaveAttribute('aria-pressed', 'true');
    expect(word(t.oneInATrillion)).toHaveAttribute('aria-pressed', 'false');
    rerender(<OrbitWords row={row} t={t} offered={besideTheTwin} />);
    expect(word(t.afterTheFrame)).toHaveAttribute('aria-pressed', 'false');
    expect(word(t.oneInATrillion)).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers nothing before the orbit is derived, nor in the rest after a performance', () => {
    const row = createRef<HTMLDivElement>();
    const { container, rerender } = render(<OrbitWords row={row} t={t} offered={null} />);
    expect(words(container)).toEqual([]);
    rerender(<OrbitWords row={row} t={t} offered={{ ...running, phase: 'resting' }} />);
    expect(words(container)).toEqual([]);
    // The row keeps its two groups all the while: the stylesheet gives them their rows.
    expect(row.current?.children).toHaveLength(2);
  });

  it('leaves out a word that is not offered, and dims Further on where it would save nothing', () => {
    const row = createRef<HTMLDivElement>();
    const { container, rerender } = render(
      <OrbitWords row={row} t={t} offered={{ ...atTheWindow, onBeyond: null, onTwin: null }} />,
    );
    expect(words(container)).toEqual([t.play, t.toClosestApproach]);
    rerender(<OrbitWords row={row} t={t} offered={{ ...running, worthIt: false }} />);
    expect(word(t.beyondOnward)).toHaveAttribute('aria-disabled', 'true');
    // Where nothing was performed there is nothing to perform again: the record alone.
    rerender(<OrbitWords row={row} t={t} offered={{ ...told, onAgain: null, onTwin: null }} />);
    expect(words(container)).toEqual([t.beyondRecord, t.afterTheFrame]);
  });
});
