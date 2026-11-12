'use client';
import type { ReactNode, RefObject } from 'react';
import type { Messages } from '@/lib/i18n/en';
import type { BeyondPhase } from './orbit-beyond';
import { Word, WordLink } from './orbit-word';
import styles from './orbit-score.module.css';

/**
 * What the row offers, in each of the section's three acts. A word that is offered only
 * sometimes is given as what it does, or null where it is not offered.
 */
export type Offered =
  | {
      act: 'window';
      /** Play, Pause or Again. */
      clockWord: string;
      onClock: () => void;
      onClosest: () => void;
      /** Back to the generator's view, while the orbit is turned in the hand. */
      onGeneratorView: (() => void) | null;
      onBeyond: (() => void) | null;
      onTwin: (() => void) | null;
    }
  | {
      act: 'beyond';
      phase: BeyondPhase;
      /** Whether Further on would save a wait: it keeps its place, dimmed, where it would not. */
      worthIt: boolean;
      onFurther: () => void;
      onTell: () => void;
      /** Again: not where nothing was performed. */
      onAgain: (() => void) | null;
      onLeave: () => void;
      onTwin: (() => void) | null;
    }
  | {
      act: 'twin';
      onAgain: (() => void) | null;
      onBeyond: (() => void) | null;
      onLeave: () => void;
    };

/*
  The words beside the line, each with a key. A word that stays from one state to the next
  (After the frame and One part in a trillion in all of them; Tell me, which becomes Again)
  stays the same element, so a keyboard that pressed it still stands on it afterwards. That
  holds only while every word is made here, in this one component, as a keyed child of one of
  its two groups: a component of its own for each act would make each word anew.

  They are two groups: the words that come and go with the state, and the two that stay, which
  keep their place whatever stands before them (on a phone, a row of their own). Nothing is
  offered in the rest after a performance.

  The answers to the question are not among them: they stand under the question, in the
  line's own room (orbit-said.tsx), so that no word ever comes to stand where one was just
  pressed.
*/
export function OrbitWords({
  row,
  t,
  offered,
}: {
  /** The row itself: the section measures where it stands, and asks whether the focus is in it. */
  row: RefObject<HTMLDivElement | null>;
  t: Messages;
  /** None until the orbit is derived. */
  offered: Offered | null;
}) {
  const passing: ReactNode[] = [];
  const staying: ReactNode[] = [];
  if (offered?.act === 'beyond') {
    if (offered.phase === 'running') {
      // Further on keeps its place for the whole performance, and is dimmed while it would save
      // nothing: a word that came and went with the clock moved the others from under the hand.
      passing.push(
        <Word
          key="onward"
          label={t.beyondOnward}
          onClick={offered.onFurther}
          disabled={!offered.worthIt}
        />,
        <Word key="main" label={t.beyondTell} onClick={offered.onTell} />,
      );
    } else if (offered.phase === 'told') {
      // Nothing was performed where the path held nothing: there is nothing to perform again.
      if (offered.onAgain)
        passing.push(<Word key="main" label={t.again} onClick={offered.onAgain} />);
      passing.push(<WordLink key="record" label={t.beyondRecord} href="#proof" />);
    }
    if (offered.phase !== 'resting') {
      staying.push(<Word key="after" label={t.afterTheFrame} onClick={offered.onLeave} pressed />);
      if (offered.onTwin)
        staying.push(
          <Word key="twin" label={t.oneInATrillion} onClick={offered.onTwin} pressed={false} />,
        );
    }
  } else if (offered?.act === 'twin') {
    if (offered.onAgain)
      passing.push(<Word key="again" label={t.again} onClick={offered.onAgain} />);
    if (offered.onBeyond)
      staying.push(
        <Word key="after" label={t.afterTheFrame} onClick={offered.onBeyond} pressed={false} />,
      );
    staying.push(<Word key="twin" label={t.oneInATrillion} onClick={offered.onLeave} pressed />);
  } else if (offered) {
    if (offered.onGeneratorView)
      passing.push(
        <Word key="view" label={t.orbitGeneratorView} onClick={offered.onGeneratorView} />,
      );
    passing.push(
      <Word key="clock" label={offered.clockWord} onClick={offered.onClock} />,
      <Word key="closest" label={t.toClosestApproach} onClick={offered.onClosest} />,
    );
    if (offered.onBeyond)
      staying.push(
        <Word key="after" label={t.afterTheFrame} onClick={offered.onBeyond} pressed={false} />,
      );
    if (offered.onTwin)
      staying.push(
        <Word key="twin" label={t.oneInATrillion} onClick={offered.onTwin} pressed={false} />,
      );
  }
  return (
    <div ref={row} className={styles.words}>
      <span className={styles.passing}>{passing}</span>
      <span className={styles.staying}>{staying}</span>
    </div>
  );
}
