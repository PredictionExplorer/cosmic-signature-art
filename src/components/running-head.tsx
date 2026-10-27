'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useMotion } from './motion-provider';
import { openSheet, useOpenSheet } from './sheets-store';
import {
  locales,
  localeNames,
  localizedPath,
  unlocalizedPath,
  type Locale,
} from '@/lib/i18n/routing';
import { NAVIGATION, NAVIGATION_LABEL } from '@/lib/navigation';
import type { Messages } from '@/lib/i18n/en';

/** The wordmark is typeset in Literata small caps; the mark is one static derivation. */
export function Wordmark({ t }: { t: Messages }) {
  return (
    <>
      <span className="brand-name">Cosmic Signature</span>
      <span className="brand-mark" role="img" aria-label={t.markLabel}>
        <i />
        <i />
        <i />
      </span>
    </>
  );
}

const noSubscription = () => () => {};
const popoverSupported = () =>
  typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
const noPopoverOnServer = () => false;

/**
 * A Popover API menu where the browser provides it (top layer, light dismiss, Escape),
 * with the same behaviour hand-built elsewhere. Every link is a real anchor with hreflang
 * and carries the visitor's current search params into the other language.
 */
export function LanguageMenu({
  locale,
  pathname,
  t,
}: {
  locale: Locale;
  pathname: string;
  t: Messages;
}) {
  const native = useSyncExternalStore(noSubscription, popoverSupported, noPopoverOnServer);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLElement>(null);

  function opened() {
    setSearch(window.location.search);
    const anchor = trigger.current?.getBoundingClientRect();
    const node = list.current;
    if (!anchor || !node) return;
    node.style.top = `${Math.round(anchor.bottom + 6)}px`;
    node.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - anchor.right))}px`;
  }
  const toggled = useEffectEvent((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) opened();
  });

  useEffect(() => {
    const node = list.current;
    if (!native || !node) return;
    const listener = (event: Event) => toggled((event as ToggleEvent).newState === 'open');
    // beforetoggle fires before the first paint of the open popover; toggle is a fallback.
    node.addEventListener('beforetoggle', listener);
    node.addEventListener('toggle', listener);
    return () => {
      node.removeEventListener('beforetoggle', listener);
      node.removeEventListener('toggle', listener);
    };
  }, [native]);

  useEffect(() => {
    if (native || !open) return;
    const press = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', press);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', press);
      document.removeEventListener('keydown', key);
    };
  }, [native, open]);

  // A fixed sheet must not drift from its trigger: scrolling or resizing closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (!native) return setOpen(false);
      try {
        list.current?.hidePopover();
      } catch {
        /* Already hidden. */
      }
    };
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open, native]);

  return (
    <div className="language-menu">
      <button
        ref={trigger}
        type="button"
        className="language-trigger"
        aria-label={`${t.language}: ${locale.toUpperCase()}`}
        aria-expanded={open}
        aria-controls={id}
        {...(native
          ? { popoverTarget: id, popoverTargetAction: 'toggle' as const }
          : {
              onClick: () => {
                const next = !open;
                setOpen(next);
                if (next) opened();
              },
            })}
      >
        {locale.toUpperCase()}
      </button>
      <nav
        id={id}
        ref={list}
        className="language-list"
        aria-label={t.language}
        {...(native ? { popover: 'auto' as const } : { hidden: !open })}
      >
        {locales.map((value) => (
          <Link
            key={value}
            href={`${localizedPath(value, pathname)}${search}`}
            hrefLang={value}
            lang={value}
            aria-current={value === locale ? 'true' : undefined}
          >
            {localeNames[value]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function PauseGlyph({ paused }: { paused: boolean }) {
  return paused ? (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 2v8l7-4z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 2h2v8H3zm4 0h2v8H7z" fill="currentColor" />
    </svg>
  );
}

/**
 * The running head: 48 px, opaque in the current ground, carrying the four words, Index and
 * the language. A second, inert copy in the other ground is clipped at the seam while the
 * Turn travels (globals.css reads <html data-turning> and --seam), so the head inverts with it.
 */
export function RunningHead({ locale, t }: { locale: Locale; t: Messages }) {
  const { paused, toggle } = useMotion();
  const pathname = unlocalizedPath(usePathname());
  const sheet = useOpenSheet();
  const current = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`) ? 'page' : undefined;
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="site-header">
        <div className="head-row">
          <Link className="brand" href={localizedPath(locale)} aria-label="Cosmic Signature">
            <Wordmark t={t} />
          </Link>
          <div className="head-words">
            <nav aria-label={t.siteNavigation} className="contents">
              {NAVIGATION.map((path) => (
                <Link key={path} href={localizedPath(locale, path)} aria-current={current(path)}>
                  {t[NAVIGATION_LABEL[path]]}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className="index-word"
              onClick={() => openSheet('index')}
              aria-haspopup="dialog"
              aria-expanded={sheet === 'index'}
              aria-controls="index-sheet"
            >
              {t.index}
            </button>
            <button
              type="button"
              className="motion-toggle"
              onClick={toggle}
              aria-pressed={paused}
              aria-label={t.pauseAmbientMotion}
            >
              <PauseGlyph paused={paused} />
              <span aria-hidden="true">{t.pauseAmbientMotion}</span>
            </button>
            <LanguageMenu locale={locale} pathname={pathname} t={t} />
          </div>
        </div>
        <div className="head-overlay" aria-hidden="true" inert>
          <div className="head-row">
            <span className="brand">
              <Wordmark t={t} />
            </span>
            <div className="head-words">
              <span className="head-nav contents">
                {NAVIGATION.map((path) => (
                  <span key={path} className="head-word" data-current={current(path)}>
                    {t[NAVIGATION_LABEL[path]]}
                  </span>
                ))}
              </span>
              <span className="head-word">{t.index}</span>
              <span className="motion-word">
                <PauseGlyph paused={paused} />
                <span>{t.pauseAmbientMotion}</span>
              </span>
              <span className="language-menu">
                <span className="language-trigger">{locale.toUpperCase()}</span>
              </span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
