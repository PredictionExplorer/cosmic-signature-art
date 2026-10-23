'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pause, Play, ArrowUpRight } from 'lucide-react';
import { useMotion } from './motion-provider';
import {
  locales,
  localeNames,
  localizedPath,
  unlocalizedPath,
  type Locale,
} from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
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
          <span>
            COSMIC
            <br />
            SIGNATURE
          </span>
          <span className="brand-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </Link>
        <nav aria-label={t.collection}>
          {(
            [
              ['/collection', t.collection],
              ['/process', t.process],
              ['/auctions', t.auctions],
            ] as const
          ).map(([path, label]) => (
            <Link
              key={path}
              href={localizedPath(locale, path)}
              aria-current={pathname.startsWith(path) ? 'page' : undefined}
            >
              {label}
              {path === '/auctions' ? <ArrowUpRight size={12} /> : null}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <button className="motion-toggle" onClick={toggle} aria-pressed={paused}>
            {paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{paused ? t.resumeMotion : t.pauseMotion}</span>
          </button>
          <details className="language-menu">
            <summary aria-label={`${t.language}: ${locale.toUpperCase()}`}>
              {locale.toUpperCase()}
            </summary>
            <div>
              {locales.map((value) => (
                <Link
                  key={value}
                  href={localizedPath(value, pathname)}
                  hrefLang={value}
                  lang={value}
                  aria-current={value === locale ? 'true' : undefined}
                >
                  {localeNames[value]}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </header>
    </>
  );
}
export function SiteFooter({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <footer className="site-footer">
      <div>
        <Link className="footer-brand" href={localizedPath(locale)}>
          Cosmic Signature
        </Link>
        <p>{t.footerNote}</p>
      </div>
      <nav aria-label="Cosmic Signature">
        {(
          [
            ['/collection', t.collection],
            ['/process', t.process],
            ['/auctions', t.auctions],
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
