import type { ReactNode } from 'react';
import { essayFigures } from '@/lib/art/essay-figures';
import { workNumber } from '@/lib/art/number';
import type { EssayFacts } from '@/lib/essay/facts';
import {
  PLOT,
  clockMarks,
  doublingLine,
  logLine,
  onLogScale,
  pairDrawing,
  plait,
  plaitLengths,
  round,
  type Crossing,
  type Plait,
  type Point,
} from '@/lib/essay/geometry';
import type { FigureName } from '@/lib/essay/structure';
import { clock } from '@/lib/i18n/format';
import { bodyLight, type LightTone } from '@/lib/physics/body-light';
import styles from './essay.module.css';

/*
  The essay's figures. Each is drawn on the server from the essay's registry and the work's
  record, and is still: no script, nothing to wait for. No word stands inside a drawing: the
  caption beneath says what it shows, in the reader's language, so a figure needs no
  translation and its marks never fall below the type floor. The few marks a drawing does
  carry (a body's number, a scale's figures) are set by the page over it, at the folio size
  whatever the drawing's own size.
*/

type Ground = 'night' | 'paper';

/** A body's own published hue, light on night and dark on paper (src/lib/physics/body-light.ts). */
const TONES: Record<Ground, LightTone> = {
  night: { lightness: 0.82, share: 0.9, alpha: 1 },
  paper: { lightness: 0.5, share: 0.9, alpha: 1 },
};

const percent = (share: number) => `${round(share * 100)}%`;
const exponent = (power: number) => `${power < 0 ? '−' : ''}${Math.abs(power)}`;

interface Mark {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** A drawing that keeps its shape at any width, with the page's own marks set over it. */
function Drawing({
  width,
  height,
  marks = [],
  children,
}: {
  width: number;
  height: number;
  marks?: readonly Mark[];
  children: ReactNode;
}) {
  return (
    <div
      className={styles.drawing}
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: width }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${width} ${height}`} focusable="false">
        {children}
      </svg>
      {marks.map(({ x, y, text }) => (
        <span
          key={`${x} ${y}`}
          className={`numeral ${styles.mark}`}
          style={{ left: percent(x / width), top: percent(y / height) }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

/** A body in a drawing: the cube root of its mass sets its size, as its volume would. */
const bodyRadius = (mass: number) => Math.cbrt(mass) * 1.7;

/** Where a body's number stands: beyond the body, on the side away from `from`. */
function beside(body: Point, from: Point, radius: number): Point {
  const [dx, dy] = [body.x - from.x, body.y - from.y];
  const length = Math.hypot(dx, dy);
  const [ux, uy] = length > 1 ? [dx / length, dy / length] : [0, -1];
  return { x: body.x + ux * (radius + 16), y: body.y + uy * (radius + 16) };
}

/** Two of the work's bodies alone, to scale, as they stand at the first frame of its film. */
function PairFigure({ facts, ground }: { facts: EssayFacts; ground: Ground }) {
  const { pair, orbit } = facts;
  const [width, height] = [720, 340];
  const masses = [
    orbit.generation.masses[pair.pair[0]],
    orbit.generation.masses[pair.pair[1]],
  ] as const;
  const drawing = pairDrawing(pair, masses, { width, height, pad: 44 });
  const colours = pair.pair.map((body) => bodyLight(orbit.bodyHues[body], TONES[ground]));
  const radii = masses.map(bodyRadius);
  const [first, second] = drawing.bodies;
  return (
    <Drawing
      width={width}
      height={height}
      marks={drawing.bodies.map((body, index) => ({
        ...beside(body, index === 0 && !pair.bound ? second : drawing.centre, radii[index]),
        text: String(pair.pair[index] + 1),
      }))}
    >
      {drawing.ellipses.map((ellipse, index) => (
        <ellipse key={index} {...ellipse} className={styles.path} stroke={colours[index]} />
      ))}
      {drawing.path ? <path d={drawing.path} className={styles.path} stroke={colours[1]} /> : null}
      <line
        x1={round(first.x)}
        y1={round(first.y)}
        x2={round(second.x)}
        y2={round(second.y)}
        className={styles.hair}
      />
      {pair.bound ? (
        <circle
          cx={round(drawing.centre.x)}
          cy={round(drawing.centre.y)}
          r="3.5"
          className={styles.dot}
        />
      ) : null}
      {drawing.bodies.map((body, index) => (
        <circle
          key={index}
          cx={round(body.x)}
          cy={round(body.y)}
          r={round(radii[index])}
          fill={colours[index]}
        />
      ))}
    </Drawing>
  );
}

const turned = ({ x, y }: Point, about: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  const [dx, dy] = [x - about.x, y - about.y];
  return {
    x: about.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: about.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
};
const corners = (points: readonly Point[]) =>
  points.map(({ x, y }) => `${round(x)},${round(y)}`).join(' ');

/** Euler's line and Lagrange's triangle, each drawn twice: as it stands, and a little turned. */
function ArrangementsFigure() {
  const sizes = [9, 6, 7.5];
  const lineCentre = { x: 190, y: 150 };
  const line = [-128, 6, 122].map((dx) => ({ x: lineCentre.x + dx, y: lineCentre.y }));
  const triangleCentre = { x: 540, y: 162 };
  const triangle = [-90, 150, 30].map((degrees) =>
    turned({ x: triangleCentre.x + 104, y: triangleCentre.y }, triangleCentre, degrees),
  );
  const TURN = -26;
  const sets = [
    { points: line, about: lineCentre, closed: false },
    { points: triangle, about: triangleCentre, closed: true },
  ];
  return (
    <Drawing width={720} height={300}>
      {sets.map(({ points, about, closed }, set) => {
        const ghost = points.map((point) => turned(point, about, TURN));
        const Shape = closed ? 'polygon' : 'polyline';
        return (
          <g key={set}>
            <Shape points={corners(ghost)} className={`${styles.hair} ${styles.dashed}`} />
            <Shape points={corners(points)} className={styles.hair} />
            {ghost.map(({ x, y }, index) => (
              <circle
                key={index}
                cx={round(x)}
                cy={round(y)}
                r={sizes[index]}
                className={styles.ring}
              />
            ))}
            {points.map(({ x, y }, index) => (
              <circle
                key={index}
                cx={round(x)}
                cy={round(y)}
                r={sizes[index]}
                className={styles.dot}
              />
            ))}
            <circle cx={about.x} cy={about.y} r="2.5" className={styles.pivot} />
          </g>
        );
      })}
    </Drawing>
  );
}

/** The numbers a motion needs, as squares: twelve for two bodies, eighteen for three. */
function LedgerFigure() {
  const [size, gap, left] = [30, 8, 22];
  const row = (count: number, top: number) =>
    Array.from({ length: count }, (_unused, index) => (
      <rect
        key={`${top} ${index}`}
        x={left + index * (size + gap)}
        y={top}
        width={size}
        height={size}
        // Ten fixed by what never changes, two more removed, the rest left over.
        className={
          index < 10 ? styles.cellFixed : index < 12 ? styles.cellRemoved : styles.cellLeft
        }
      />
    ));
  return (
    <Drawing width={720} height={124}>
      {row(12, 14)}
      {row(18, 80)}
    </Drawing>
  );
}

/** One push of the integrator's three, as an arrow along the step. */
function Push({ from, to, y }: { from: number; to: number; y: number }) {
  // The head points the way the push runs; the line stops inside it.
  const toward = to > from ? 1 : -1;
  const base = to - toward * 13;
  return (
    <g className={styles.push}>
      <line x1={round(from)} y1={y} x2={round(to - toward * 6)} y2={y} />
      <polygon points={`${round(to)},${y} ${round(base)},${y - 6} ${round(base)},${y + 6}`} />
    </g>
  );
}

/** Yoshida's three pushes within one step: forward, back past the start, forward to its end. */
function PushesFigure() {
  const { w1, w0 } = essayFigures.integrator;
  const [width, height] = [720, 210];
  const [left, right] = [44, 676];
  // The pushes reach from w1 + w0 (before the step's start) to w1 (past its end).
  const x = (t: number) => left + ((t - (w1 + w0)) / -w0) * (right - left);
  const rows = [52, 100, 148];
  const stops = [0, w1, w1 + w0, 1].map(x);
  return (
    <Drawing
      width={width}
      height={height}
      marks={[
        { x: x(0), y: 194, text: '0' },
        { x: x(1), y: 194, text: '1' },
      ]}
    >
      {[0, 1].map((t) => (
        <line
          key={t}
          x1={round(x(t))}
          y1="22"
          x2={round(x(t))}
          y2="176"
          className={`${styles.hair} ${styles.dashed}`}
        />
      ))}
      <line
        x1={round(stops[1])}
        y1={rows[0]}
        x2={round(stops[1])}
        y2={rows[1]}
        className={styles.hair}
      />
      <line
        x1={round(stops[2])}
        y1={rows[1]}
        x2={round(stops[2])}
        y2={rows[2]}
        className={styles.hair}
      />
      <Push from={stops[0]} to={stops[1]} y={rows[0]} />
      <Push from={stops[1]} to={stops[2]} y={rows[1]} />
      <Push from={stops[2]} to={stops[3]} y={rows[2]} />
    </Drawing>
  );
}

interface FootMark {
  /** Where along the plot, from its left edge (0) to its right (1). */
  readonly at: number;
  readonly text: string;
}
interface Note extends FootMark {
  /** How far up the plot, from its foot (0) to its head (1). */
  readonly up: number;
  /** Where the note stands: above its point and ending at it, or below it and beginning there. */
  readonly side: 'above' | 'below';
}

/**
 * A chart on a scale of powers of ten. The plot stretches to the page's own shape with its
 * lines kept hair-thin; the scale's figures and the notes are the page's type, laid beside it.
 */
function Chart({
  low,
  high,
  foot,
  band,
  notes = [],
  children,
}: {
  /** The powers of ten at the plot's foot and head; a mark stands at every third. */
  low: number;
  high: number;
  foot: readonly FootMark[];
  /** The shaded band's right edge, from 0 to 1. */
  band: number;
  notes?: readonly Note[];
  children: ReactNode;
}) {
  const powers: number[] = [];
  for (let power = Math.ceil(low / 3) * 3; power <= high; power += 3) powers.push(power);
  const up = (power: number) => (power - low) / (high - low);
  return (
    <div className={styles.chart} aria-hidden="true">
      <div className={styles.side}>
        {powers.map((power) => (
          <span key={power} className="numeral" style={{ top: percent(1 - up(power)) }}>
            {power === 0 ? (
              '1'
            ) : (
              <>
                10<sup>{exponent(power)}</sup>
              </>
            )}
          </span>
        ))}
      </div>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${PLOT} ${PLOT}`} preserveAspectRatio="none" focusable="false">
          <rect className={styles.band} x="0" y="0" width={round(band * PLOT)} height={PLOT} />
          {powers.map((power) => (
            <line
              key={power}
              x1="0"
              x2={PLOT}
              y1={round((1 - up(power)) * PLOT)}
              y2={round((1 - up(power)) * PLOT)}
              className={styles.grid}
            />
          ))}
          {children}
        </svg>
        {notes.map(({ at, up: height, text, side }) => (
          <span
            key={text}
            className={styles.tag}
            data-side={side}
            style={{ left: percent(at), top: percent(1 - height) }}
          >
            {text}
          </span>
        ))}
      </div>
      <div className={styles.foot}>
        {foot.map(({ at, text }) => (
          <span
            key={text}
            className="numeral"
            data-edge={at > 0.9 ? 'end' : at < 0.04 ? 'start' : undefined}
            style={{ left: percent(at) }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The computed energy of two works, to twice the recorded window: one held, one lost. */
function EnergyFigure({ locale }: { locale: string }) {
  const { heldExample, lostExample, heldWithin } = essayFigures.energy;
  const { steps } = essayFigures.clock;
  const [low, high] = [-16, 2];
  const until = heldExample.series.every * heldExample.series.values.length;
  const line = ({ every, values }: typeof heldExample.series) =>
    logLine(
      values.map((value, index) => [((index + 1) * every) / until, value] as const),
      low,
      high,
    );
  const number = new Intl.NumberFormat(locale);
  const limit = round((1 - onLogScale(heldWithin, low, high)) * PLOT);
  const lostPeak = Math.max(...lostExample.series.values);
  return (
    <Chart
      low={low}
      high={high}
      band={steps / until}
      foot={[0, steps, until].map((step) => ({ at: step / until, text: number.format(step) }))}
      notes={[
        {
          at: 1,
          up: onLogScale(heldExample.series.values.at(-1) ?? 0, low, high),
          text: workNumber(heldExample.id),
          side: 'above',
        },
        {
          at: lostExample.step / until,
          up: onLogScale(lostPeak, low, high),
          text: workNumber(lostExample.id),
          side: 'below',
        },
      ]}
    >
      <line
        x1="0"
        x2={PLOT}
        y1={limit}
        y2={limit}
        className={`${styles.series} ${styles.dashed}`}
      />
      <path d={line(heldExample.series)} className={styles.seriesQuiet} />
      <path d={line(lostExample.series)} className={styles.series} />
    </Chart>
  );
}

/** The gap between the work and its twin, on a scale where steady doubling is a straight line. */
function TwinFigure({ facts }: { facts: EssayFacts }) {
  const { gaps, doubling } = facts.work.twin;
  const { steps, film } = essayFigures.clock;
  const [low, high] = [-12, 3];
  const until = gaps.every * (gaps.values.length - 1);
  const steady = doublingLine(gaps, doubling);
  const share = ([step, gap]: readonly [number, number]) => [step / until, gap] as const;
  return (
    <Chart
      low={low}
      high={high}
      band={Math.min(1, steps / until)}
      foot={clockMarks(until / film.stepsPerSecond).map((seconds) => ({
        at: (seconds * film.stepsPerSecond) / until,
        text: clock(seconds),
      }))}
    >
      {steady ? (
        <path
          d={logLine([share(steady.from), share(steady.to)], low, high)}
          className={`${styles.seriesQuiet} ${styles.dashed}`}
        />
      ) : null}
      <path
        d={logLine(
          gaps.values.map((gap, index) => [(index * gaps.every) / until, gap] as const),
          low,
          high,
        )}
        className={styles.series}
      />
    </Chart>
  );
}

/**
 * How each strand is drawn, so that the three are told apart without colour: the first thick,
 * the second a double line, the third thin.
 */
const LOOKS: readonly { width: number; hollow?: number }[] = [
  { width: 3.6 },
  { width: 4.6, hollow: 1.9 },
  { width: 1.5 },
];

function StrandLine({ id, d, colour }: { id: number; d: string; colour?: string }) {
  const { width, hollow } = LOOKS[id];
  return (
    <>
      <path d={d} className={styles.strand} style={{ stroke: colour }} strokeWidth={width} />
      {hollow ? <path d={d} className={styles.hollow} strokeWidth={hollow} /> : null}
    </>
  );
}

/** A plait's strands; where two cross, the one that passes across is drawn again over a gap. */
function Strands({ drawn, colours }: { drawn: Plait; colours?: readonly string[] }) {
  return (
    <>
      {drawn.strands.map(({ id, d }) => (
        <StrandLine key={id} id={id} d={d} colour={colours?.[id]} />
      ))}
      {drawn.over.map(({ id, d }, index) => (
        <g key={index}>
          <path d={d} className={styles.gap} strokeWidth={LOOKS[id].width + 7} />
          <StrandLine id={id} d={d} colour={colours?.[id]} />
        </g>
      ))}
    </>
  );
}

const PIGTAIL: readonly Crossing[] = [1, -2, 1, -2, 1, -2];
const TWIST: readonly Crossing[] = [1, 2, 1, 2, 1, 2];
const BRAID = { x: 20, y: 22, slot: 40, row: 34, lead: 14 } as const;

/** A plait that must stretch a line, a twist that need not, and a patch stretched twice. */
function PlaitsFigure() {
  const { pigtail } = essayFigures.plait;
  const side = 46;
  const tops = [8, 70, 104];
  return (
    <div className={styles.plaits} aria-hidden="true">
      {[PIGTAIL, TWIST].map((word, index) => {
        const drawn = plait(word, [0, 1, 2], BRAID);
        return (
          <Drawing key={index} width={drawn.width} height={BRAID.y * 2 + BRAID.row * 2}>
            <Strands drawn={drawn} />
          </Drawing>
        );
      })}
      <Drawing width={338} height={124}>
        {[1, pigtail, pigtail * pigtail].map((stretch, index) => (
          // Longer by the stretch and thinner by as much: the area is the first patch's.
          <rect
            key={index}
            x="10"
            y={round(tops[index])}
            width={round(side * stretch)}
            height={round(side / stretch)}
            className={styles.patch}
          />
        ))}
      </Drawing>
    </div>
  );
}

/**
 * Crossings to a line of the work's own plait: a phone's width holds twelve, a desk's three
 * times as many. Both are drawn, and the page shows the one its width has room for.
 */
const CROSSINGS_TO_A_LINE = { narrow: 12, wide: 36 } as const;
const SHEET = { x: 24, y: 14, slot: 20, row: 24, lead: 4 } as const;

/** The work's three bodies on its Ink sheet as three strands through its film, line after line. */
function SheetFigure({ facts, ground }: { facts: EssayFacts; ground: Ground }) {
  const { word, startOrder } = facts.work.sheet;
  const colours = facts.orbit.bodyHues.map((hue) => bodyLight(hue, TONES[ground]));
  const height = SHEET.y * 2 + SHEET.row * 2;
  return (
    <div aria-hidden="true">
      {(['narrow', 'wide'] as const).map((width) => {
        const lines = plaitLengths(word, startOrder, CROSSINGS_TO_A_LINE[width], SHEET);
        return (
          <div key={width} className={styles.lines} data-lines={width}>
            {lines.map((drawn, index) => {
              // The bodies on each row where this line begins: where the last one ended.
              const rows = index ? lines[index - 1].order : startOrder;
              return (
                <svg
                  key={index}
                  width={drawn.width}
                  height={height}
                  viewBox={`0 0 ${drawn.width} ${height}`}
                  focusable="false"
                >
                  {rows.map((id, row) => (
                    <text
                      key={id}
                      x="0"
                      y={SHEET.y + row * SHEET.row + 4}
                      className={styles.rowMark}
                    >
                      {id + 1}
                    </text>
                  ))}
                  <Strands drawn={drawn} colours={colours} />
                </svg>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** The figure a block of the essay names, drawn for the work in hand. */
export function EssayFigure({
  name,
  facts,
  ground,
  locale,
}: {
  name: FigureName;
  facts: EssayFacts;
  ground: Ground;
  locale: string;
}) {
  switch (name) {
    case 'pair':
      return <PairFigure facts={facts} ground={ground} />;
    case 'arrangements':
      return <ArrangementsFigure />;
    case 'ledger':
      return <LedgerFigure />;
    case 'pushes':
      return <PushesFigure />;
    case 'energy':
      return <EnergyFigure locale={locale} />;
    case 'twin':
      return <TwinFigure facts={facts} />;
    case 'plaits':
      return <PlaitsFigure />;
    case 'sheet':
      return <SheetFigure facts={facts} ground={ground} />;
  }
}
