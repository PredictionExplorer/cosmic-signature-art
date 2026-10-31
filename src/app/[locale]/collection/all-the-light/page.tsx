import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { allTheLight } from '@/lib/art/all-the-light';
import { workNumber } from '@/lib/art/number';
import { AllTheLight, type LightSky } from '@/components/all-the-light';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  const sky = allTheLight();
  // The card is a published still, never the sky: a derived view is not shared as a work.
  return metadata(
    locale,
    '/collection/all-the-light',
    t.allTheLight,
    fill(t.allTheLightLine, { count: sky?.works.length ?? 0 }),
  );
}

/**
 * All the light: the collection's Light stills added as light adds, a derived view. The page
 * hands the browser the skies built offline, each work's own Light still, and the naming grid.
 */
export default async function AllTheLightPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sky = allTheLight();
  if (!sky) notFound();
  const t = messages(locale);
  const number = new Intl.NumberFormat(locale);
  const first = sky.skies[0].upTo;
  const skies: LightSky[] = sky.skies.map((entry) => {
    const option =
      entry.upTo === first
        ? `${t.cycle} ${entry.upTo}`
        : fill(t.cyclesSpan, { first, last: entry.upTo });
    const count = number.format(sky.works.filter((work) => work.cycle <= entry.upTo).length);
    return {
      ...entry,
      option,
      label: fill(t.allTheLightSky, { span: option, count }),
      alt: fill(t.allTheLightAlt, { span: option, count }),
    };
  });
  return (
    <main id="main">
      <AllTheLight
        works={sky.works.map((work) => ({
          id: work.id,
          cycle: work.cycle,
          numeral: workNumber(work.id),
          href: localizedPath(locale, `/art/${work.id}?expression=light`),
          src: work.still,
          srcSet: work.srcSet,
        }))}
        skies={skies}
        grid={sky.grid}
        labels={{
          title: t.allTheLight,
          line: fill(t.allTheLightLine, { count: number.format(sky.works.length) }),
          note: t.allTheLightNote,
          point: t.allTheLightPoint,
          through: t.allTheLightThrough,
          none: t.allTheLightNone,
          alone: t.allTheLightAlone,
          back: t.allTheLightReturn,
          visit: t.allTheLightVisit,
          showAlone: t.allTheLightShowAlone,
          cycles: t.allTheLightCycles,
          replay: t.allTheLightReplay,
          orbits: t.allTheLightOrbits,
          cycle: t.cycle,
          light: t.light,
        }}
      />
    </main>
  );
}
