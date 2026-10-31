import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { cycles, indexedAssetUrl, indexedWork } from '@/lib/art/collection-index';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { workNumber } from '@/lib/art/number';
import { Orrery, type OrreryCycle } from '@/components/orrery';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/collection/orrery', t.orreryTitle, t.orreryLine);
}

/**
 * The Orrery: every work's orbit performed at once, hung by cycle. The page hands the browser
 * each window's numbers (about 30 per work) and a link; the worker does the rest.
 */
export default async function OrreryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const month = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hung: OrreryCycle[] = cycles().map((cycle) => ({
    cycle: cycle.cycle,
    heading: cycle.mintedAt
      ? fill(t.orreryCycle, { cycle: cycle.cycle, date: month.format(new Date(cycle.mintedAt)) })
      : `${t.cycle} ${cycle.cycle}`,
    works: performedOrbits([...cycle.ids].sort((a, b) => a - b)).map((orbit) => {
      const work = indexedWork(orbit.id);
      const preview = work?.media?.light?.preview;
      return {
        id: orbit.id,
        numeral: workNumber(orbit.id),
        href: localizedPath(locale, `/art/${orbit.id}`),
        label: fill(t.orreryCell, { work: workNumber(orbit.id) }),
        window: orbit.window,
        hues: orbit.bodyHues,
        plate: work && preview ? indexedAssetUrl(work, preview.path) : undefined,
      };
    }),
  }));
  return (
    <main id="main">
      <Orrery
        cycles={hung}
        title={t.orreryTitle}
        line={t.orreryLine}
        note={t.orreryNote}
        still={t.orreryStill}
        fallback={t.orreryFallback}
      />
    </main>
  );
}
