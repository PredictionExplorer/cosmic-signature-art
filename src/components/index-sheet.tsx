'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
} from 'react';
import {
  compactPreviewUrl,
  TRAIT_KEYS,
  type CompactWork,
  type Expression,
  type TraitKey,
} from '@/lib/art/collection-traits';
import { workFolio, workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/en';
import {
  localeNames,
  locales,
  localizedPath,
  unlocalizedPath,
  type Locale,
} from '@/lib/i18n/routing';
import { NAVIGATION, NAVIGATION_LABEL } from '@/lib/navigation';
import { useMediaPolicy } from './media-policy';
import { useMotion } from './motion-provider';
import { PreviewImage } from './preview-image';
import { closeSheet, useOpenSheet } from './sheets-store';
import styles from './index-sheet.module.css';

export type { Expression };
/** The session remembers the chosen expression beside the motion preference; a new visit opens on Ink. */
export const EXPRESSION_KEY = 'cosmic-art-expression-v1';
const TRAIT_LABEL: Record<TraitKey, keyof Messages> = {
  structure: 'structure',
  underlay: 'underlay',
  palette: 'palette',
  spectralClass: 'spectralClass',
  massBalance: 'massBalance',
  fate: 'fate',
};
const ORDERS = ['number', 'cycle', 'spectrum'] as const;
const ORDER_LABEL = {
  number: 'orderNumber',
  cycle: 'orderCycle',
  spectrum: 'orderSpectrum',
} as const;
const noSubscription = () => () => {};
/** A coarse pointer (a finger) has no hover: the first tap hangs a work, the second enters it. */
const coarsePointer = () => window.matchMedia('(pointer: coarse)');
function subscribeCoarse(listener: () => void) {
  const query = coarsePointer();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const isCoarse = () => coarsePointer().matches;
const fineOnServer = () => false;

export interface IndexCycle {
  cycle: number;
  mintedAt?: string;
  works: CompactWork[];
}

/** One wrapping row per cycle, numerals ascending, the earliest mint as the cycle's date. */
export function cyclesOf(works: CompactWork[]): IndexCycle[] {
  const groups = new Map<number, IndexCycle>();
  for (const work of works) {
    if (work.cycle === undefined) continue;
    const group = groups.get(work.cycle) ?? { cycle: work.cycle, works: [] };
    group.works.push(work);
    if (work.mintedAt && (!group.mintedAt || work.mintedAt < group.mintedAt))
      group.mintedAt = work.mintedAt;
    groups.set(work.cycle, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.cycle - b.cycle)
    .map((group) => ({ ...group, works: [...group.works].sort((a, b) => a.id - b.id) }));
}

/** Every value a trait takes across the index, sorted; chips are never invented. */
export function facetsOf(works: CompactWork[]): Record<TraitKey, string[]> {
  const sets = Object.fromEntries(TRAIT_KEYS.map((key) => [key, new Set<string>()])) as Record<
    TraitKey,
    Set<string>
  >;
  for (const work of works)
    for (const key of TRAIT_KEYS) {
      const value = work.traits?.[key];
      if (value) sets[key].add(value);
    }
  return Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, [...sets[key]].sort((a, b) => a.localeCompare(b, 'en'))]),
  ) as Record<TraitKey, string[]>;
}

/**
 * A collection link that keeps the visitor's current ordering, expression and filters and
 * changes only what is named; `null` removes a parameter, and a new view starts at offset 0.
 */
export function collectionHref(
  locale: Locale,
  current: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const key of ['order', 'expression', 'cycle', ...TRAIT_KEYS, 'q'])
    if (current.get(key)) next.set(key, current.get(key)!);
  // A search is a view of the number ordering; choosing an ordering leaves it, as the page does.
  if ('order' in changes && !('q' in changes)) next.delete('q');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '' || value === 'number' || value === 'ink') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return localizedPath(locale, `/collection${query ? `?${query}` : ''}`);
}

export function readExpression(params: URLSearchParams, remembered?: string | null): Expression {
  if (params.get('expression') === 'light') return 'light';
  if (params.get('expression') === 'ink') return 'ink';
  return remembered === 'light' ? 'light' : 'ink';
}

function rememberedExpression(): string | null {
  try {
    return sessionStorage.getItem(EXPRESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * The Index of numbers: every numeral by cycle, the work under the pointer or focus standing
 * contain-fitted on its own ground behind the type, orderings, filter chips and the search.
 * Opened by the running head's Index word and the `/` key; on phones it is also the menu.
 */
export function IndexSheet({
  works,
  locale,
  t,
}: {
  works: CompactWork[];
  locale: Locale;
  t: Messages;
}) {
  const open = useOpenSheet() === 'index';
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!open) {
      if (node.open) node.close();
      return;
    }
    if (!node.open) node.showModal();
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);
  // Arriving anywhere closes the sheet; the plate is already there.
  useEffect(() => {
    closeSheet('index');
  }, [pathname]);
  return (
    <dialog
      ref={dialog}
      id="index-sheet"
      className={`sheet ${styles.sheet}`}
      aria-label={t.indexSheet}
      onCancel={(event) => {
        event.preventDefault();
        closeSheet('index');
      }}
    >
      {open ? <SheetBody works={works} locale={locale} t={t} pathname={pathname} /> : null}
    </dialog>
  );
}

/** Mounted only while the sheet is open, so each opening starts with an empty wall. */
function SheetBody({
  works,
  locale,
  t,
  pathname,
}: {
  works: CompactWork[];
  locale: Locale;
  t: Messages;
  pathname: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, fineOnServer);
  const { paused, toggle } = useMotion();
  const { constrained } = useMediaPolicy();
  // The view the visitor left behind the sheet, read once the sheet is on screen.
  const search = useSyncExternalStore(
    noSubscription,
    () => window.location.search,
    () => '',
  );
  const remembered = useSyncExternalStore(noSubscription, rememberedExpression, () => null);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const expression = readExpression(params, remembered);
  const cycles = useMemo(() => cyclesOf(works), [works]);
  const facets = useMemo(() => facetsOf(works), [works]);
  const byId = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);

  // The previews behind the type are decoded ahead at idle, never on a constrained connection.
  useEffect(() => {
    if (constrained) return;
    let cancelled = false;
    const sources = works
      .map((work) => compactPreviewUrl(work, expression))
      .filter((source): source is string => !!source);
    // Idle time where the browser offers it, a quiet pause elsewhere; each returns its cancel.
    const schedule = (callback: () => void): (() => void) => {
      if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(callback);
        return () => window.cancelIdleCallback(handle);
      }
      const timer = setTimeout(callback, 1200);
      return () => clearTimeout(timer);
    };
    let cancel = () => {};
    let index = 0;
    const warm = () => {
      if (cancelled || index >= sources.length) return;
      const image = new window.Image();
      image.decoding = 'async';
      image.src = sources[index];
      index += 1;
      const next = () => {
        if (!cancelled) cancel = schedule(warm);
      };
      if (typeof image.decode === 'function') void image.decode().then(next, next);
      else next();
    };
    cancel = schedule(warm);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [constrained, expression, works]);

  const activeWork = active === null ? undefined : byId.get(active);
  const wallSource = activeWork
    ? expression === 'light'
      ? compactPreviewUrl(activeWork, 'light')
      : (compactPreviewUrl(activeWork, 'ink') ?? compactPreviewUrl(activeWork, 'light'))
    : undefined;
  const wallMaterial = activeWork && !activeWork.previews?.ink ? 'light' : expression;
  const workHref = (id: number) =>
    localizedPath(locale, `/art/${id}${expression === 'light' ? '?expression=light' : ''}`);
  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
          new Date(iso),
        )
      : undefined;
  const chipHref = (key: string, value: string) =>
    collectionHref(locale, params, { [key]: params.get(key) === value ? null : value });
  const filtering = ['cycle', ...TRAIT_KEYS].some((key) => params.get(key));
  const unlocalized = unlocalizedPath(pathname);
  const close = () => closeSheet('index');

  /** A tap focuses a link in some browsers; only focus a keyboard made visible hangs a work there. */
  function focused(event: FocusEvent<HTMLAnchorElement>, id: number) {
    let visible = true;
    if (coarse) {
      try {
        visible = event.currentTarget.matches(':focus-visible');
      } catch {
        visible = false;
      }
    }
    if (visible) setActive(id);
  }
  function enter(event: MouseEvent<HTMLAnchorElement>, id: number) {
    // Under a finger the first tap hangs the work on the wall; the second enters it.
    if (coarse && active !== id) {
      event.preventDefault();
      setActive(id);
      return;
    }
    close();
  }

  return (
    <>
      <div className={styles.top}>
        <nav aria-label={t.ordering} className={styles.orderings}>
          {ORDERS.map((order) => (
            <Link
              key={order}
              href={collectionHref(locale, params, { order })}
              aria-current={(params.get('order') ?? 'number') === order ? 'page' : undefined}
              onClick={close}
            >
              {t[ORDER_LABEL[order]]}
            </Link>
          ))}
          <span className={styles.divider} aria-hidden="true" />
          {(['ink', 'light'] as const).map((value) => (
            <Link
              key={value}
              href={collectionHref(locale, params, { expression: value })}
              aria-current={expression === value ? 'page' : undefined}
              onClick={close}
            >
              {t[value]}
            </Link>
          ))}
        </nav>
        <form className={styles.search} action={localizedPath(locale, '/collection')} role="search">
          <label>
            <span className="sr-only">{t.search}</span>
            <input
              name="q"
              placeholder={t.searchPlaceholder}
              maxLength={100}
              inputMode="search"
              autoComplete="off"
            />
          </label>
          {expression === 'light' ? <input type="hidden" name="expression" value="light" /> : null}
          <button type="submit">{t.find}</button>
        </form>
        <button type="button" className={styles.close} onClick={close}>
          {t.closeIndex}
        </button>
      </div>
      <div className={styles.wall} data-material={wallMaterial} aria-hidden="true" onClick={close}>
        {wallSource ? (
          <PreviewImage
            key={wallSource}
            src={wallSource}
            width={640}
            height={414}
            decoding="async"
            data-work={activeWork?.id}
          />
        ) : null}
      </div>
      <div className={styles.lower}>
        <nav className={styles.pocket} aria-label={t.siteNavigation}>
          {NAVIGATION.map((path) => (
            <Link
              key={path}
              href={localizedPath(locale, path)}
              aria-current={
                unlocalized === path || unlocalized.startsWith(`${path}/`) ? 'page' : undefined
              }
              onClick={close}
            >
              {t[NAVIGATION_LABEL[path]]}
            </Link>
          ))}
          <button type="button" onClick={toggle} aria-pressed={paused}>
            {t.pauseAmbientMotion}
          </button>
        </nav>
        <ol className={styles.cycles} aria-label={t.index}>
          {cycles.map((cycle) => (
            <li key={cycle.cycle}>
              <p className={styles.cycleLabel}>
                <span>
                  {t.cycle} {cycle.cycle}
                </span>
                {cycle.mintedAt ? (
                  <time dateTime={cycle.mintedAt}>
                    {fill(t.imprintedOn, { date: date(cycle.mintedAt)! })}
                  </time>
                ) : null}
              </p>
              <ul className={styles.numerals}>
                {cycle.works.map((work) => (
                  <li key={work.id}>
                    <Link
                      href={workHref(work.id)}
                      className={styles.numeral}
                      aria-label={workNumber(work.id)}
                      data-active={active === work.id || undefined}
                      onPointerEnter={() => {
                        if (!coarse) setActive(work.id);
                      }}
                      onFocus={(event) => focused(event, work.id)}
                      onClick={(event) => enter(event, work.id)}
                    >
                      {workFolio(work.id)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <div className={styles.filters}>
          <p className={styles.filterHead}>
            <span className="eyebrow">{t.filters}</span>
            {filtering ? (
              <Link
                href={collectionHref(
                  locale,
                  params,
                  Object.fromEntries(['cycle', ...TRAIT_KEYS].map((key) => [key, null])),
                )}
                onClick={close}
              >
                {t.clearFilters}
              </Link>
            ) : null}
          </p>
          <ul className={styles.chips} aria-label={t.cycle}>
            {cycles.map((cycle) => (
              <li key={cycle.cycle}>
                <Link
                  href={chipHref('cycle', String(cycle.cycle))}
                  aria-current={params.get('cycle') === String(cycle.cycle) ? 'true' : undefined}
                  onClick={close}
                >
                  {t.cycle} {cycle.cycle}
                </Link>
              </li>
            ))}
          </ul>
          {TRAIT_KEYS.filter((key) => facets[key].length && key !== 'palette').map((key) => (
            <ul key={key} className={styles.chips} aria-label={t[TRAIT_LABEL[key]]}>
              {facets[key].map((value) => (
                <li key={value}>
                  <Link
                    href={chipHref(key, value)}
                    aria-current={params.get(key) === value ? 'true' : undefined}
                    onClick={close}
                  >
                    <bdi>{value}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
          {facets.palette.length ? (
            <details className={styles.palette} open={!!params.get('palette')}>
              <summary>{t.palette}</summary>
              <ul className={styles.chips} aria-label={t.palette}>
                {facets.palette.map((value) => (
                  <li key={value}>
                    <Link
                      href={chipHref('palette', value)}
                      aria-current={params.get('palette') === value ? 'true' : undefined}
                      onClick={close}
                    >
                      <bdi>{value}</bdi>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        <nav className={`${styles.pocket} ${styles.languages}`} aria-label={t.language}>
          {locales.map((value) => (
            <a
              key={value}
              href={`${localizedPath(value, unlocalized)}${params.toString() ? `?${params}` : ''}`}
              hrefLang={value}
              lang={value}
              aria-current={value === locale ? 'true' : undefined}
            >
              {localeNames[value]}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
