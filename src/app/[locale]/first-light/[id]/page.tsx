import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { workOrbit } from '@/lib/art/orbit-records';
import { workNumber } from '@/lib/art/number';
import { FirstLight, type FirstLightWork } from '@/components/first-light';

type Params = Promise<{ locale: string; id: string }>;

/**
 * First Light's proof (docs/first-light.md §8, F0): one work's still, opened into the orbit that
 * made it and folded back. A work qualifies when the venue holds its Light still, its verified
 * window and a frame that still binds to its film; the proof is kept to the works whose media the
 * venue carries itself.
 */
function performanceOf(id: string): FirstLightWork | undefined {
  if (!/^(?:0|[1-9]\d{0,2})$/.test(id)) return undefined;
  const number = Number(id);
  const work = getCuratedArtwork(number);
  const light = work && getInterpretation(work, 'light');
  const [performed] = performedOrbits([number]);
  const frame = light && plateFrame(number, light);
  const orbit = workOrbit(number);
  if (!light?.rungs?.length || !performed || !frame || !orbit) return undefined;
  return {
    id: number,
    label: workNumber(number),
    alt: '',
    href: '',
    rungs: light.rungs,
    start: performed.window,
    frame,
    closestStep: orbit.published.closestApproach.step,
  };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const performance = performanceOf(id);
  if (!performance) return {};
  const t = messages(locale);
  return {
    ...metadata(
      locale,
      `/first-light/${performance.id}`,
      `${t.firstLightTitle} · ${performance.label}`,
      t.firstLightComputed,
      null,
    ),
    // A proof for the owner, not yet a room of the venue.
    robots: { index: false, follow: false },
  };
}

export default async function FirstLightPage({ params }: { params: Params }) {
  // Asked for, never prerendered: a proof page for a handful of works.
  await connection();
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const performance = performanceOf(id);
  if (!performance) notFound();
  const t = messages(locale);
  return (
    <main id="main">
      <h1 className="sr-only">
        {t.firstLightTitle} · {performance.label}
      </h1>
      <FirstLight
        work={{
          ...performance,
          alt: `${performance.label} · ${t.light}`,
          href: localizedPath(locale, `/art/${performance.id}`),
        }}
        words={{
          skip: t.firstLightSkip,
          watch: t.firstLightWatch,
          again: t.again,
          computed: t.firstLightComputed,
        }}
      />
    </main>
  );
}
