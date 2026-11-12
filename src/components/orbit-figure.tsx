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
      <figcaption className={styles.caption}>
        {act === 'beyond' ? (
          <span className={styles.label} data-shown={labelled} aria-hidden={!labelled}>
            {t.analysisNotWork}
          </span>
        ) : (
          description
        )}
        {turnable && act === 'window' ? (
          <span className={styles.hint}>
            <span className={styles.hintPointer}>{t.orbitTurnHint}</span>
            <span className={styles.hintTouch}>{t.orbitTurnHintTouch}</span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
