import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { workOrbit } from '@/lib/art/orbit-records';
import type { Comparison } from '@/lib/physics/orbit';
import { pairName } from '@/lib/physics/film-score';
import {
  MEASUREMENTS,
  derivedValue,
  digitsKept,
  energyText,
  exact,
  measurementLabels,
  progressText,
  recordValues,
  seedShort,
  shareText,
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
    expect(pairName([0, 2])).toBe('1–3');
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

describe('the energy the computation kept, in words', () => {
  const steps = 1_000_000;
  const held = { first: -2142.89, windowChange: 2.1e-13, change: 2.1e-13, broken: null };

  it('counts the digits a quantity kept, and sets a share as a percentage', () => {
    expect([0, 2.1e-13, 8.9e-10, 1.6e-4, 0.575, 13].map(digitsKept)).toEqual([15, 12, 9, 3, 0, 0]);
    expect([0.0076, 0.575, 7.8, 1990].map((share) => shareText(share, 'en'))).toEqual([
      '0.76%',
      '58%',
      '780%',
      '200,000%',
    ]);
  });

  it('says how far the energy held through the window when it never broke', () => {
    expect(energyText(held, steps, en, english)).toBe(
      'As computed here, the energy holds to 12 digits through the recorded window.',
    );
    expect(energyText(held, steps, ja, new Intl.NumberFormat('ja'))).toBe(
      'ここでの計算では、記録された時間を通じてエネルギーは 12 桁まで保たれています。',
    );
  });

  it('adds where it broke past the window, with the pass that broke it', () => {
    const later = {
      ...held,
      change: 13,
      broken: { step: 1_535_000, change: 7.846, closest: 0.11436 },
    };
    expect(energyText(later, steps, en, english)).toBe(
      'As computed here, the energy holds to 12 digits through the recorded window. Near step 1,535,000 two bodies pass 0.11 apart, closer than the computation’s fixed step can follow, and its energy changes by 780%. Gravity keeps energy constant, so past that step this is the computation, not an orbit.',
    );
  });

  it('says only the break when it lies inside the window', () => {
    const inside = {
      first: -1652.74,
      windowChange: 0.5753,
      change: 0.5753,
      broken: { step: 44_000, change: 0.5753, closest: 0.18505 },
    };
    expect(energyText(inside, steps, en, english)).toBe(
      'Near step 44,000 two bodies pass 0.19 apart, closer than the computation’s fixed step can follow, and its energy changes by 58%. Gravity keeps energy constant, so past that step this is the computation, not an orbit.',
    );
  });
});
