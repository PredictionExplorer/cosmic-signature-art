import type { ArtInterpretation, Artwork } from './types';

/**
 * What a view needs of a work's media, and nothing more. A server page hands a client
 * component every derivative the registries attached (the clips, the ladder, the detail
 * windows, the complete films' records); a card in the collection's sequence or the home's
 * spread shows a still, offers the ladder its width can select, and may play its excerpt or
 * settling clip under the lease, so everything else only weighs the payload down.
 *
 * - `card`: a browsing plate. Keeps the still, the preview, the ladder and the Ink motion
 *   it may play; drops the complete films, the opening clip, the master and the loupe's
 *   windows.
 * - `still`: a plate that never moves (a Light view, a hang's leaf, a spread without the
 *   lease). Keeps the images and the ladder only.
 */
export type MediaView = 'card' | 'still';

export function mediaForView(media: ArtInterpretation, view: MediaView): ArtInterpretation {
  const trimmed: ArtInterpretation = {
    id: media.id,
    label: media.label,
    still: media.still,
    thumbnail: media.thumbnail,
    thumbnailWidth: media.thumbnailWidth,
    thumbnailHeight: media.thumbnailHeight,
    stillSha256: media.stillSha256,
    width: media.width,
    height: media.height,
    films: [],
    source: media.source,
    availability: media.availability,
  };
  if (media.rungs) trimmed.rungs = media.rungs;
  if (view === 'card' && media.id === 'ink') {
    if (media.previewFilm) trimmed.previewFilm = media.previewFilm;
    if (media.settlingFilm) trimmed.settlingFilm = media.settlingFilm;
  }
  return trimmed;
}

/** The work with each interpretation cut to the view; identity and provenance stay whole. */
export function artworkForView(work: Artwork, view: MediaView): Artwork {
  return { ...work, media: work.media.map((media) => mediaForView(media, view)) };
}
