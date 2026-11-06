'use client';
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { SPECTRUM_FROM_NM, SPECTRUM_TO_NM, spectrumAt } from '@/lib/art/spectral-sweep';
import { withUnit } from '@/lib/typography';
import styles from './spectrum-rule.module.css';

/** An arrow key moves the held wavelength one nanometre; with Shift, or a page key, ten. */
export const WAVELENGTH_STEP = 1;
export const WAVELENGTH_STEP_LARGE = 10;

/**
 * The wavelength a key asks for, or null for a key the slider does not answer: the arrows step,
 * Page Up and Page Down step ten, Home and End go to either end of what the sweep holds.
 */
export function wavelengthForKey(
  event: { key: string; shiftKey: boolean },
  value: number,
  min: number,
  max: number,
): number | null {
  const step = event.shiftKey ? WAVELENGTH_STEP_LARGE : WAVELENGTH_STEP;
  const within = (next: number) => Math.min(max, Math.max(min, next));
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return within(value - step);
    case 'ArrowRight':
    case 'ArrowUp':
      return within(value + step);
    case 'PageDown':
      return within(value - WAVELENGTH_STEP_LARGE);
    case 'PageUp':
      return within(value + WAVELENGTH_STEP_LARGE);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}

const at = (nm: number) => ({ '--at': spectrumAt(nm) }) as CSSProperties;

/** The rule: its two ends, the hairline, the dominant tick, and whatever marks a caller adds. */
function Rule({
  dominantNm,
  className,
  labels,
  lineRef,
  children,
}: {
  dominantNm?: number;
  className?: string;
  labels?: 'always';
  lineRef?: Ref<HTMLElement>;
  children?: ReactNode;
}) {
  return (
    <span
      className={className ? `${styles.rule} ${className}` : styles.rule}
      aria-hidden="true"
      data-labels={labels}
    >
      <span className={styles.end}>{withUnit(String(SPECTRUM_FROM_NM), 'nm')}</span>
      <i ref={lineRef} className={styles.line}>
        {children}
        {dominantNm !== undefined ? (
          <b className={styles.tick} style={{ left: `${spectrumAt(dominantNm) * 100}%` }}>
            <span>{withUnit(String(dominantNm), 'nm')}</span>
          </b>
        ) : null}
      </i>
      <span className={styles.end}>{withUnit(String(SPECTRUM_TO_NM), 'nm')}</span>
    </span>
  );
}

/**
 * The visible spectrum typeset as a rule, 380 to 700 nm, with the work's own dominant wavelength
 * ticked: the process essay's sweep and the room's Wavelength lens read it alike.
 */
export function SpectrumRule({
  dominantNm,
  className,
}: {
  dominantNm?: number;
  className?: string;
}) {
  return <Rule dominantNm={dominantNm} className={className} />;
}

/**
 * The rule as a slider in nanometres: drag anywhere along it (a pointer or a finger), or use the
 * arrows, Page Up and Down, Home and End. Only the band the sweep holds can be chosen; the band
 * is drawn in ink on the hairline, the held wavelength is marked through it with its figure.
 */
export function WavelengthSlider({
  value,
  min,
  max,
  dominantNm,
  label,
  valueText,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  dominantNm?: number;
  label: string;
  valueText: string;
  onChange: (nm: number) => void;
}) {
  const line = useRef<HTMLElement>(null);
  const drag = useRef<number | null>(null);
  const choose = (next: number) => {
    if (next !== value) onChange(next);
  };
  const valueAt = (clientX: number) => {
    const box = line.current?.getBoundingClientRect();
    if (!box?.width) return value;
    const nm =
      SPECTRUM_FROM_NM + ((clientX - box.left) / box.width) * (SPECTRUM_TO_NM - SPECTRUM_FROM_NM);
    return Math.min(max, Math.max(min, Math.round(nm)));
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === event.pointerId) drag.current = null;
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-orientation="horizontal"
      className={styles.slider}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const next = wavelengthForKey(event, value, min, max);
        if (next === null) return;
        event.preventDefault();
        choose(next);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // No text selection and no page scroll: the gesture belongs to the rule.
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that is no longer active cannot be captured; its moves still arrive here.
        }
        drag.current = event.pointerId;
        choose(valueAt(event.clientX));
      }}
      onPointerMove={(event) => {
        if (drag.current === event.pointerId) choose(valueAt(event.clientX));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <Rule dominantNm={dominantNm} labels="always" lineRef={line}>
        <span
          className={styles.reach}
          style={{
            left: `${spectrumAt(min) * 100}%`,
            right: `${(1 - spectrumAt(max)) * 100}%`,
          }}
        />
        <span className={styles.held} style={at(value)} />
        <span className={styles.readout} style={at(value)}>
          {withUnit(String(value), 'nm')}
        </span>
      </Rule>
    </div>
  );
}
