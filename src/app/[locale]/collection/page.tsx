import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { getCollection } from '@/lib/art/server';
import {
  cycles,
  filterWorks,
  hasFilter,
  spectrum,
  TRAIT_KEYS,
  worksByNumber,
  type IndexedWork,
  type TraitKey,
  type WorkFilter,
} from '@/lib/art/collection-index';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { artworkForView } from '@/lib/art/view-media';
import { workFolio } from '@/lib/art/number';
import { PlateSequence } from '@/components/plate-sequence';
import { CollectionRoom } from './collection-room';
import { CollectionBar } from './collection-bar';
import { SpectrumWall } from './spectrum-wall';
import styles from './collection.module.css';

/** A page of the collection hangs eighteen works in the sequence's rhythm. */
const PAGE = 18;
type Order = 'number' | 'cycle' | 'spectrum';
type Expression = 'ink' | 'light';
type Search = Record<string, string | string[] | undefined>;
const ORDER_LABEL: Record<Order, keyof Messages> = {
  number: 'orderNumber',
  cycle: 'orderCycle',
  spectrum: 'orderSpectrum',
};
const TRAIT_LABEL: Record<TraitKey, keyof Messages> = {
  structure: 'structure',
  underlay: 'underlay',
  palette: 'palette',
  spectralClass: 'spectralClass',
  massBalance: 'massBalance',
  fate: 'fate',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  // The collection's card is drawn beside this route (opengraph-image.tsx), not configured here.
  return metadata(locale, '/collection', t.collection, t.statementLine, null);
}

/** The first value of a repeated key, as URLSearchParams.get and the room script read it. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
/** A search is at most a hundred printable characters; anything else is simply no search. */
function readQuery(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /[\p{Cc}\p{Cf}]/u.test(trimmed)) return undefined;
  return Array.from(trimmed).slice(0, 100).join('');
}
function readOrder(value?: string): Order {
  return value === 'cycle' || value === 'spectrum' ? value : 'number';
}
function readExpression(value?: string): Expression {
  return value === 'light' ? 'light' : 'ink';
}
/** Only short, printable values become criteria; anything else is simply no filter. */
function readFilter(search: Search): WorkFilter {
  const traits: Partial<Record<TraitKey, string>> = {};
  for (const key of TRAIT_KEYS) {
    const value = one(search[key])?.trim();
    if (value && value.length <= 60 && !/[\p{Cc}\p{Cf}]/u.test(value)) traits[key] = value;
  }
  const rawCycle = one(search.cycle);
  const cycle = rawCycle !== undefined && /^\d{1,4}$/.test(rawCycle) ? Number(rawCycle) : undefined;
  return { cycle, traits };
}

type ViewParams = {
  order: Order;
  expression: Expression;
  filter: WorkFilter;
  query?: string;
  offset?: number;
};
/** A collection link carrying the view; defaults are left out so canonical URLs stay short. */
function href(locale: Locale, view: ViewParams, anchor = false): string {
  const params = new URLSearchParams();
  if (view.order !== 'number') params.set('order', view.order);
  if (view.expression === 'light') params.set('expression', 'light');
  if (view.filter.cycle !== undefined) params.set('cycle', String(view.filter.cycle));
  for (const key of TRAIT_KEYS) {
    const value = view.filter.traits?.[key];
    if (value) params.set(key, value);
  }
  if (view.query) params.set('q', view.query);
  if (view.offset) params.set('offset', String(view.offset));
  const search = params.toString();
  return localizedPath(locale, `/collection${search ? `?${search}` : ''}${anchor ? '#works' : ''}`);
}

export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const search = await searchParams;
  const rawOffset = Number(one(search.offset) ?? 0);
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 1_000_000 ? rawOffset : 0;
  const query = readQuery(one(search.q));
  const order = readOrder(one(search.order));
  const expression = readExpression(one(search.expression));
  const filter = readFilter(search);
  const filtering = hasFilter(filter);
  // A search is a view of the number ordering; the other orderings and the wall hang from the index.
  const searching = order === 'number' && !!query;
  const view: ViewParams = { order, expression, filter, query: searching ? query : undefined };
  const night = expression === 'light' || order === 'spectrum';
  const summaries = cycles();

  // The sequence this view hangs, from the index; a search alone needs the live indexer.
  let works: IndexedWork[] = [];
  let total = 0;
  let chapters: 'boundaries' | 'all' = 'boundaries';
  if (order === 'cycle') {
    works = (filtering ? filterWorks(filter) : worksByNumber()).sort(
      (a, b) => (a.cycle ?? 0) - (b.cycle ?? 0) || b.id - a.id,
    );
    total = works.length;
    chapters = 'all';
  } else if (order === 'number') {
    const list = filtering ? filterWorks(filter) : worksByNumber();
    total = list.length;
    works = list.slice(offset, offset + PAGE);
  }
  const wall = order === 'spectrum' ? spectrum() : null;
  const hung = wall
    ? {
        measured: filtering
          ? wall.measured.filter((work) => filterWorks(filter).includes(work))
          : wall.measured,
        unmeasured: filtering
          ? wall.unmeasured.filter((work) => filterWorks(filter).includes(work))
          : wall.unmeasured,
      }
    : null;

  const range = searching
    ? `“${query}”`
    : order === 'spectrum'
      ? `${t.orderSpectrum} · 380–700 nm`
      : order === 'cycle'
        ? t.orderCycle
        : works.length
          ? `${workFolio(works[0].id)}–${workFolio(works[works.length - 1].id)}`
          : '—';
  const paged = order === 'number' && !searching;
  const previousHref =
    paged && offset > 0
      ? href(locale, { ...view, offset: Math.max(0, offset - PAGE) }, true)
      : undefined;
  const nextHref =
    paged && total > offset + PAGE
      ? href(locale, { ...view, offset: offset + PAGE }, true)
      : undefined;
  const orderings = (['number', 'cycle', 'spectrum'] as const).map((value) => ({
    label: t[ORDER_LABEL[value]],
    href: href(locale, { ...view, order: value, query: undefined }),
    current: order === value && !searching,
  }));
  const otherExpression: Expression = expression === 'ink' ? 'light' : 'ink';
  const activeChips = [
    ...(filter.cycle !== undefined
      ? [
          {
            key: 'cycle',
            label: `${t.cycle} ${filter.cycle}`,
            href: href(locale, { ...view, filter: { ...filter, cycle: undefined } }),
          },
        ]
      : []),
    ...TRAIT_KEYS.flatMap((key) => {
      const value = filter.traits?.[key];
      if (!value) return [];
      const traits = { ...filter.traits };
      delete traits[key];
      return [
        {
          key,
          label: `${t[TRAIT_LABEL[key]]} · ${value}`,
          href: href(locale, { ...view, filter: { ...filter, traits } }),
        },
      ];
    }),
  ];

  return (
    <CollectionRoom room={night ? 'night' : null}>
      <main
        id="main"
        className={styles.page}
        data-order={order}
        data-expression={expression}
        data-night={night || undefined}
      >
        <header className={styles.running}>
          <h1 className={styles.range}>
            <span>{t.collection}</span>
            <span aria-hidden="true"> · </span>
            <span className={styles.rangeNumbers}>{range}</span>
            {filtering && order !== 'spectrum' ? (
              <span className={styles.count}>
                {' '}
                · {total === 1 ? t.oneWork : fill(t.worksCount, { count: total })}
              </span>
            ) : null}
          </h1>
          <nav aria-label={t.ordering} className={styles.orderings}>
            {orderings.map((ordering) => (
              <Link
                key={ordering.href}
                href={ordering.href}
                aria-current={ordering.current ? 'page' : undefined}
              >
                {ordering.label}
              </Link>
            ))}
            {order !== 'spectrum' ? <span className={styles.divider} aria-hidden="true" /> : null}
            {(order === 'spectrum' ? [] : (['ink', 'light'] as const)).map((value) => (
              <Link
                key={value}
                href={href(locale, { ...view, expression: value })}
                aria-current={expression === value ? 'page' : undefined}
              >
                {t[value]}
              </Link>
            ))}
          </nav>
        </header>
        {activeChips.length ? (
          <nav className={styles.activeFilters} aria-label={t.filters}>
            {activeChips.map((chip) => (
              <Link key={chip.key} href={chip.href} className={styles.activeChip}>
                <bdi>{chip.label}</bdi>
              </Link>
            ))}
            <Link href={href(locale, { ...view, filter: { traits: {} } })} className={styles.clear}>
              {t.clearFilters}
            </Link>
          </nav>
        ) : null}
        <section id="works" className={styles.works} aria-label={t.collection}>
          {hung ? (
            <SpectrumWall
              measured={hung.measured}
              unmeasured={hung.unmeasured}
              locale={locale}
              t={t}
            />
          ) : searching ? (
            <Suspense
              key={`${offset}-${query}`}
              fallback={
                <div
                  className={`collection-skeleton work-grid ${styles.skeleton}`}
                  aria-busy="true"
                  aria-label={t.collection}
                >
                  <div className="loading-plate" />
                </div>
              }
            >
              <SearchResults
                locale={locale}
                t={t}
                offset={offset}
                query={query!}
                expression={expression}
                view={view}
              />
            </Suspense>
          ) : works.length ? (
            <PlateSequence
              works={works.map((work) => artworkForView(artworkFromIndex(work), 'card'))}
              locale={locale}
              t={t}
              expression={expression}
              eagerFirstRow
              animated
              chapters={chapters}
              cycles={summaries}
            />
          ) : (
            <p className={`notice ${styles.empty}`}>{t.noWorks}</p>
          )}
          {previousHref || nextHref ? (
            <nav className={`pagination ${styles.pager}`} aria-label={t.collection}>
              {previousHref ? (
                <Link className="text-link" href={previousHref}>
                  ← {t.newer}
                </Link>
              ) : null}
              {nextHref ? (
                <Link className="text-link" href={nextHref}>
                  {t.older} →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
        <CollectionBar
          t={t}
          orderings={orderings}
          expressionHref={
            order === 'spectrum'
              ? undefined
              : href(locale, { ...view, expression: otherExpression })
          }
          expressionWord={t[otherExpression]}
          previousHref={previousHref}
          nextHref={nextHref}
        />
      </main>
    </CollectionRoom>
  );
}

/** A name or number search reads the live indexer; its results hang in the same rhythm. */
async function SearchResults({
  locale,
  t,
  offset,
  query,
  expression,
  view,
}: {
  locale: Locale;
  t: Messages;
  offset: number;
  query: string;
  expression: Expression;
  view: ViewParams;
}) {
  const result = await getCollection({ offset, limit: PAGE, query, includeMedia: true });
  return (
    <>
      {result.notice ? (
        <p className="notice" role="status">
          {result.notice === 'partial-records' ? t.partialRecords : t.unavailable}
        </p>
      ) : null}
      {result.items.length ? (
        <PlateSequence
          works={result.items.map((work) => artworkForView(work, 'card'))}
          locale={locale}
          t={t}
          expression={expression}
          eagerFirstRow
          animated
          chapters="boundaries"
          cycles={cycles()}
        />
      ) : (
        <p className={`notice ${styles.empty}`}>{t.noWorks}</p>
      )}
      {offset > 0 || (result.hasMore && result.nextOffset !== null) ? (
        <nav className={`pagination ${styles.pager}`} aria-label={t.collection}>
          {offset > 0 ? (
            <Link
              className="text-link"
              href={href(locale, { ...view, query, offset: Math.max(0, offset - PAGE) }, true)}
            >
              ← {t.newer}
            </Link>
          ) : null}
          {result.hasMore && result.nextOffset !== null ? (
            <Link
              className="text-link"
              href={href(locale, { ...view, query, offset: result.nextOffset }, true)}
            >
              {t.older} →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
