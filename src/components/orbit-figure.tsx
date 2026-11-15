'use client';
import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { PlateStill } from '@/lib/art/orbit-plate';
import type { PlateFrame } from '@/lib/physics/framing';
import type { PlateSpace } from '@/lib/first-light/samples';
import { pairName } from '@/lib/physics/film-score';
import { lightFilmSeconds } from '@/lib/physics/light-film';
import type { Material } from './orbit-picture';
import { Answers } from './orbit-said';
import { OrbitSculpture, type Sculpture } from './orbit-sculpture';
import styles from './orbit-score.module.css';

/** The plate's still is laid out at the figure's width: the full width on a phone. */
const STILL_SIZES = '(max-width: 860px) 100vw, 62vw';

/** A pointer on the picture, while the visitor chooses a body in it (orbit-choosing.ts). */
export interface StageHand {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
}

/**
 * The question at the frame, where the film runs on into it (docs/after-the-frame.md §8.7):
 * on a plate whose picture draws the bodies where they were. Its room under the picture is kept
 * from the first, whether or not it is ever asked.
 */
export interface FrameQuestion {
  /** It stands now. */
  asking: boolean;
  /** It is said aloud as it comes: its own place, the caption, is in sight. */
  said: boolean;
  /** It came by the film's clock, and not by the visitor's hand on the slider. */
  byClock: boolean;
  /** The visitor's answer: one of the three, or (null) the frame. */
  onStay: (body: number | null) => void;
  /** The focus, or a mouse, has come to a body's answer or left it. */
  onPoint: (by: 'focus' | 'mouse', body: number | null) => void;
}

/**
 * The picture and its caption: the stage with the work's still, the orbit in depth while it
 * can be turned, and the layers the drawing is made on.
 */
export function OrbitFigure({
  stage,
  trails,
  continued,
  marks,
  names,
  sculpture,
  orbit,
  t,
  oneDecimal,
  number,
  on,
  near,
  space,
  still,
  act,
  labelled,
  hand,
  aimed,
  onTurned,
  onPlayPause,
  question,
  answers,
  captionCell,
}: {
  /** The stage: the section measures it, draws on its layers and finds a pointer's place in it. */
  stage: RefObject<HTMLDivElement | null>;
  /** The picture's four layers, drawn on by the section: each lies over the still. */
  trails: RefObject<HTMLCanvasElement | null>;
  continued: RefObject<HTMLCanvasElement | null>;
  marks: RefObject<HTMLCanvasElement | null>;
  /** The bodies' numbers while the visitor chooses among them. */
  names: RefObject<HTMLCanvasElement | null>;
  /** Where the section reaches the orbit in depth. */
  sculpture: RefObject<Sculpture | null>;
  orbit: WorkOrbit;
  t: Messages;
  oneDecimal: Intl.NumberFormat;
  number: Intl.NumberFormat;
  /** The plate the drawing lies over: its frame, and its still in the material on view. None in the plane. */
  on: { frame: PlateFrame; still: PlateStill; material: Material } | null;
  near: boolean;
  /** The derived window in depth, where it can be turned. */
  space: PlateSpace | null | undefined;
  still: boolean;
  /** Which act stands on the stage. */
  act: 'window' | 'beyond' | 'twin';
  /** Past the frame, whether the derived picture stands, and so its label. */
  labelled: boolean;
  /** None unless the visitor is choosing a body. */
  hand: StageHand | null;
  aimed: boolean;
  onTurned: (turned: boolean) => void;
  onPlayPause: () => void;
  /** None where the picture is not the bodies' positions: no body there to stay with. */
  question: FrameQuestion | null;
  /** The question's answers: the section asks whether the focus stands on one as they go. */
  answers: RefObject<HTMLDivElement | null>;
  /** The caption itself: the section watches whether it is in sight. */
  captionCell: RefObject<HTMLElement | null>;
}) {
  /** The orbit can be taken in hand here. */
  const [turnable, setTurnable] = useState(false);
  const plateStill = on?.still ?? null;
  const material = on?.material ?? null;
  const published = orbit.published;
  const closest = published.closestApproach;
  const steps = orbit.generation.steps;
  // The caption says where the bodies are drawn, and, on the plate, that this is analysis.
  const caption = plateStill
    ? material === 'ink'
      ? t.orbitCaptionInk
      : t.orbitCaptionLight
    : t.orbitCaption;
  const description = fill(caption, {
    m1: oneDecimal.format(published.masses[0]),
    m2: oneDecimal.format(published.masses[1]),
    m3: oneDecimal.format(published.masses[2]),
    distance: oneDecimal.format(closest.distance),
    pair: pairName(closest.pair),
    step: number.format(closest.step),
    seconds: oneDecimal.format(lightFilmSeconds(closest.step, steps)),
  });
  /** The question stands under the picture now, in the caption's cell. */
  const asking = act === 'window' && !!question?.asking;
  /**
   * The hint's room is kept on every plate at the frame, from the first render, so that its
   * coming, when the engine that turns the orbit is ready, moves nothing beneath it. It is kept
   * where the orbit will never be turned as well (a browser that draws no depth): an empty line
   * under a caption costs less than everything beneath it moving when that is found out.
   */
  const hintRoom = !!plateStill && act === 'window';
  return (
    <figure className={styles.figure}>
      <div
        ref={stage}
        className={styles.stage}
        data-drawing={plateStill ? 'plate' : 'plane'}
        data-material={on?.material}
        data-pick={(hand && aimed) || undefined}
        onPointerDown={hand?.onPointerDown}
        onClick={hand?.onClick}
        onPointerMove={hand?.onPointerMove}
        onPointerLeave={hand?.onPointerLeave}
        style={
          on
            ? ({
                '--plate-aspect': `${on.frame.width} / ${on.frame.height}`,
                '--plate-ratio': on.frame.width / on.frame.height,
                '--plate-ground': on.still.tone,
              } as CSSProperties)
            : undefined
        }
      >
        {/* The work's still, untouched: the drawing lies over it and never alters a pixel. It is
          fetched once the section is a screen away, as its derivation begins, rather than at
          each browser's own lazy margin, which Firefox keeps close to the viewport. */}
        {plateStill ? (
          <img
            key={material}
            className={styles.still}
            src={plateStill.src}
            srcSet={plateStill.srcSet}
            sizes={plateStill.srcSet ? STILL_SIZES : undefined}
            width={plateStill.width}
            height={plateStill.height}
            alt=""
            decoding="async"
            loading={near ? 'eager' : 'lazy'}
            // Past the frame the still is what a pointer meets: a press that slips is not
            // to drag it away.
            draggable={false}
          />
        ) : null}
        {/* The orbit in depth: shown only as the hand turns it, beneath the drawing it replaces. */}
        {plateStill && space && material && act === 'window' ? (
          <OrbitSculpture
            key={`depth-${material}`}
            handle={sculpture}
            stage={stage}
            space={space}
            material={material}
            tone={plateStill.tone}
            colours={plateStill.colours}
            hues={orbit.bodyHues}
            closestStep={orbit.published.closestApproach.step}
            still={still}
            label={t.orbitStageLabel}
            onReady={setTurnable}
            onTurned={onTurned}
            onPlayPause={onPlayPause}
          />
        ) : null}
        <canvas ref={trails} className={styles.layer} data-layer="trails" aria-hidden="true" />
        <canvas
          ref={continued}
          className={styles.layer}
          data-layer="continued"
          aria-hidden="true"
        />
        <canvas ref={marks} className={styles.layer} data-layer="marks" aria-hidden="true" />
        <canvas ref={names} className={styles.layer} data-layer="names" aria-hidden="true" />
      </div>
      {/* Past the frame the caption is the label alone, for as long as the derived picture
        stands: the still that returns is the work, and needs none. Its line is kept. */}
      <figcaption ref={captionCell} className={styles.caption}>
        {act === 'beyond' ? (
          <span className={styles.label} data-shown={labelled} aria-hidden={!labelled}>
            {t.analysisNotWork}
          </span>
        ) : (
          <>
            {/* The caption's account of the window. Where the film has run on into the
              question it gives way to it in sight, and keeps its room and its place for a
              reader who is being read to: nothing is taken from under a screen reader. It
              stands again as soon as the visitor takes the clock back into the record. */}
            <div className={styles.account} data-given-way={asking || undefined}>
              {description}
              {turnable && act === 'window' ? (
                <span className={styles.hint}>
                  <span className={styles.hintPointer}>{t.orbitTurnHint}</span>
                  <span className={styles.hintTouch}>{t.orbitTurnHintTouch}</span>
                </span>
              ) : hintRoom ? (
                // The hint's room, until the orbit can be turned: its words are drawn from
                // attributes, so the page does not hold them before they are true.
                <span className={`${styles.hint} ${styles.hintRoom}`} aria-hidden="true">
                  <span className={styles.hintPointer} data-line={t.orbitTurnHint} />
                  <span className={styles.hintTouch} data-line={t.orbitTurnHintTouch} />
                </span>
              ) : null}
            </div>
            {question && plateStill ? (
              <>
                {/* The question the film runs on into: the label, since the account that
                  carried it has given way; the question, in a paragraph of its own that is
                  live before it has words, so it is said once as it comes and takes no focus
                  to be heard; and its answers. It lies over the account in their one cell, so
                  it takes no pointer until it holds the question: the account beneath it is
                  text to be selected. */}
                <div className={styles.put} data-put={asking || undefined}>
                  {/* The label is for the eye: the account, which a reader still has, says it. */}
                  <span className={styles.label} aria-hidden="true">
                    {asking ? t.analysisNotWork : null}
                  </span>
                  <p
                    id="orbit-ask"
                    className={styles.ask}
                    aria-live={question.said ? 'polite' : undefined}
                  >
                    {asking ? t.beyondAsk : null}
                  </p>
                  {asking ? (
                    <Answers
                      ref={answers}
                      t={t}
                      labelledBy="orbit-ask"
                      onStay={question.onStay}
                      onPoint={question.onPoint}
                      unasked={question.byClock}
                    />
                  ) : null}
                </div>
                {/* Its room, laid out unseen in the same cell from the first: the words are
                  drawn from attributes, so the page holds each of them once. */}
                <div className={styles.askRoom} aria-hidden="true">
                  <span className={styles.label} data-line={t.analysisNotWork} />
                  <p className={styles.ask} data-line={t.beyondAsk} />
                  <div className={styles.answers}>
                    {['1', '2', '3', t.beyondFrame].map((label) => (
                      <span key={label} className={styles.again} data-line={label} />
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </figcaption>
    </figure>
  );
}
