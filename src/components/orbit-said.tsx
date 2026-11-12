'use client';
import { Fragment, type ReactNode, type RefObject } from 'react';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { Word } from './orbit-word';
import styles from './orbit-score.module.css';

/**
 * What happened: each sentence a box of its own, so a line breaks between two before it
 * breaks inside one.
 */
export function Sentences({ said, t }: { said: readonly string[]; t: Messages }) {
  /** What stands between two sentences on one line: a space, or nothing in Japanese and Chinese. */
  const between = fill(t.sentences, { first: '', second: '' });
  return said.map((sentence, index) => (
    <Fragment key={sentence}>
      {index ? between : null}
      <span className={styles.sentence}>{sentence}</span>
    </Fragment>
  ));
}

/** Everything that can come to stand in the line's room past the frame. */
interface Room {
  /** The visitor is asked whom to stay with here: the question over its answers stands first. */
  asks: boolean;
  /** What happened in each picture the visitor may be in. */
  tellings: readonly { kept: number | null; said: readonly string[] }[];
  /** The longest line a performance can say here. */
  longestLine: string;
}

/**
 * The line beneath the picture, in its room: what is happening now, the question with its
 * answers under it, or what happened.
 */
export function OrbitSaid({
  telling,
  t,
  line,
  read,
  live,
  onStay,
  onPoint,
  room,
}: {
  /** The line itself: the section hands it the focus when a word the focus stood on goes. */
  telling: RefObject<HTMLParagraphElement | null>;
  t: Messages;
  line: ReactNode;
  /** The question and what is told are read, in the book face; the running line is metered. */
  read: boolean;
  /** Said aloud as it changes. */
  live: boolean;
  /** The visitor's answer, while they are asked: one of the three, or (null) the frame. */
  onStay: ((body: number | null) => void) | null;
  /** The focus, or a mouse, has come to a body's answer or left it. */
  onPoint: (by: 'focus' | 'mouse', body: number | null) => void;
  /** None at the frame: the line keeps its own room there. */
  room: Room | null;
}) {
  return (
    <div className={styles.said}>
      <div className={styles.shown}>
        {/* Past the frame the line is said aloud once the performance is over: what
          happened, to a visitor who cannot see the picture empty. It is made live for
          the rest before it, while it stands empty. While the performance runs it
          changes four times a second, and is not; but where nothing plays it changes
          only when the visitor steps it with Further on, and each step is said. The
          question is said by the focus it is given. */}
        <p
          ref={telling}
          id="orbit-said"
          className={read ? `${styles.readout} ${styles.book}` : styles.readout}
          tabIndex={-1}
          aria-live={live ? 'polite' : undefined}
        >
          {line}
        </p>
        {onStay ? (
          // In the order of the question: one of the three, by the number it bears in the
          // picture and in the record, or the frame. Pointing at a number rings its body.
          <div className={styles.answers} role="group" aria-labelledby="orbit-said">
            {[0, 1, 2].map((body) => (
              <Word
                key={`stay-${body}`}
                label={String(body + 1)}
                name={fill(t.beyondStayBody, { body: body + 1 })}
                onClick={() => onStay(body)}
                onPoint={(by, on) => onPoint(by, on ? body : null)}
              />
            ))}
            <Word
              key="stay-frame"
              label={t.beyondFrame}
              name={t.beyondStayFrame}
              onClick={() => onStay(null)}
            />
          </div>
        ) : null}
      </div>
      {/* The room: everything that can come to stand here, laid out unseen in the same
        place. Whatever the language and the width, the line's room is that of the
        longest of them from the first, and nothing beneath it moves. */}
      {room ? (
        <>
          {room.asks ? (
            // The question over its answers: what stands here first, and goes.
            <div className={styles.fit} aria-hidden="true">
              <p className={`${styles.readout} ${styles.book}`}>{t.beyondAsk}</p>
              <div className={styles.answers}>
                {['1', '2', '3', t.beyondFrame].map((label) => (
                  <span key={label} className={styles.again}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {room.tellings.map(({ kept, said }) => (
            <p
              key={kept ?? 'frame'}
              className={`${styles.readout} ${styles.book} ${styles.fit}`}
              aria-hidden="true"
            >
              <Sentences said={said} t={t} />
            </p>
          ))}
          <p className={`${styles.readout} ${styles.fit}`} aria-hidden="true">
            {room.longestLine}
          </p>
        </>
      ) : null}
    </div>
  );
}
