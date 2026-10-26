import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { metadata } from '@/lib/site';
import { ArtworkViewer } from '@/components/artwork-viewer';

/** The day's work follows the UTC date; the page is regenerated within the hour. */
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/', `${t.shape} ${t.ofMotion}`, t.statementLine);
}

/**
 * The home opens on the day's work: Screen 1 is its Ink plate with the one line, Screen 2
 * the same orbit in Light, one Turn away. The Dusk, the home's one automatic event, waits
 * behind NEXT_PUBLIC_HOME_DUSK until the owner has watched naive visitors meet it.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const work = getCuratedArtwork(workOfTheDay())!;
  return (
    <main id="main" className="home">
      {/* No headline on the wall; the page still names itself for a screen reader. */}
      <h1 className="sr-only">
        {t.shape} {t.ofMotion}
      </h1>
      <ArtworkViewer
        artwork={work}
        t={t}
        locale={locale}
        presentation="home"
        inlinePreviews={{
          ink: inlineCuratedPreview(work.id, 'ink'),
          light: inlineCuratedPreview(work.id, 'light'),
        }}
        dusk={process.env.NEXT_PUBLIC_HOME_DUSK === '1'}
      />
      {/* Screens 3–6 are composed from the home-screens workstream after merge. */}
    </main>
  );
}
