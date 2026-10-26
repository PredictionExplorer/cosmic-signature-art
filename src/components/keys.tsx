'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { closeSheet, openSheet, toggleSheet } from './sheets-store';

/** How long a typed run of digits waits for Enter before it is forgotten. */
const DIGITS_MS = 3000;

/**
 * Keys are suppressed while focus is in a field, a select, editable content or anything
 * marked data-keys-suppressed (the bid sheet), so a collector typing never triggers a move.
 */
export function inField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    return true;
  return !!target.closest('[data-keys-suppressed]');
}

/**
 * The venue's keys that work from anywhere: `/` opens the Index, `?` the key sheet, and a
 * run of digits followed by Enter goes to that work. Plate-local keys live with the plate.
 */
export function KeyboardVocabulary({ locale }: { locale: Locale }) {
  const router = useRouter();
  useEffect(() => {
    let digits = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const forget = () => {
      digits = '';
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (inField(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        forget();
        openSheet('index');
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        forget();
        toggleSheet('keys');
        return;
      }
      if (/^\d$/.test(event.key)) {
        digits = `${digits}${event.key}`.slice(-6);
        if (timer) clearTimeout(timer);
        timer = setTimeout(forget, DIGITS_MS);
        return;
      }
      if (event.key === 'Enter' && digits) {
        event.preventDefault();
        const id = Number(digits);
        forget();
        closeSheet();
        router.push(localizedPath(locale, `/art/${id}`));
        return;
      }
      if (event.key === 'Escape') forget();
    };
    window.addEventListener('keydown', onKey);
    // An honest hydration marker: the keys answer only once this listener is attached.
    document.documentElement.setAttribute('data-keys', 'ready');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.removeAttribute('data-keys');
      forget();
    };
  }, [locale, router]);
  return null;
}
