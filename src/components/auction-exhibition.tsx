'use client';
import Link from 'next/link';
import type { Artwork } from '@/lib/art/types';
import { getInterpretation } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import { CollectionPreview, getCollectionPreviewFilm } from './collection-preview';
import { useCollectionMotion } from './collection-motion';
import { ArtworkTransition } from './artwork-transition';
import styles from './auction-exhibition.module.css';

/** Editorial artwork introduces the collection; only the contract can identify sale lots. */
export function AuctionExhibition({
  work,
  locale,
  t,
}: {
  work: Artwork;
  locale: Locale;
  t: Messages;
}) {
  const media = getInterpretation(work, 'ink') ?? work.media[0];
  const { gridRef, activeId, intent, clearIntent, fail, rest } = useCollectionMotion({
    enabled: true,
    ids: getCollectionPreviewFilm(media) ? [work.id] : [],
  });
  return (
    <div ref={gridRef} className={styles.exhibition} data-auction-exhibition>
      <Link
        href={localizedPath(locale, `/art/${work.id}`)}
        className={styles.artwork}
        data-preview-id={work.id}
        onPointerEnter={(event) => intent(work.id, 'pointer', event.pointerType)}
        onPointerLeave={() => clearIntent(work.id, 'pointer')}
        onFocus={() => intent(work.id, 'focus')}
        onBlur={() => clearIntent(work.id, 'focus')}
        aria-label={`${t.enterWork} · ${t.signature} ${work.id}`}
      >
        <ArtworkTransition artworkId={work.id} interpretationId={media?.id ?? 'ink'} role="preview">
          <CollectionPreview
            media={media}
            alt={`${t.signature} ${work.id}`}
            active={activeId === work.id}
            eager
            artworkId={work.id}
            onEnded={() => rest(work.id)}
            onFailure={(reason) => fail(work.id, reason)}
          />
        </ArtworkTransition>
      </Link>
      <div className={styles.caption}>
        <span>{workNumber(work.id)}</span>
        <span className="eyebrow">{t.auctionEditorial}</span>
      </div>
      <p className={styles.note}>{t.auctionEditorialNote}</p>
    </div>
  );
}
