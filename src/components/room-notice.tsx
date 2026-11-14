import type { ArtFilm, Artwork } from '@/lib/art/types';
import { ART_HEIGHT, ART_WIDTH } from '@/lib/art/constants';
import { workFolio } from '@/lib/art/number';
import { clock, fill } from '@/lib/i18n/format';
import styles from './artwork-room.module.css';
import type { RoomNoticeWords } from './room-notice.words';

/*
  The room's notice is the one line beneath the strip: a lens's label, a status, the loupe's
  readout. On a phone that line is longer than the screen is wide, so it wraps, and nothing of
  it is ever cut: "Analysis, not the work" least of all. A line that wraps is a taller line,
  though, and a notice that grew as a lens came on would move the work above it.

  So the room for every line is there before the line is. Beneath what the notice says lie,
  unseen, the lines it may come to say in this room, each wrapped as it would be at this width,
  in this language, in this font. The notice is as tall as the tallest of them, always. Nothing
  is counted and no screen size is named: where every line fits on one row, the notice is the
  one row it has always been.
*/

/** Between the parts of a line. The dot stays with the words before it when the line wraps. */
export const NOTICE_JOIN = '\u00a0· ';

/** One line of the notice: its parts, in order, with nothing for a part that is not said. */
export function noticeWords(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(NOTICE_JOIN);
}

/**
 * A line the notice may come to say, and what stands after it: the When lens's ramp, or a word
 * to press (with the muted figures that follow it).
 */
export type NoticeLine = { words: string; ramp?: boolean; press?: { word: string; meta: string } };

/**
 * Every line the notice of this room may come to say, the longest readings of each. The words
 * a visitor cannot meet here are left out, so a room without a lens holds no room for one.
 *
 * The list is whole on the room's first render and stays as it is while the room is open: a
 * line added a moment later would move the work as the Expansion lands. So it asks nothing a
 * browser answers only after mounting, such as whether fullscreen can be granted.
 *
 * Two things are left to make their own room when they come: a failure said while a lens is on
 * (the Turn failed, fullscreen was refused), and "Try again" after a still or a film has
 * failed, whose word is 44 px tall. Holding room for them would take it from the work on every
 * screen, always, for a line few visitors will meet; when one comes, the notice grows by it.
 */
export function noticeLines({
  artwork,
  t,
  derivedViews,
  constrained,
  isStudy,
  numbers,
}: {
  artwork: Artwork;
  t: RoomNoticeWords;
  /** The lenses are offered in this room (never on a sale surface). */
  derivedViews: boolean;
  /** On a constrained connection a long study waits for a word. */
  constrained: boolean;
  /** Which films are the long studies is the room's to say. */
  isStudy: (film: ArtFilm) => boolean;
  numbers: Intl.NumberFormat;
}): NoticeLine[] {
  const lines = new Map<string, NoticeLine>();
  const add = (words: string, ramp = false, press?: NoticeLine['press']) =>
    lines.set(`${words}:${ramp}:${press?.meta ?? ''}`, { words, ramp, press });
  // A lens keeps its line through a Turn: the line it says while the other expression opens.
  const lens = (caption: string, ramp = false) => {
    add(noticeWords(t.analysisNotWork, caption), ramp);
    if (artwork.media.length > 1)
      add(noticeWords(t.analysisNotWork, caption, t.preparingExpression), ramp);
  };

  add(t.preparingExpression);
  add(t.expressionFailed);
  add(t.mediaUnavailable);
  add(t.fullScreenUnavailable);
  for (const media of artwork.media) {
    if (media.films.length) add(t.loadingFilm);
    for (const film of media.films.filter(isStudy)) {
      add(noticeWords(t.slowRoom, fill(t.elapsed, { time: clock(0) })));
      // On a constrained connection a study waits for a word: the sentence, and the word's row.
      if (constrained)
        add(t.studyWaits, false, {
          word: t.playAnyway,
          meta: film.durationSeconds
            ? fill(t.durationSeconds, { n: Math.round(film.durationSeconds) })
            : '',
        });
    }
    if (media.still) {
      // The loupe's readout at its widest: the far corner of the plate, at the widest scale.
      const across = numbers.format(media.width ?? ART_WIDTH);
      const down = numbers.format(media.height ?? ART_HEIGHT);
      add(
        fill(t.detailOf, {
          n: workFolio(artwork.id),
          scale: fill(t.scaleReadout, { ratio: numbers.format(88.8) }),
          x: `${across}–${across}`,
          y: `${down}–${down}`,
        }),
      );
    }
    if (!derivedViews) continue;
    if (media.arrival && media.rungs?.length) {
      lens(media.id === 'light' ? t.whenLight : t.whenInk, true);
      add(t.whenUnavailable);
    }
    if (media.id === 'light' && media.films.some((film) => film.id === 'sweep')) {
      lens(t.wavelengthCaption);
      lens(t.wavelengthLoading);
      add(t.wavelengthUnavailable);
    }
  }
  return [...lines.values()];
}

/**
 * The space between a line's words and what stands after them: the ramp, or a word to press.
 * It is a space, so where the line wraps there it takes no room at either end.
 */
export function Apart() {
  return <span className={styles.apart}> </span>;
}

/** The When lens's stated ramp, first to last, after its line. */
export function WhenRamp({ first, last }: { first: string; last: string }) {
  return (
    <>
      <Apart />
      <span className={styles.whenScale} aria-hidden="true">
        {first}
        <i />
        {last}
      </span>
    </>
  );
}

/**
 * The room held for the notice's lines. Their words are drawn from attributes, so the page
 * holds each sentence once: nothing here is read out, found by a search, or selected.
 */
export function NoticeRoom({
  lines,
  first,
  last,
}: {
  lines: readonly NoticeLine[];
  first: string;
  last: string;
}) {
  return (
    <div className={styles.held} aria-hidden="true" data-notice-room="">
      {lines.map((line) => (
        <span key={`${line.words}:${line.ramp}:${line.press?.meta ?? ''}`} data-line={line.words}>
          {line.ramp ? (
            <>
              <Apart />
              <span className={styles.whenScale} data-first={first} data-last={last}>
                <i />
              </span>
            </>
          ) : null}
          {line.press ? (
            <>
              <Apart />
              <span
                className={styles.word}
                data-line={line.press.meta ? `${line.press.word} · ` : line.press.word}
              >
                <span className={styles.meta} data-line={line.press.meta} />
              </span>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}
