import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';
import { SheetWatch, pairAlone } from './essay-figures.mjs';
import { BODY_RADIUS } from './ink-hollows.mjs';

// twin.ts imports its neighbours as the page does, without an extension.
register('./source-imports.mjs', import.meta.url, {
  data: { root: fileURLToPath(new URL('../..', import.meta.url)) },
});
const { G, PAIRS, deriveFate } = await import('../../src/lib/physics/orbit.ts');
const { NUDGE, nudged, twinRun } = await import('../../src/lib/physics/twin.ts');
const { FramedWindow } = await import('../../src/lib/physics/framing.ts');

/** Of the gaps the twin's run keeps (one every thousand steps), the figure draws each hundredth. */
const GAP_STRIDE = 100;

/** Steps between the looks at the sheet: a body moves a small part of its diameter in ten. */
const SHEET_STRIDE = 10;

/** The bodies on the work's sheet through its recorded window (the primary copy's). */
function sheetOf(window, frame) {
  const watch = new SheetWatch(2 * BODY_RADIUS * frame.height);
  const framed = new FramedWindow(window, frame);
  framed.run(window.steps, SHEET_STRIDE, (step, pixels) => watch.observe(pixels));
  return watch.found;
}

const fateOf = (derived) => ({
  outcome: derived.outcome,
  escaper: derived.escaper,
  ejectionStep: derived.ejectionStep,
  energyBroken: derived.energy.broken ? derived.energy.broken.step : null,
});

/**
 * One work's figures for the essay, from its verified window: the twin one part in a trillion
 * away, as the page's worker follows it; the twin's own fate by the record's test and horizon;
 * each pair taken alone at the window's first step; and, when asked, the work's own fate looked
 * for past the record's horizon.
 */
parentPort.on('message', ({ id, window, frame, fate, beyond }) => {
  try {
    const state = {
      masses: window.masses,
      dt: window.dt,
      positions: window.positions,
      velocities: window.velocities,
    };
    const limits = { steps: window.steps, threshold: fate.escapeThreshold };
    const run = twinRun(window, frame, { horizon: fate.horizonSteps });
    const twin = nudged(window, run.body, run.axis, NUDGE);
    const twinFate = deriveFate(
      { ...state, positions: twin.positions, velocities: twin.velocities },
      { ...limits, horizonSteps: fate.horizonSteps },
    );
    parentPort.postMessage({
      id,
      twin: {
        parted: run.parted,
        doubling: run.doubling,
        until: run.until,
        gapAtWindowEnd: run.gaps[Math.round(window.steps / run.every)],
        // The gap every hundred thousand steps, for the figure: three digits are all it draws.
        gaps: {
          every: run.every * GAP_STRIDE,
          values: Array.from(run.gaps)
            .filter((gap, i) => i % GAP_STRIDE === 0)
            .map((gap) => Number(gap.toPrecision(3))),
        },
      },
      twinFate: fateOf(twinFate),
      pairs: PAIRS.map(([a, b]) => ({
        pair: [a, b],
        ...pairAlone(G, window.masses, window.positions, window.velocities, a, b),
      })),
      sheet: sheetOf(window, frame),
      beyond: beyond ? fateOf(deriveFate(state, { ...limits, horizonSteps: beyond })) : null,
    });
  } catch (failure) {
    parentPort.postMessage({ id, failure: failure.message });
  }
});
