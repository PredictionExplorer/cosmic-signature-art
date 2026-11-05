import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit } from '@/lib/art/orbit-records';
import type { Comparison } from '@/lib/physics/orbit';
import {
  MEASUREMENTS,
  derivedValue,
  exact,
  measurementLabels,
  pairWords,
  progressText,
  recordValues,
  seedShort,
  verdict,
} from './orbit-proof';

const en = messages('en');
const ja = messages('ja');
const calm = workOrbit(31)!;
const ejecting = workOrbit(54)!;
const english = new Intl.NumberFormat('en');

const row = (exactly: boolean, derived = '1'): Comparison => ({
  key: 'totalEnergy',
  derived,
  published: '1',
  exact: exactly,
});

describe('the proof, in words', () => {
  it('sets doubles in full with a true minus, pairs as a reader counts, and the seed short', () => {
    expect(exact(-2142.8907060284882)).toBe('−2142.8907060284882');
    expect(exact(124.96327743951707)).toBe('124.96327743951707');
    expect(pairWords([0, 2])).toBe('1–3');
    expect(seedShort(calm.generation.seed)).toBe('0x4a0d…f5b5');
  });

  it('labels every measurement, in the order the proof prints them, the fate last', () => {
    const labels = measurementLabels(en);
    expect(Object.keys(labels)).toEqual([...MEASUREMENTS]);
    expect(MEASUREMENTS.at(-1)).toBe('fate');
    expect(labels.mass2).toBe('Mass of body 2');
    expect(measurementLabels(ja).mass2).toBe('天体 2 の質量');
  });

  it('states the record as published, counts in the reader’s digits', () => {
    const record = recordValues(calm, en, english);
    expect(record).toMatchObject({
      mass1: '130.67371638058603',
      totalEnergy: '−2142.8907060284882',
      angularMomentum: '45072.95196766655',
      closestDistance: '80.20379580764032',
      closestWhere: 'bodies 1–3 · step 255,842',
      syzygies: '0',
      braidCrossings: '25',
      fate: 'bound through 8,000,000 steps',
    });
    expect(record.braidWord).toBe(calm.published.braid.word);
    expect(recordValues(ejecting, en, english).fate).toBe('body 2 escapes at step 1,090,000');
    expect(recordValues(ejecting, ja, new Intl.NumberFormat('ja')).fate).toBe(
      '天体 2 が第 1,090,000 ステップで脱出',
    );
  });

  it('marks a word truncated by the record as continuing', () => {
    const truncated = {
      ...calm,
      published: { ...calm.published, braid: { ...calm.published.braid, truncated: true } },
    };
    expect(recordValues(truncated, en, english).braidWord).toBe(`${calm.published.braid.word} …`);
  });

  it('narrates each phase of the derivation', () => {
    const narrate = (phase: 'beginnings' | 'warm-up' | 'window' | 'braid') =>
      progressText({ phase, done: 2_500, total: 77_741 }, calm.generation, en, english);
    expect(narrate('beginnings')).toBe('Reading the seed · candidate 2,500 of 77,741');
    expect(narrate('warm-up')).toBe('Candidate 77,741 in motion · warm-up step 2,500 of 77,741');
    expect(narrate('window')).toBe('The recorded window · step 2,500 of 77,741');
    expect(narrate('braid')).toBe('Following the crossings · step 2,500 of 77,741');
  });

  it('gives a differing value its true minus, and a verdict for the rows checked', () => {
    expect(derivedValue(row(false, '-2142.89'), en)).toBe('here: −2142.89');
    expect(verdict([row(true), row(true)], en)).toBe(en.orbitAllExact);
    expect(verdict([row(true), row(false), row(false)], en)).toBe(
      '2 of 3 measurements differ from the published record.',
    );
  });
});
