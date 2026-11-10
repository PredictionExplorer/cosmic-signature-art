import { act, render, screen, within } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit, type WorkOrbit } from '@/lib/art/orbit-records';
import {
  compare,
  compareFate,
  type DerivedFate,
  type Progress,
  type Rederivation,
} from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import { OrbitVerifier } from './orbit-verifier';

const t = messages('en');
/** A calm eternal dance, and the work that ejects soonest after its window. */
const orbit = workOrbit(31)!;
const ejecting = workOrbit(54)!;

let workers: FakeWorker[] = [];
let clockNow = 0;

class FakeWorker {
  onmessage: ((event: MessageEvent<OrbitReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: OrbitRequest[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: OrbitRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: OrbitReply, at = clockNow) {
    clockNow = at;
    act(() => this.onmessage?.({ data: message } as MessageEvent<OrbitReply>));
  }
}

beforeEach(() => {
  workers = [];
  clockNow = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(performance, 'now').mockImplementation(() => clockNow);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A derivation that agrees with the record, so the comparison is the real one. */
function derivation(of: WorkOrbit = orbit): Rederivation {
  return {
    masses: [...of.published.masses],
    totalEnergy: of.published.totalEnergy,
    angularMomentum: of.published.angularMomentum,
    closestApproach: {
      distance: of.published.closestApproach.distance,
      pair: [...of.published.closestApproach.pair],
      step: of.published.closestApproach.step,
    },
    syzygies: Array.from({ length: of.published.syzygyCount }, (_, i) => 1_000 * (i + 1)),
    braid: {
      word: of.published.braid.word,
      crossings: of.published.braid.crossings,
      truncated: of.published.braid.truncated,
      events: [],
    },
    profileDraws: 23,
    attempt: 0,
    // One sample: nothing is drawn on this page.
    samples: {
      stride: of.generation.steps,
      count: 1,
      positions: new Float32Array(9),
      separations: new Float32Array(3),
    },
    windowStart: { positions: new Float64Array(9), velocities: new Float64Array(9) },
    milliseconds: { beginnings: 1, orbit: 1 },
  };
}

/** The fate as the record states it, so its comparison is exact. */
function fateOf(of: WorkOrbit): DerivedFate {
  return {
    outcome: of.fate.outcome,
    escaper: of.fate.escaper,
    ejectionStep: of.fate.ejectionStep,
    horizonSteps: of.fate.horizonSteps,
    energy: { first: -1, windowChange: 3e-13, change: 3e-13, broken: null },
    windowEnd: { positions: new Float64Array(9), velocities: new Float64Array(9), watchRun: 0 },
    approach: null,
  };
}

const progress = (phase: Progress['phase'], done: number, total: number): OrbitReply => ({
  type: 'progress',
  progress: { phase, done, total },
});

/** The worker's whole account of № 031: the phases, the measurements, then the fate. */
function derive(of: WorkOrbit = orbit, result = derivation(of), fate = fateOf(of)) {
  const worker = workers[0];
  worker.reply(progress('beginnings', 0, of.generation.selectedIndex), 2);
  worker.reply(progress('beginnings', 2_500, of.generation.selectedIndex), 30);
  worker.reply(progress('warm-up', 0, of.generation.warmupSteps), 120);
  worker.reply(progress('window', 0, of.generation.steps), 450);
  worker.reply(progress('braid', 0, of.generation.steps), 820);
  worker.reply({ type: 'done', result, comparisons: compare(of.published, result) }, 1_100);
  worker.reply({ type: 'fate', fate, comparison: compareFate(of.fate, fate) }, 1_870);
}

const section = (container: HTMLElement) => container.querySelector('section')!;
const lines = () => screen.getAllByRole('listitem').map((item) => item.textContent);
const checks = (word: string) => screen.queryAllByText(word, { selector: 'dd' });

describe('Verify an orbit', () => {
  it('derives nothing before hydration, and begins as soon as it is hydrated', () => {
    const html = renderToString(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    expect(workers).toHaveLength(0);
    expect(html).toContain(t.verifyOrbitWaiting);
    expect(html).toContain('data-phase="waiting"');
    expect(html).not.toContain('0x4a0d…f5b5');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, 'error');
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(container, <OrbitVerifier orbit={orbit} t={t} locale="en" />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(workers).toHaveLength(1);
    expect(section(container)).toHaveAttribute('data-phase', 'deriving');
    expect(container).toHaveTextContent('Seed 0x4a0d…f5b5');
    act(() => root?.unmount());
    expect(workers[0].terminated).toBe(true);
    container.remove();
  });

  it('asks the worker for the whole derivation and the fate, and prints the seed first', () => {
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    expect(workers[0].posted).toEqual([
      {
        generation: orbit.generation,
        published: orbit.published,
        // Nothing is drawn here: one sample of the window, and no bodies kept before an escape.
        stride: 1_000_000,
        fate: { published: orbit.fate, lead: 0 },
      },
    ]);
    expect(lines()).toEqual(['0.0 sSeed 0x4a0d…f5b5']);
    expect(section(container)).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    // The lines are not a live region; only the verdict is.
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-live');
  });

  it('gives each phase a line as it begins, counting on in place and settling once it ends', () => {
    render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    const worker = workers[0];
    worker.reply(progress('beginnings', 0, 77_741), 2);
    worker.reply(progress('beginnings', 2_500, 77_741), 30);
    expect(lines()).toEqual([
      '0.0 sSeed 0x4a0d…f5b5',
      '0.0 sReading the seed · candidate 2,500 of 77,741',
    ]);
    worker.reply(progress('beginnings', 75_000, 77_741), 90);
    worker.reply(progress('warm-up', 0, 1_000_000), 120);
    worker.reply(progress('warm-up', 900_000, 1_000_000), 400);
    expect(lines()).toEqual([
      '0.0 sSeed 0x4a0d…f5b5',
      '0.0 sReading the seed · candidate 77,741 of 77,741',
      '0.1 sCandidate 77,741 in motion · warm-up step 900,000 of 1,000,000',
    ]);
    worker.reply(progress('window', 0, 1_000_000), 450);
    worker.reply(progress('braid', 300_000, 1_000_000), 820);
    expect(lines().slice(2)).toEqual([
      '0.1 sCandidate 77,741 in motion · warm-up step 1,000,000 of 1,000,000',
      '0.5 sThe recorded window · step 1,000,000 of 1,000,000',
      '0.8 sFollowing the crossings · step 300,000 of 1,000,000',
    ]);
    // Nothing is checked yet, so nothing is printed of the record.
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });

  it('prints every measurement as it is checked, the fate last, then the time and the verdict', () => {
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    const worker = workers[0];
    worker.reply(progress('braid', 900_000, 1_000_000), 820);
    const result = derivation();
    worker.reply({ type: 'done', result, comparisons: compare(orbit.published, result) }, 1_100);
    expect(checks(t.orbitExact)).toHaveLength(10);
    expect(screen.queryByText(t.orbitFate)).not.toBeInTheDocument();
    expect(lines().at(-1)).toBe('1.1 sPast the window, for the fate · up to step 8,000,000');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(section(container)).toHaveAttribute('aria-busy', 'true');
    expect(worker.terminated).toBe(false);
    // No way on until the verification ends.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    const fate = fateOf(orbit);
    worker.reply({ type: 'fate', fate, comparison: compareFate(orbit.fate, fate) }, 1_870);
    expect(checks(t.orbitExact)).toHaveLength(11);
    const record = screen.getByRole('heading', { name: t.orbitTableCaption }).nextElementSibling!;
    const terms = within(record as HTMLElement).getAllByRole('term');
    expect(terms.map((term) => term.textContent)).toEqual([
      'Mass of body 1',
      'Mass of body 2',
      'Mass of body 3',
      'Total energy',
      'Angular momentum',
      'Closest approach',
      'Closest approach at',
      'Syzygies',
      'Braid crossings',
      'Braid word',
      'Fate',
    ]);
    expect(container.querySelector('[data-key="totalEnergy"]')).toHaveTextContent(
      'Total energy−2142.8907060284882exact',
    );
    expect(container.querySelector('[data-key="closestWhere"]')).toHaveTextContent(
      'bodies 1–3 · step 255,842',
    );
    expect(container.querySelector('[data-key="fate"]')).toHaveTextContent(
      'Fatebound through 8,000,000 stepsexact',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checked here in 1.9 s. Every measurement is the published record, to the last bit.',
    );
    // And what the record does not publish: whether the computation kept its energy.
    expect(screen.getByRole('status')).toHaveTextContent(
      'As computed here, the energy holds to 12 digits through the recorded window.',
    );
    expect(section(container)).toHaveAttribute('aria-busy', 'false');
    expect(section(container)).toHaveAttribute('data-phase', 'derived');
    expect(section(container)).toHaveAttribute('data-exact', 'true');
    expect(worker.terminated).toBe(true);
    expect(screen.getByRole('link', { name: t.verifyOrbitAnother })).toHaveAttribute(
      'href',
      '/verify/orbit',
    );
    expect(screen.getByRole('link', { name: 'Go to №\u00a0031' })).toHaveAttribute(
      'href',
      '/art/31',
    );
  });

  it('states an escape as the record dates it', () => {
    const { container } = render(<OrbitVerifier orbit={ejecting} t={t} locale="en" />);
    derive(ejecting);
    expect(container.querySelector('[data-key="fate"]')).toHaveTextContent(
      'Fatebody 2 escapes at step 1,090,000exact',
    );
    expect(section(container)).toHaveAttribute('data-exact', 'true');
  });

  it('shows both values when a measurement differs, and says how many do', () => {
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    const result = derivation();
    result.totalEnergy = -2142.89;
    derive(orbit, result);
    expect(checks(t.orbitExact)).toHaveLength(10);
    const row = container.querySelector('[data-key="totalEnergy"]')!;
    expect(row).toHaveAttribute('data-exact', 'false');
    expect(row).toHaveTextContent('−2142.8907060284882here: −2142.89differs');
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 of 11 measurements differ from the published record.',
    );
    expect(section(container)).toHaveAttribute('data-exact', 'false');
  });

  it('keeps what it checked when the fate cannot be reached, and says what it could not check', () => {
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    const worker = workers[0];
    const result = derivation();
    worker.reply({ type: 'done', result, comparisons: compare(orbit.published, result) }, 1_100);
    worker.reply({ type: 'failed', message: 'no' }, 1_400);
    expect(checks(t.orbitExact)).toHaveLength(10);
    expect(container.querySelector('[data-key="fate"]')).toHaveTextContent(
      `Fatebound through 8,000,000 steps${t.verifyOrbitUnchecked}`,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checked here in 1.4 s. 1 of 11 measurements could not be checked in this browser.',
    );
    expect(section(container)).toHaveAttribute('data-exact', 'false');
    expect(worker.terminated).toBe(true);
    expect(screen.getByRole('link', { name: t.verifyOrbitAnother })).toBeVisible();
  });

  it('says plainly when nothing can be derived, and stands the record as published, unchecked', () => {
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    workers[0].reply(progress('beginnings', 0, 77_741), 2);
    act(() => workers[0].onerror?.());
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitUnavailable);
    expect(checks(t.verifyOrbitUnchecked)).toHaveLength(11);
    expect(checks(t.orbitExact)).toHaveLength(0);
    expect(section(container)).toHaveAttribute('data-phase', 'failed');
    expect(section(container)).toHaveAttribute('aria-busy', 'false');
    expect(workers[0].terminated).toBe(true);
    expect(screen.getByRole('link', { name: 'Go to №\u00a0031' })).toBeVisible();
  });

  it('says so in a browser without workers', () => {
    vi.stubGlobal('Worker', undefined);
    const { container } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    expect(screen.getByRole('status')).toHaveTextContent(t.orbitUnavailable);
    expect(section(container)).toHaveAttribute('data-phase', 'failed');
  });

  it('speaks the reader’s language, digits and decimals included', () => {
    const uk = messages('uk');
    render(<OrbitVerifier orbit={orbit} t={uk} locale="uk" />);
    derive();
    expect(lines()[0]).toBe('0,0 сЗерно 0x4a0d…f5b5');
    expect(lines()[1]).toMatch(/^0,0 сЧитаємо зерно · кандидат 77\s741 з 77\s741$/);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Перевірено тут за 1,9 с. ${uk.orbitAllExact}`,
    );
    expect(screen.getByRole('link', { name: uk.verifyOrbitAnother })).toHaveAttribute(
      'href',
      '/uk/verify/orbit',
    );
  });

  it('prints the transcript afresh when its derivation is asked again', () => {
    const { rerender } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    derive();
    expect(lines().length).toBeGreaterThan(1);
    // The page's data refreshed: the same work, a new record object.
    rerender(<OrbitVerifier orbit={{ ...orbit }} t={t} locale="en" />);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(lines()).toEqual(['0.0 sSeed 0x4a0d…f5b5']);
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });

  it('lets the worker go when the visitor leaves', () => {
    const { unmount } = render(<OrbitVerifier orbit={orbit} t={t} locale="en" />);
    unmount();
    expect(workers[0].terminated).toBe(true);
  });
});
