'use client';
import { useEffect, useRef } from 'react';
import type { Messages } from '@/lib/i18n/en';
import { closeSheet, useOpenSheet } from './sheets-store';
import styles from './key-sheet.module.css';

/** The `?` sheet: every key the venue answers to, in the visitor's language. */
export function KeySheet({ t }: { t: Messages }) {
  const open = useOpenSheet() === 'keys';
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    else if (!open && node.open) node.close();
  }, [open]);
  const rows: [string, string][] = [
    ['Space', t.keyPlay],
    ['← →', t.keyNeighbours],
    ['I L', t.keyExpressions],
    ['F', t.keyFilm],
    ['S', t.keySit],
    ['Z', t.keyStudy],
    ['/', t.keyIndex],
    ['0–9 ⏎', t.keyJump],
    ['?', t.keyHelp],
    ['Esc', t.close],
  ];
  return (
    <dialog
      ref={dialog}
      className={`sheet ${styles.sheet}`}
      aria-label={t.keysSheet}
      onCancel={(event) => {
        event.preventDefault();
        closeSheet('keys');
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSheet('keys');
      }}
    >
      {open ? (
        <div className={styles.inner}>
          <header className={styles.head}>
            <h2 className="eyebrow">{t.keysSheet}</h2>
            <button type="button" className={styles.close} onClick={() => closeSheet('keys')}>
              {t.close}
            </button>
          </header>
          <dl className={styles.list}>
            {rows.map(([key, meaning]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </dialog>
  );
}
