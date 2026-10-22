import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { ArtworkMedia } from '@/components/artwork-media';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/process', t.processTitle, t.processIntro);
}
export default async function Process({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const work = getCuratedArtwork(31)!;
  return (
    <main id="main" className="process-page section-wrap">
      <div className="page-heading">
        <p className="eyebrow">{t.process}</p>
        <h1>{t.processTitle}</h1>
        <p>{t.processIntro}</p>
      </div>
      <section className="process-chapter">
        <div className="chapter-copy">
          <span className="eyebrow">01 / {t.light}</span>
          <h2>{t.gravityTitle}</h2>
          <p>{t.gravityCopy}</p>
        </div>
        <ArtworkMedia
          media={getInterpretation(work, 'light')}
          alt={`${t.signature} 31 · ${t.light}`}
          still
        />
      </section>
      <section className="process-chapter chapter-reverse">
        <div className="chapter-copy">
          <span className="eyebrow">02 / {t.ink}</span>
          <h2>{t.fluidTitle}</h2>
          <p>{t.fluidCopy}</p>
        </div>
        <ArtworkMedia
          media={getInterpretation(work, 'ink')}
          alt={`${t.signature} 31 · ${t.ink}`}
          repeat
        />
      </section>
      <section className="process-ending">
        <p className="eyebrow">{t.oneMotion}</p>
        <h2>{t.expressionTitle}</h2>
        <p>{t.expressionCopy}</p>
        <p className="muted">{t.processNote}</p>
        <Link className="text-link" href={localizedPath(locale, '/art/31')}>
          {t.enterWork} ↗
        </Link>
      </section>
    </main>
  );
}
