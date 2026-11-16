import { Suspense, type CSSProperties, type ReactNode } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { CHOICE_FIELD_WORDS } from '@/components/choice-field.words';
import { indexedWork } from '@/lib/art/collection-index';
import { workNumber } from '@/lib/art/number';
import { paragraph, type EssayFacts } from '@/lib/essay/facts';
import { SOURCE_ORDER, sourceNumber } from '@/lib/essay/numerals';
import { rich } from '@/lib/essay/rich';
import { SOURCES, type SourceKey } from '@/lib/essay/sources';
import { ESSAY, TERMS, type Block, type Chapter } from '@/lib/essay/structure';
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
  The essay on the Process page: its chapters, as src/lib/essay/structure.ts orders them, set
  from the catalog's words with the facts of the work in hand (src/lib/essay/facts.ts). All of
  it is rendered on the server and is in the document a reader is sent; the one live part is
  the figure of the choice, which the page already had.
*/

interface Reading {
  readonly t: Messages;
  readonly locale: Locale;
  readonly facts: EssayFacts;
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
}: Reading & { block: Block; chapter: Chapter }) {
  switch (block.kind) {
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
function Title({ id, text, locale }: { id: string; text: string; locale: Locale }) {
  return (
    <h2
      id={id}
      className={`chapter ${styles.title}`}
      style={{ '--longest': longestRun(text, locale) } as CSSProperties}
    >
      {text}
    </h2>
  );
}

/** The essay's chapters on one ground, in order. */
export function EssayChapters({ ground, ...reading }: Reading & { ground: Chapter['ground'] }) {
  const { t } = reading;
  return ESSAY.filter((chapter) => chapter.ground === ground).map((chapter) => (
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

/** The essay's contents: every chapter by number and word, then the two closing lists. */
export function EssayContents({ t }: { t: Messages }) {
  const entries = [
    ...ESSAY.map(({ id, numeral, word }) => ({ id, numeral, word: t[word] })),
    { id: 'terms', numeral: '·', word: t.essayTermsWord },
    { id: 'sources', numeral: '·', word: t.essaySourcesWord },
  ];
  return (
    <nav aria-label={t.process} className={styles.contents}>
      <ol>
        {entries.map(({ id, numeral, word }) => (
          <li key={id}>
            <a href={`#${id}`}>
              <span className="numeral">{numeral}</span>
              <span>{word}</span>
            </a>
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
