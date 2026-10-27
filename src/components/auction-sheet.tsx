'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { setTheatre, useMotion } from './motion-provider';
import styles from './auction-sheets.module.css';

const overflowProperties = ['overflow', 'overflow-x', 'overflow-y'];

/** Lock the page behind a modal sheet, remembering exactly what was declared before. */
function lockScroll() {
  const locked = [document.documentElement, document.body].map((target) => ({
    target,
    declarations: Array.from(target.style)
      .filter((property) => overflowProperties.includes(property))
      .map((property) => ({
        property,
        value: target.style.getPropertyValue(property),
        priority: target.style.getPropertyPriority(property),
      })),
  }));
  for (const { target } of locked) target.style.setProperty('overflow', 'hidden');
  return () => {
    for (const { target, declarations } of locked) {
      for (const property of overflowProperties) target.style.removeProperty(property);
      for (const { property, value, priority } of declarations)
        target.style.setProperty(property, value, priority);
    }
  };
}

/**
 * A sheet of the sale: a native modal dialog, 420 px at the right on a desk and a bottom
 * sheet rising to 60 % behind a 44 px handle on a phone, in paper, over a transparent
 * backdrop so no tint ever lies on the work. The venue's keys fall silent inside it, focus
 * returns to the word that opened it, and while a hushing sheet is open the theatre holds:
 * films rest on their stills and the Turn is instant. A sheet that unmounts hands the room back.
 */
export function AuctionSheet({
  open,
  onClose,
  returnFocusRef,
  label,
  closeLabel,
  handleLabel,
  hush = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  label: string;
  closeLabel: string;
  handleLabel: string;
  /** Hold the theatre while open (the bid sheet); an activity sheet lets the art move. */
  hush?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { theatre } = useMotion();
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const restore = lockScroll();
    // Safari does not focus pointer-activated buttons, so the opener is remembered explicitly.
    const opener = returnFocusRef?.current;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      restore();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);
  // The panel's own review hands the theatre back when it closes; an open sheet re-asserts the hush.
  useEffect(() => {
    if (open && hush && theatre !== 'hushed') setTheatre('hushed');
  }, [open, hush, theatre]);
  useEffect(() => {
    if (!open || !hush) return;
    return () => setTheatre('playing');
  }, [open, hush]);
  return (
    <dialog
      ref={dialog}
      className={`auction-sheet ${styles.sheet}`}
      aria-label={label}
      data-keys-suppressed=""
      onCancel={(event) => {
        // React carries a nested dialog's cancel (the bid review) up the tree; only the
        // sheet's own Escape closes the sheet.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className={styles.inner}>
          <button
            type="button"
            className={styles.handle}
            aria-label={handleLabel}
            onClick={onClose}
          >
            <span />
          </button>
          <header className={styles.head}>
            <p className="eyebrow">{label}</p>
            <button type="button" className={styles.close} onClick={onClose}>
              {closeLabel}
            </button>
          </header>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
