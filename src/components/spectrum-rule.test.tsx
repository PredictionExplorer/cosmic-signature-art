import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpectrumRule, WavelengthSlider, wavelengthForKey } from './spectrum-rule';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A slider that keeps its own value, as the room does, and records each choice. */
function Held({ initial = 540, onChange }: { initial?: number; onChange?: (nm: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <WavelengthSlider
      value={value}
      min={383}
      max={697}
      dominantNm={632}
      label="Wavelength"
      valueText={`${value} nanometres`}
      onChange={(nm) => {
        onChange?.(nm);
        setValue(nm);
      }}
    />
  );
}

/** The hairline is 320 px wide from x = 100, so one pixel is one nanometre from 380 nm. */
function measureLine(slider: HTMLElement) {
  const line = slider.querySelector('i')!;
  vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 420,
    width: 320,
    top: 0,
    bottom: 1,
    height: 1,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('the spectrum rule', () => {
  it('typesets 380 to 700 nm with the dominant wavelength ticked, hidden from the reader', () => {
    const { container } = render(<SpectrumRule dominantNm={540} className="essay" />);
    const rule = container.firstElementChild as HTMLElement;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(rule).toHaveClass('essay');
    expect(rule).toHaveTextContent(/^380 nm540 nm700 nm$/);
    expect(rule.querySelector('b')).toHaveStyle({ left: '50%' });
    expect(render(<SpectrumRule />).container.querySelector('b')).toBeNull();
  });
});

describe('the wavelength slider', () => {
  it('is a slider in nanometres, from the sweep’s first wavelength to its last', () => {
    render(<Held />);
    const slider = screen.getByRole('slider', { name: 'Wavelength' });
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '383');
    expect(slider).toHaveAttribute('aria-valuemax', '697');
    expect(slider).toHaveAttribute('aria-valuenow', '540');
    expect(slider).toHaveAttribute('aria-valuetext', '540 nanometres');
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal');
    // The held figure rides on the rule; the dominant tick keeps its own.
    expect(slider).toHaveTextContent('540 nm');
    expect(slider).toHaveTextContent('632 nm');
  });

  it('steps one nanometre on the arrows and ten with Shift or a page key; Home and End go to the ends', () => {
    const chosen = vi.fn();
    render(<Held onChange={chosen} />);
    const slider = screen.getByRole('slider');
    const press = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        slider.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    expect(press('ArrowRight')).toBe(true);
    expect(slider).toHaveAttribute('aria-valuenow', '541');
    press('ArrowUp');
    expect(slider).toHaveAttribute('aria-valuenow', '542');
    press('ArrowLeft', true);
    expect(slider).toHaveAttribute('aria-valuenow', '532');
    press('ArrowDown');
    press('PageDown');
    expect(slider).toHaveAttribute('aria-valuenow', '521');
    press('PageUp');
    press('ArrowRight', true);
    expect(slider).toHaveAttribute('aria-valuenow', '541');
    press('Home');
    expect(slider).toHaveAttribute('aria-valuenow', '383');
    // At an end the arrows rest there and choose nothing new.
    chosen.mockClear();
    press('ArrowLeft');
    press('PageDown');
    expect(chosen).not.toHaveBeenCalled();
    press('End');
    expect(slider).toHaveAttribute('aria-valuenow', '697');
    // Other keys and modified keys belong to the room and the browser.
    expect(press('a')).toBe(false);
    expect(press(' ')).toBe(false);
    const modified = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      slider.dispatchEvent(modified);
    });
    expect(modified.defaultPrevented).toBe(false);
    expect(slider).toHaveAttribute('aria-valuenow', '697');
  });

  it('follows a pointer or a finger anywhere along the rule, from the press until the release', () => {
    const chosen = vi.fn();
    render(<Held onChange={chosen} />);
    const slider = screen.getByRole('slider');
    measureLine(slider);
    fireEvent.pointerDown(slider, { pointerId: 7, pointerType: 'touch', clientX: 170 });
    expect(slider).toHaveAttribute('aria-valuenow', '450');
    expect(slider).toHaveFocus();
    fireEvent.pointerMove(slider, { pointerId: 7, pointerType: 'touch', clientX: 340.4 });
    expect(slider).toHaveAttribute('aria-valuenow', '620');
    // Beyond the sweep's reach the rule holds its ends.
    fireEvent.pointerMove(slider, { pointerId: 7, pointerType: 'touch', clientX: 20 });
    expect(slider).toHaveAttribute('aria-valuenow', '383');
    fireEvent.pointerMove(slider, { pointerId: 7, pointerType: 'touch', clientX: 900 });
    expect(slider).toHaveAttribute('aria-valuenow', '697');
    // Another finger's moves are not this drag's.
    fireEvent.pointerMove(slider, { pointerId: 8, pointerType: 'touch', clientX: 200 });
    expect(slider).toHaveAttribute('aria-valuenow', '697');
    fireEvent.pointerUp(slider, { pointerId: 7, pointerType: 'touch', clientX: 900 });
    chosen.mockClear();
    fireEvent.pointerMove(slider, { pointerId: 7, pointerType: 'touch', clientX: 200 });
    expect(chosen).not.toHaveBeenCalled();
    // A mouse drags with its main button only; a cancelled pointer ends the drag too.
    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', button: 2, clientX: 200 });
    expect(chosen).not.toHaveBeenCalled();
    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200 });
    expect(slider).toHaveAttribute('aria-valuenow', '480');
    fireEvent.pointerCancel(slider, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(slider, { pointerId: 1, pointerType: 'mouse', clientX: 300 });
    expect(slider).toHaveAttribute('aria-valuenow', '480');
  });

  it('answers the keys the room passes on, as the slider does', () => {
    expect(wavelengthForKey({ key: 'ArrowRight', shiftKey: false }, 540, 383, 697)).toBe(541);
    expect(wavelengthForKey({ key: 'ArrowLeft', shiftKey: true }, 540, 383, 697)).toBe(530);
    expect(wavelengthForKey({ key: 'ArrowLeft', shiftKey: true }, 388, 383, 697)).toBe(383);
    expect(wavelengthForKey({ key: 'Home', shiftKey: false }, 540, 383, 697)).toBe(383);
    expect(wavelengthForKey({ key: 'End', shiftKey: false }, 540, 383, 697)).toBe(697);
    expect(wavelengthForKey({ key: 'Enter', shiftKey: false }, 540, 383, 697)).toBeNull();
  });
});
