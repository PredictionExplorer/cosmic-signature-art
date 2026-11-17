import { Suspense, type CSSProperties, type ReactNode } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { CHOICE_FIELD_WORDS } from '@/components/choice-field.words';
import { indexedWork } from '@/lib/art/collection-index';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { workNumber } from '@/lib/art/number';
import {
  getInterpretation,
  stillSourceSet,
  type ArtInterpretation,
  type Artwork,
  type PlateDetail,
} from '@/lib/art/types';
import { paragraph, type EssayFacts } from '@/lib/essay/facts';
import { SOURCE_ORDER, sourceNumber } from '@/lib/essay/numerals';
import { rich } from '@/lib/essay/rich';
import { SOURCES, type SourceKey } from '@/lib/essay/sources';
import { ESSAY, TERMS, type Block, type Chapter, type EssayPart } from '@/lib/essay/structure';
import { longestRun } from '@/lib/essay/titles';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/routing';
import { words } from '@/lib/i18n/words';
import { QUICK_GATE } from '@/lib/physics/beginnings';
import { NBSP } from '@/lib/typography';
import { EssayFigure } from './essay-figures';
import styles from './essay.module.css';
import room from './process.module.css';

/*
  The essay the home is made of: its chapters, as src/lib/essay/structure.ts orders them, set
  from the catalog's words with the facts of the work in hand (src/lib/essay/facts.ts). All of
  it is rendered on the server and is in the document a reader is sent; the one live part here
  is the figure of the choice. The three plates the parts open with are the page's own.
*/

interface Reading {
  readonly t: Messages;
  readonly locale: Locale;
  readonly facts: EssayFacts;
  /** The work in hand, for the chapters that show a detail of its stills. */
  readonly work?: Artwork;
}

/**
 * A detail of a still: one of its measured windows, cut from the published still and set across
 * the column, so that about one point of the picture meets one point of the screen. The still
 * is drawn whole and the frame shows the window: nothing is resampled but by the browser.
 */
function EssayDetail({
  media,
  window,
  label,
  word,
}: {
  media: ArtInterpretation;
  window: PlateDetail;
  /** "№ 023 · Light". */
  label: string;
  /** "Detail". */
  word: string;
}) {
  const width = media.width ?? ART_WIDTH;
  const height = media.height ?? ART_HEIGHT;
  return (
    <figure className={`${styles.figure} ${styles.detail}`} data-detail={media.id}>
      <div style={{ aspectRatio: `${window.width} / ${window.height}` }}>
        <img
          src={media.still}
          srcSet={stillSourceSet(media)}
          // A phone is sent the middle rung, a desk the published still: the window is a third
          // of the picture's width, set across the column.
          sizes="(max-width: 767px) 640px, 2400px"
          width={width}
          height={height}
          alt={`${label} · ${word}`}
          loading="lazy"
          decoding="async"
          style={{
            width: `${(width / window.width) * 100}%`,
            left: `${(-window.x / window.width) * 100}%`,
            top: `${(-window.y / window.height) * 100}%`,
          }}
        />
      </div>
      <figcaption>
        <span className="small-caps">{word}</span>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

/** A source's mark in running text: a raised numeral that leads to its entry in the list. */
function Cite({ source, t }: { source: SourceKey; t: Messages }) {
  const n = sourceNumber(source);
  return (
    <sup className={styles.cite}>
      <a href={`#source-${n}`} aria-label={fill(t.footnote, { n })}>
        {n}
      </a>
    </sup>
  );
}

function Words({ text, t }: { text: string; t: Messages }): ReactNode {
  return rich(text, (source) => <Cite source={source} t={t} />);
}

function ChapterBlock({
  block,
  chapter,
  t,
  locale,
  facts,
  work,
}: Reading & { block: Block; chapter: Chapter }) {
  switch (block.kind) {
    case 'detail': {
      const media = work ? getInterpretation(work, block.of) : undefined;
      const window = media?.detail?.[0];
      // A work whose still has not been measured shows none: the words stand without it.
      if (!media?.still || !window) return null;
      return (
        <EssayDetail
          media={media}
          window={window}
          label={`${workNumber(facts.id)} · ${t[block.of]}`}
          word={t.detail}
        />
      );
    }
    case 'p':
      return (
        <p className="reading">
          <Words text={paragraph(block.parts, facts, t)} t={t} />
        </p>
      );
    case 'record':
      return (
        <div className={styles.record} role="note">
          <p className="small-caps">{paragraph(['essayOfWork'], facts, t)}</p>
          <p>
            <Words text={paragraph(block.parts, facts, t)} t={t} />
          </p>
        </div>
      );
    case 'note':
      return (
        <div className={styles.note} role="note">
          <h3>{t[block.title]}</h3>
          <p>
            <Words text={paragraph(block.parts, facts, t)} t={t} />
          </p>
        </div>
      );
    case 'points':
      return (
        <ol className={styles.points}>
          {block.items.map(([lead, text]) => (
            <li key={lead}>
              <p className={styles.lead}>{t[lead]}</p>
              <p className="reading">
                <Words text={paragraph([text], facts, t)} t={t} />
              </p>
            </li>
          ))}
        </ol>
      );
    case 'figure':
      return (
        <figure className={styles.figure} data-figure={block.figure}>
          <EssayFigure name={block.figure} facts={facts} ground={chapter.ground} locale={locale} />
          <figcaption>
            {block.derived ? <span className="small-caps">{t.analysisNotWork}</span> : null}
            <span>
              <Words text={paragraph([block.caption], facts, t)} t={t} />
            </span>
          </figcaption>
        </figure>
      );
    case 'choice':
      return <Choice t={t} locale={locale} facts={facts} />;
  }
}

/** The choice, live: the record's own line, then every beginning drawn again in the browser. */
function Choice({ t, locale, facts }: Reading) {
  const borda = indexedWork(facts.id)?.borda;
  const number = new Intl.NumberFormat(locale);
  const decimals = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  return (
    <div className={styles.exhibit}>
      {borda ? (
        <>
          <p className={room.selection}>
            {fill(t.selectionLine, {
              total: number.format(borda.totalCandidates),
              index: number.format(borda.selectedIndex),
            })}
          </p>
          <p className={room.borda}>
            {workNumber(facts.id)} ·{' '}
            {fill(t.bordaNote, {
              chaos: decimals.format(borda.chaosWeight ?? 0),
              equilibrium: decimals.format(borda.equilibriumWeight ?? 0),
              aesthetic: decimals.format(borda.aestheticScore ?? 0),
              score: decimals.format(borda.selectionScore ?? 0),
            })}
          </p>
        </>
      ) : null}
      {/* A boundary of its own: React holds a large boundary back behind its fallback (the
          route's loading plate). Only the field, which needs the browser anyway, may follow
          the essay's words; the words themselves are in the first bytes. */}
      <Suspense fallback={null}>
        <ChoiceField
          generation={facts.orbit.generation}
          gate={QUICK_GATE}
          t={words(t, CHOICE_FIELD_WORDS)}
          locale={locale}
        />
      </Suspense>
    </div>
  );
}

/** A chapter's number and word, as the contents and the chapter's own margin both set them. */
export function ChapterIndex({ numeral, word }: { numeral: string; word: string }) {
  return (
    <p className={room.chapterIndex}>
      <span className="numeral">{numeral}</span>
      <span className="small-caps">{word}</span>
    </p>
  );
}

/**
 * A chapter's statement. Its longest word is reckoned here, so that a narrow screen can set the
 * title as large as that word allows and never cut it (src/lib/essay/titles.ts).
 */
export function Title({ id, text, locale }: { id: string; text: string; locale: Locale }) {
  // A dash stays with the word before it, so no line of a title begins with one: «Спочатку —»
  // and then «орбіта.», never the dash alone at the head of the second line.
  const set = text.replace(/ (?=[—–])/g, NBSP);
  return (
    <h2
      id={id}
      className={`chapter ${styles.title}`}
      style={{ '--longest': longestRun(set, locale) } as CSSProperties}
    >
      {set}
    </h2>
  );
}

/** The chapters of one of the essay's parts, in order: they stand beneath that part's plate. */
export function EssayChapters({ part, ...reading }: Reading & { part: EssayPart }) {
  const { t } = reading;
  return ESSAY.filter((chapter) => chapter.part === part).map((chapter) => (
    <section
      key={chapter.id}
      id={chapter.id}
      className={`${chapter.ground === 'night' ? room.night : room.paper} ${styles.chapter}`}
      data-ground={chapter.ground}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className={styles.index}>
        <ChapterIndex numeral={chapter.numeral} word={t[chapter.word]} />
      </div>
      <div className={styles.body}>
        <Title id={`${chapter.id}-title`} text={t[chapter.title]} locale={reading.locale} />
        <div className={styles.text}>
          {chapter.blocks.map((block, index) => (
            <ChapterBlock key={index} block={block} chapter={chapter} {...reading} />
          ))}
        </div>
      </div>
    </section>
  ));
}

interface ContentsEntry {
  readonly id: string;
  readonly numeral: string;
  readonly word: string;
}

/** The three parts' numbers, in the margin of each part's plate and in the contents. */
export const PART_NUMERALS = { orbit: 'I', light: 'II', ink: 'III' } as const;

/**
 * The essay's contents, in the page's own order and by its parts: each part's plate under its
 * number, then its chapters by number and word; then what is not known, how a work comes to
 * exist, and the two lists that close the page, which stand under no plate.
 */
export function essayContents(
  t: Messages,
): { readonly plate?: ContentsEntry; readonly entries: readonly ContentsEntry[] }[] {
  const chapters = (part: EssayPart) =>
    ESSAY.filter((chapter) => chapter.part === part).map(({ id, numeral, word }) => ({
      id,
      numeral,
      word: t[word],
    }));
  const entry = (id: string, word: string, numeral = '·'): ContentsEntry => ({
    id,
    numeral,
    word,
  });
  return [
    {
      plate: entry('orbit', t.essayOrbitWord, PART_NUMERALS.orbit),
      entries: chapters('orbit'),
    },
    {
      plate: entry('light', t.light, PART_NUMERALS.light),
      entries: [...chapters('light'), entry('spectrum', t.chapterSpectrum)],
    },
    { plate: entry('ink', t.ink, PART_NUMERALS.ink), entries: chapters('ink') },
    {
      entries: [
        ...chapters('close'),
        entry('cycle', t.essayBornWord),
        entry('terms', t.essayTermsWord),
        entry('sources', t.essaySourcesWord),
      ],
    },
  ];
}

function ContentsLink({ id, numeral, word }: ContentsEntry) {
  return (
    <a href={`#${id}`}>
      <span className="numeral">{numeral}</span>
      <span>{word}</span>
    </a>
  );
}

export function EssayContents({ t }: { t: Messages }) {
  return (
    <nav aria-label={t.process} className={styles.contents}>
      <ol>
        {essayContents(t).map(({ plate, entries }, index) => (
          <li key={plate?.id ?? index}>
            {plate ? (
              <span className={styles.part}>
                <ContentsLink {...plate} />
              </span>
            ) : null}
            <ol>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <ContentsLink {...entry} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The venue's terms, each with what it means. */
export function EssayTerms({ t, locale, facts }: Reading) {
  return (
    <section
      id="terms"
      className={`${room.paper} ${styles.chapter}`}
      data-ground="paper"
      aria-labelledby="terms-title"
    >
      <div className={styles.index}>
        <ChapterIndex numeral="·" word={t.essayTermsWord} />
      </div>
      <div className={styles.body}>
        <Title id="terms-title" text={t.essayTermsTitle} locale={locale} />
        <dl className={styles.terms}>
          {TERMS.map(([term, meaning]) => (
            <div key={term}>
              <dt>{t[term]}</dt>
              <dd>
                <Words text={paragraph([meaning], facts, t)} t={t} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** The sources, numbered as the text cites them; a reference with an address leaves the venue. */
export function EssaySources({ t, locale }: Pick<Reading, 't' | 'locale'>) {
  return (
    <section
      id="sources"
      className={`${room.paper} ${styles.chapter}`}
      data-ground="paper"
      aria-labelledby="sources-title"
    >
      <div className={styles.index}>
        <ChapterIndex numeral="·" word={t.essaySourcesWord} />
      </div>
      <div className={styles.body}>
        <Title id="sources-title" text={t.essaySourcesTitle} locale={locale} />
        <p className={`reading ${styles.sourcesNote}`}>{t.essaySourcesNote}</p>
        <ol className={styles.sources}>
          {SOURCE_ORDER.map((key, index) => (
            <li key={key} id={`source-${index + 1}`}>
              <span className="numeral">{index + 1}</span>
              <ul>
                {SOURCES[key].map((reference) => (
                  // References stand as published, whatever the page's language.
                  <li key={reference.text} lang="en">
                    {'href' in reference ? (
                      <a href={reference.href} target="_blank" rel="noreferrer">
                        {reference.text}
                        {NBSP}↗
                      </a>
                    ) : (
                      reference.text
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
