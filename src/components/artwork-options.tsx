'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Messages } from '@/lib/i18n/en';
import styles from './artwork-options.module.css';

/** Secondary viewing actions share one quiet, keyboard-accessible disclosure. */
export function ArtworkOptions({
  t,
  onStudy,
  onSit,
  readout,
}: {
  t: Messages;
  onStudy?: (trigger: HTMLButtonElement | null) => void;
  onSit?: () => void;
  readout?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className={styles.options}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={t.ways}
        title={t.ways}
        aria-expanded={open}
        aria-controls={id}
        data-viewing-options
        data-study={onStudy ? '' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="4" cy="10" r="1.25" fill="currentColor" />
          <circle cx="10" cy="10" r="1.25" fill="currentColor" />
          <circle cx="16" cy="10" r="1.25" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div id={id} className={styles.panel} data-viewing-options-panel>
          {onStudy ? (
            <button
              type="button"
              title={t.keyStudy}
              onClick={() => {
                setOpen(false);
                onStudy(trigger.current);
              }}
            >
              {t.enlarge}
            </button>
          ) : null}
          {onSit ? (
            <button
              type="button"
              title={t.keySit}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onSit();
              }}
            >
              {t.sit}
            </button>
          ) : null}
          {readout ? <div className={styles.readout}>{readout}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
