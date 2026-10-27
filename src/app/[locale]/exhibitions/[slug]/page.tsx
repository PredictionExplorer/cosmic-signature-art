import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { cycles, indexedWork } from '@/lib/art/collection-index';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { workNumber } from '@/lib/art/number';
import { getInterpretation } from '@/lib/art/types';
import { artworkSharingImage } from '@/lib/art/sharing';
import { auctionConfigured } from '@/lib/auction/config';
import { PlateSequence } from '@/components/plate-sequence';
import { Hang } from '@/components/hang';
import {
  CURATOR,
  exhibition,
  exhibitionIds,
  exhibitionTitle,
  exhibitions,
  formatMeasure,
} from '@/lib/exhibitions/exhibitions';
import { exhibitionLine, exhibitionSummary } from '../page';
import { CycleResults } from '../cycle-results';
import styles from '../exhibitions.module.css';

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const item = exhibition(slug);
  if (!item) return {};
  const t = messages(locale);
  const first = indexedWork(exhibitionIds(item)[0]);
  const work = first ? artworkFromIndex(first) : null;
  return metadata(
    locale,
    `/exhibitions/${slug}`,
    exhibitionTitle(item, t),
    exhibitionSummary(item, locale, t),
    artworkSharingImage(work, exhibitionTitle(item, t)),
  );
}

/**
 * One exhibition: a title spread (the kind and date, the title, the curator line, a trail's
 * rule, the note), then the works. A hang grows under the hand; a trail and a cycle hang in
 * the plate sequence's rhythm, and a trail prints the measured value beside every work.
 */
export default async function ExhibitionPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const item = exhibition(slug);
  if (!item) notFound();
  const t = messages(locale);
  const ids = exhibitionIds(item);
  const works = ids.flatMap((id) => {
    const indexed = indexedWork(id);
    return indexed ? [artworkFromIndex(indexed)] : [];
  });
  const title = exhibitionTitle(item, t);
  const labels = Object.fromEntries(
    works.map((work) => {
      const indexed = indexedWork(work.id);
      return [
        work.id,
        [indexed?.traits.structure, indexed?.traits.underlay].filter(Boolean).join(' · '),
      ];
    }),
  );
  const note =
    item.kind === 'hang' ? t.hangNote : item.kind === 'trail' ? t[item.rule.note] : t.cycleNote;
  const others = exhibitions().filter((candidate) => candidate.slug !== item.slug);
  return (
    <main id="main" className={styles.page}>
      <header className={styles.spread}>
        <p className="eyebrow">{exhibitionLine(item, locale, t)}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.curator}>{fill(t.hungBy, { curator: CURATOR })}</p>
        {item.kind === 'trail' ? (
          <p className={styles.rule}>
            <span className="eyebrow">{t.theRule}</span>
            <span>{t[item.rule.rule]}</span>
          </p>
        ) : null}
        <p className={`reading ${styles.note}`}>{note}</p>
      </header>
      {item.kind === 'hang' ? (
        <Hang works={works} locale={locale} t={t} labels={labels} />
      ) : (
        <>
          {item.kind === 'cycle' ? (
            <p className={styles.counts}>{exhibitionSummary(item, locale, t)}</p>
          ) : null}
          <PlateSequence
            works={works}
            locale={locale}
            t={t}
            expression="ink"
            eagerFirstRow
            chapters="none"
            cycles={cycles()}
          />
        </>
      )}
      {item.kind === 'trail' ? (
        <section aria-labelledby="works-title">
          <h2 id="works-title" className={`eyebrow ${styles.sectionTitle}`}>
            {t.theWorks}
          </h2>
          <ol className={styles.measures}>
            {item.members.map((member) => (
              <li key={member.work.id}>
                <Link href={localizedPath(locale, `/art/${member.work.id}`)}>
                  <span>{workNumber(member.work.id)}</span>
                  <span>
                    {fill(t[item.rule.measureLine], {
                      value: formatMeasure(item.rule.measure, member.value, locale),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {item.kind === 'cycle' && auctionConfigured ? (
        <CycleResults ids={ids} locale={locale} t={t} />
      ) : null}
      <nav className={styles.others} aria-label={t.otherExhibitions}>
        {others.map((other) => (
          <Link key={other.slug} href={localizedPath(locale, `/exhibitions/${other.slug}`)}>
            <span>{exhibitionTitle(other, t)}</span>
            <span>{exhibitionLine(other, locale, t)}</span>
          </Link>
        ))}
        <Link href={localizedPath(locale, '/exhibitions')}>
          <span>{t.allExhibitions}</span>
        </Link>
      </nav>
      {works.length === 0 ? <p className="notice section-wrap">{t.noWorks}</p> : null}
      {/* Every plate above is the work's own still; the first work's medium names the hang. */}
      {works[0] && !getInterpretation(works[0], 'ink') ? (
        <p className="sr-only">{t.lightOnly}</p>
      ) : null}
    </main>
  );
}
