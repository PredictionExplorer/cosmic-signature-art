'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMotion } from './motion-provider';
import {
  locales,
  localeNames,
  localizedPath,
  unlocalizedPath,
  type Locale,
} from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';

/** One navigation vocabulary, in this order, everywhere the venue lists its rooms. */
export const NAVIGATION = ['/collection', '/auctions', '/process'] as const;
const NAVIGATION_LABEL: Record<(typeof NAVIGATION)[number], keyof Messages> = {
  '/collection': 'collection',
  '/auctions': 'auctions',
  '/process': 'process',
};

/** The wordmark and the static three-body mark; header and footer share one setting. */
function Wordmark({ t }: { t: Messages }) {
  return (
    <>
      <span className="brand-name">
        COSMIC
        <br />
        SIGNATURE
      </span>
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
function LanguageMenu({ locale, pathname, t }: { locale: Locale; pathname: string; t: Messages }) {
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
    node.style.right = `${Math.max(8, Math.round(window.innerWidth - anchor.right))}px`;
  }
  const toggled = useEffectEvent((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) opened();
  });

  useEffect(() => {
    const node = list.current;
    if (!native || !node) return;
    const listener = (event: Event) => toggled((event as ToggleEvent).newState === 'open');
    node.addEventListener('toggle', listener);
    return () => node.removeEventListener('toggle', listener);
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

export function SiteHeader({ locale, t }: { locale: Locale; t: Messages }) {
  const { paused, toggle } = useMotion();
  const pathname = unlocalizedPath(usePathname());
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="site-header">
        <Link className="brand" href={localizedPath(locale)} aria-label="Cosmic Signature">
          <Wordmark t={t} />
        </Link>
        <nav aria-label={t.siteNavigation}>
          {NAVIGATION.map((path) => (
            <Link
              key={path}
              href={localizedPath(locale, path)}
              aria-current={
                pathname === path || pathname.startsWith(`${path}/`) ? 'page' : undefined
              }
            >
              {t[NAVIGATION_LABEL[path]]}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <button
            type="button"
            className="motion-toggle"
            onClick={toggle}
            aria-pressed={paused}
            aria-label={t.pauseAmbientMotion}
          >
            {paused ? (
              <Play size={12} aria-hidden="true" />
            ) : (
              <Pause size={12} aria-hidden="true" />
            )}
            <span aria-hidden="true">{t.pauseAmbientMotion}</span>
          </button>
          <LanguageMenu locale={locale} pathname={pathname} t={t} />
        </div>
      </header>
    </>
  );
}

export function SiteFooter({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <footer className="site-footer">
      <div>
        <Link className="brand" href={localizedPath(locale)} aria-label="Cosmic Signature">
          <Wordmark t={t} />
        </Link>
        <p>{t.footerNote}</p>
      </div>
      <nav aria-label="Cosmic Signature">
        {(
          [
            ...NAVIGATION.map((path) => [path, t[NAVIGATION_LABEL[path]]] as const),
            ['/terms', t.terms],
            ['/privacy', t.privacy],
          ] as const
        ).map(([path, label]) => (
          <Link key={path} href={localizedPath(locale, path)}>
            {label}
          </Link>
        ))}
        <a href="https://cosmicsignature.com">{t.openProtocol} ↗</a>
      </nav>
      <span className="footer-coordinate">ART / ARBITRUM</span>
    </footer>
  );
}
