import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata, jsonLd, NFT_ADDRESS, SITE_URL } from '@/lib/site';
import { getArtwork } from '@/lib/art/server';
import { parseArtworkId } from '@/lib/art/validation';
import { getInterpretation } from '@/lib/art/types';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { AuctionPanel } from '@/components/auction-panel';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, `/art/${id}`, `${t.signature} ${id}`, t.workCopy);
}
export default async function ArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const tokenId = parseArtworkId(id);
  if (tokenId === null) notFound();
  const result = await getArtwork(tokenId);
  if (result.status === 'not-found') notFound();
  const t = messages(locale);
  const work = result.artwork;
  if (!work)
    return (
      <main id="main" className="section-wrap empty-state">
        <h1>{t.recordUnavailable}</h1>
        <Link href={localizedPath(locale, '/collection')} className="text-link">
          {t.backAtlas} ↗
        </Link>
      </main>
    );
  const light = getInterpretation(work, 'light');
  const initialStill = (await searchParams).view === 'still';
  return (
    <main id="main" className="work-page section-wrap">
      <div className="work-breadcrumb">
        <Link href={localizedPath(locale, '/collection')}>← {t.backAtlas}</Link>
        <span className="eyebrow">{t.allWorks}</span>
      </div>
      <ArtworkViewer artwork={work} t={t} initialStill={initialStill} />
      <section className="work-caption">
        <div>
          <p className="eyebrow">COSMIC SIGNATURE / № {String(work.id).padStart(3, '0')}</p>
          <h1>
            {t.signature} {work.id}
          </h1>
        </div>
        <div>
          <p>{t.workCopy}</p>
          <a href="#record" className="text-link">
            {t.workRecord} ↗
          </a>
        </div>
      </section>
      {result.notice ? (
        <p className="notice">
          {result.notice === 'media-unavailable' ? t.mediaRecordUnavailable : t.recordUnavailable}
        </p>
      ) : null}
      <AuctionPanel locale={locale} tokenId={work.id} t={t} />
      <section id="record" className="work-record">
        <h2>{t.workRecord}</h2>
        <dl>
          <div>
            <dt>{t.token}</dt>
            <dd>{work.id}</dd>
          </div>
          {work.cycle !== undefined ? (
            <div>
              <dt>{t.cycle}</dt>
              <dd>{work.cycle}</dd>
            </div>
          ) : null}
          {work.seed ? (
            <div className="seed-row">
              <dt>{t.seed}</dt>
              <dd>
                <code>{work.seed}</code>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t.collectionContract}</dt>
            <dd>
              <a
                href={`https://arbiscan.io/token/${NFT_ADDRESS}?a=${work.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.viewChain} ↗
              </a>
            </dd>
          </div>
          {work.owner ? (
            <div>
              <dt>{t.indexedOwner}</dt>
              <dd>
                <code>{work.owner}</code>
                <p>{t.indexedNote}</p>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
      {light?.still ? (
        <section className="work-echo">
          <p className="eyebrow">{t.sameWork}</p>
          <Image
            src={light.still}
            alt={`${t.signature} ${work.id} · ${t.light}`}
            width={light.width ?? 3456}
            height={light.height ?? 2234}
            unoptimized
          />
          <h2>{t.echo}</h2>
        </section>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'VisualArtwork',
            name: `Cosmic Signature ${work.id}`,
            url: `${SITE_URL}${localizedPath(locale, `/art/${work.id}`)}`,
            image: light?.still,
            artform: 'Generative digital art',
            identifier: String(work.id),
          }),
        }}
      />
    </main>
  );
}
