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
  type Hanging,
  type TraitKey,
} from '@/lib/art/collection-traits';
import { workFolio, workNumber } from '@/lib/art/number';
import { fill } from '@/lib/i18n/format';
import {
  localeNames,
  locales,
  localizedPath,
  unlocalizedPath,
  type Locale,
} from '@/lib/i18n/routing';
import { NAVIGATION, NAVIGATION_LABEL } from '@/lib/navigation';
import { useMediaPolicy } from './media-policy';
import { useDayExpression, useDayWork } from './venue-day';
import { useMotion } from './motion-provider';
import { PreviewImage } from './preview-image';
import { keepPlaceOnClick } from './reading-place';
import { closeSheet, useOpenSheet } from './sheets-store';
import type { IndexSheetWords } from './index-sheet.words';
import { EXPRESSION_KEY } from '@/lib/storage-keys';
import styles from './index-sheet.module.css';

export type { Expression };
const TRAIT_LABEL = {
  structure: 'structure',
  underlay: 'underlay',
  palette: 'palette',
  spectralClass: 'spectralClass',
  massBalance: 'massBalance',
  fate: 'fate',
} as const satisfies Record<TraitKey, keyof IndexSheetWords>;
const ORDERS = ['number', 'cycle', 'spectrum'] as const;
/**
 * The collection's two other indexes, each the whole collection at once: its light in one
 * exposure, and every orbit performed together. Derived views, so never offered on a sale.
 */
const VIEWS = [
  { path: '/collection/all-the-light', label: 'allTheLight' },
  { path: '/collection/orrery', label: 'orrery' },
] as const;
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
    if (value === null || value === '' || value === 'number' || value === 'both') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return localizedPath(locale, `/collection${query ? `?${query}` : ''}`);
}

/** The collection's hanging, as its URL names it: one expression alone, or both across the seam. */
export function readHanging(params: URLSearchParams): Hanging {
  const value = params.get('expression');
  return value === 'ink' || value === 'light' ? value : 'both';
}

/**
 * The expression the sheet shows a work in behind its numeral, and opens it on: the hanging's,
 * when it hangs one alone; else the session's remembered choice; else the day's.
 */
export function seenExpression(
  hanging: Hanging,
  remembered: string | null | undefined,
  day: Expression,
): Expression {
  if (hanging !== 'both') return hanging;
  return remembered === 'ink' || remembered === 'light' ? remembered : day;
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
  pool,
  pinned,
}: {
  works: CompactWork[];
  locale: Locale;
  t: IndexSheetWords;
  /** The day's-work pool, so the sheet knows today's work and expression for itself. */
  pool: readonly number[];
  /** The server's pin of the venue's day (COSMIC_VENUE_DATE), when it has one. */
  pinned?: string;
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
      {open ? (
        <SheetBody
          works={works}
          locale={locale}
          t={t}
          pathname={pathname}
          pool={pool}
          pinned={pinned}
        />
      ) : null}
    </dialog>
  );
}

/**
 * Mounted only while the sheet is open, so each opening starts afresh: on the work of the page
 * behind it, or the day's work, until a hand or the keys hang another.
 */
function SheetBody({
  works,
  locale,
  t,
  pathname,
  pool,
  pinned,
}: {
  works: CompactWork[];
  locale: Locale;
  t: IndexSheetWords;
  pathname: string;
  pool: readonly number[];
  pinned?: string;
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
  const day = useDayExpression(pool.length, pinned);
  const dayWork = useDayWork(pool, pinned);
  const unlocalized = unlocalizedPath(pathname);
  // An ordering is the page only on the collection it orders. Elsewhere the page's own query
  // (a work's ?expression=, its view) says nothing about the collection: its links start afresh,
  // with both expressions hung.
  const onCollection = unlocalized === '/collection';
  const params = useMemo(
    () => (onCollection ? new URLSearchParams(search) : new URLSearchParams()),
    [onCollection, search],
  );
  const hanging = readHanging(params);
  const expression = seenExpression(hanging, remembered, day);
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

  // The wall is never bare: until a hand or the keys hang a work, it holds the page's own work,
  // or on any other page the day's, the home's plate.
  const pageWork = /^\/art\/(\d+)$/.exec(unlocalized)?.[1];
  const resting = [pageWork === undefined ? undefined : Number(pageWork), dayWork].find(
    (id): id is number => id !== undefined && byId.has(id),
  );
  const shown = active ?? resting ?? null;
  // Under a finger the wall's foot says how to hang a work, until one has been hung by hand.
  const hint = coarse && active === null;
  const activeWork = shown === null ? undefined : byId.get(shown);
  const wallSource = activeWork
    ? expression === 'light'
      ? compactPreviewUrl(activeWork, 'light')
      : (compactPreviewUrl(activeWork, 'ink') ?? compactPreviewUrl(activeWork, 'light'))
    : undefined;
  const wallMaterial = activeWork && !activeWork.previews?.ink ? 'light' : expression;
  // A work opens on the hanging's expression when one hangs alone; otherwise the work page
  // follows the session's choice or the day's, as the sheet's wall does.
  const workHref = (id: number) =>
    localizedPath(locale, `/art/${id}${hanging !== 'both' ? `?expression=${hanging}` : ''}`);
  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
          new Date(iso),
        )
      : undefined;
  const chipHref = (key: string, value: string) =>
    collectionHref(locale, params, { [key]: params.get(key) === value ? null : value });
  const filtering = ['cycle', ...TRAIT_KEYS].some((key) => params.get(key));
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
    // Under a finger the first tap hangs the work on the wall; a tap on the work it holds enters.
    if (coarse && shown !== id) {
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
              aria-current={
                onCollection && (params.get('order') ?? 'number') === order ? 'page' : undefined
              }
              onClick={close}
            >
              {t[ORDER_LABEL[order]]}
            </Link>
          ))}
          <span className={styles.divider} aria-hidden="true" />
          {(['ink', 'light'] as const).map((value) => {
            // Each word hangs its expression alone, and hangs both again once it is alone; the
            // word is its name, the current one is marked, and its description says what it does.
            const alone = onCollection && hanging === value;
            const action = alone ? t.hangTogether : fill(t.hangAlone, { expression: t[value] });
            return (
              <Link
                key={value}
                href={collectionHref(locale, params, { expression: alone ? 'both' : value })}
                aria-current={alone ? 'true' : undefined}
                title={action}
                onClick={close}
              >
                {t[value]}
              </Link>
            );
          })}
        </nav>
        {unlocalized.startsWith('/auctions') ? null : (
          <nav aria-label={t.collectionViews} className={`${styles.orderings} ${styles.views}`}>
            <span className={styles.divider} aria-hidden="true" />
            {VIEWS.map((view) => (
              <Link
                key={view.path}
                href={localizedPath(locale, view.path)}
                aria-current={unlocalized === view.path ? 'page' : undefined}
                onClick={close}
              >
                {t[view.label]}
              </Link>
            ))}
          </nav>
        )}
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
          {hanging !== 'both' ? <input type="hidden" name="expression" value={hanging} /> : null}
          <button type="submit">{t.find}</button>
        </form>
        <button type="button" className={styles.close} onClick={close}>
          {t.closeIndex}
        </button>
      </div>
      <div
        className={styles.wall}
        data-material={wallMaterial}
        data-hint={hint || undefined}
        aria-hidden="true"
        onClick={close}
      >
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
        {hint ? <p className={styles.wallHint}>{t.indexWallHint}</p> : null}
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
                      data-active={shown === work.id || undefined}
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
              href={`${localizedPath(value, unlocalized)}${search}`}
              hrefLang={value}
              lang={value}
              aria-current={value === locale ? 'true' : undefined}
              onClick={keepPlaceOnClick}
            >
              {localeNames[value]}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
