import { describe, expect, it } from 'vitest';
import { messages } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/lib/i18n/routing';
import { lightFilmDuration } from '@/lib/physics/light-film';
import { fateLine, homeLine } from './fate-line';
import { workEnergy } from './orbit-energy';
import { orbitIds, workOrbit } from './orbit-records';
import { DAY_WORK_POOL } from './work-of-the-day';

const en = messages('en');
const line = (id: number, locale: Locale = 'en') =>
  fateLine(workOrbit(id)!, workEnergy(id), messages(locale), locale);
const TOGETHER = 'Three bodies, together for all 1,000,000 steps this work records.';
const STILL =
  'They are still bound to one another at step 8,000,000, where the record stops looking.';
const leaves = (time: string) =>
  `${time} after its film ends, one of them is no longer bound to the other two.`;

/** № 025's record with its ejection dated so many seconds of film after its window. */
function datedAfter(seconds: number) {
  const orbit = workOrbit(25)!;
  const { steps } = orbit.generation;
  const after = Math.round((seconds * steps) / lightFilmDuration(steps));
  return { ...orbit, fate: { ...orbit.fate, ejectionStep: steps + after } };
}

describe('the line under a still, sentence by sentence', () => {
  it('says one of them is no longer bound, and when, where the record dates it and the energy held', () => {
    // № 025: dated 210,000 steps past the window, 6.3 s at the Light film's own pace.
    expect(line(25)).toEqual([TOGETHER, leaves('6.3 seconds')]);
    expect(line(54)).toEqual([TOGETHER, leaves('2.7 seconds')]);
  });

  it('counts a wait of a minute or more in minutes, and never prints sixty seconds', () => {
    // № 035: 3,410,000 steps past the window.
    expect(workOrbit(35)!.fate.ejectionStep).toBe(4_410_000);
    expect(line(35)).toEqual([TOGETHER, leaves('1.7 minutes')]);
    // The minute is where the printed figure turns over, not where the seconds do.
    const said = (seconds: number) => fateLine(datedAfter(seconds), workEnergy(25), en, 'en')![1];
    expect(said(59.94)).toBe(leaves('59.9 seconds'));
    expect(said(59.96)).toBe(leaves('1.0 minutes'));
    expect(said(60.04)).toBe(leaves('1.0 minutes'));
  });

  it('says they are still bound where the record stops looking, and no more than that', () => {
    expect(line(31)).toEqual([TOGETHER, STILL]);
  });

  it('never says for ever, in any of the eight languages', () => {
    // Each language's own words for eternal, for ever and always. The words that only span the
    // recorded steps (ずっと, 始终, 내내, suốt, упродовж усіх) are bounded by the count beside them.
    const forbidden: Record<Locale, RegExp> = {
      en: /eternal|for ever|forever|always/i,
      uk: /вічн|назавжди|завжди/i,
      ja: /永遠|永久|いつまでも|いつも/,
      ko: /영원|언제나|항상/,
      zh: /永远|永恒|总是/,
      'zh-TW': /永遠|永恆|總是/,
      'zh-HK': /永遠|永恆|總是/,
      vi: /vĩnh|mãi mãi|luôn luôn/i,
    };
    for (const locale of locales)
      for (const id of orbitIds())
        expect(line(id, locale)!.join(' '), `${locale} № ${id}`).not.toMatch(forbidden[locale]);
  });

  it('says only what the window shows of a work whose computation lost its energy', () => {
    // № 004's dated ejection is the arithmetic failing; № 022 loses it inside its window; № 068
    // is a dance that loses it before the record stops looking.
    for (const id of [4, 22, 68]) expect(line(id)).toEqual([TOGETHER]);
    // And of a work nobody has measured.
    expect(fateLine(workOrbit(25)!, undefined, en, 'en')).toEqual([TOGETHER]);
  });

  it('says nothing of a record that dates an ejection by its window’s last step', () => {
    const orbit = workOrbit(25)!;
    const { steps } = orbit.generation;
    for (const ejectionStep of [steps - 1, steps])
      expect(
        fateLine({ ...orbit, fate: { ...orbit.fate, ejectionStep } }, workEnergy(25), en, 'en'),
      ).toBeNull();
    // One step later the three were together for all of it.
    expect(
      fateLine(
        { ...orbit, fate: { ...orbit.fate, ejectionStep: steps + 1 } },
        workEnergy(25),
        en,
        'en',
      ),
    ).toEqual([TOGETHER, leaves('0.0 seconds')]);
  });

  it('gives each of the 72 works its line: 27 are parted, 30 still bound, 15 say less', () => {
    const lines = orbitIds().map((id) => line(id)!);
    expect(lines).toHaveLength(72);
    for (const sentences of lines) expect(sentences[0]).toBe(TOGETHER);
    const second = lines.map((sentences) => sentences[1]);
    expect(
      second.filter((text) => text?.endsWith('no longer bound to the other two.')),
    ).toHaveLength(27);
    expect(second.filter((text) => text === STILL)).toHaveLength(30);
    expect(second.filter((text) => text === undefined)).toHaveLength(15);
    expect(lines.every((sentences) => sentences.length <= 2)).toBe(true);
  });

  it('carries each number into every language, in the reader’s own digits', () => {
    for (const locale of locales) {
      const number = new Intl.NumberFormat(locale);
      const tenth = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 });
      // № 025 waits in seconds, № 035 in minutes, № 031 is still bound at the horizon.
      const [together, parted] = line(25, locale)!;
      expect(together).toContain(number.format(1_000_000));
      expect(parted).toContain(tenth.format(6.3));
      expect(line(35, locale)![1]).toContain(tenth.format(1.7));
      expect(line(31, locale)![1]).toContain(number.format(8_000_000));
      for (const id of orbitIds())
        for (const text of line(id, locale)!) expect(text).not.toMatch(/[{}]/);
    }
    // Ukrainian groups its digits with no-break spaces and takes the genitive after a decimal.
    expect(line(25, 'uk')).toEqual([
      'Три тіла, разом упродовж усіх 1\u00a0000\u00a0000 кроків, які записує цей твір.',
      'Через 6,3 секунди після кінця фільму одне з них уже не зв’язане з двома іншими.',
    ]);
    expect(line(25, 'ja')).toEqual([
      '三つの天体は、この作品が記録する 1,000,000 ステップのあいだ、ずっと共にあります。',
      '映像が終わって 6.3 秒後、そのうちのひとつは、もう他の二つに束縛されていません。',
    ]);
  });
});

describe('the home’s line', () => {
  it('says what each material’s picture is, of a work that draws the bodies where they were', () => {
    // № 031 draws positions, each stroke once.
    expect(homeLine(31, 'light', en)).toEqual([
      'Three bodies, each pulling on the other two.',
      'This is a long exposure of their motion.',
    ]);
    expect(homeLine(31, 'ink', en)).toEqual([
      'Three bodies, each pulling on the other two.',
      'This is the ink their motion stirred.',
    ]);
  });

  it('says the first sentence alone of a picture drawn in another space', () => {
    // № 035 is plotted in cross-braid space: each body at its own x and the next body's y.
    for (const expression of ['ink', 'light'] as const)
      expect(homeLine(35, expression, en)).toEqual([en.homeLine]);
    // And of a number with no frame to judge by.
    expect(homeLine(9999, 'light', en)).toEqual([en.homeLine]);
  });

  it('has a line for every work the home can open on', () => {
    expect(DAY_WORK_POOL.length).toBeGreaterThan(0);
    for (const id of DAY_WORK_POOL)
      for (const expression of ['ink', 'light'] as const)
        expect(homeLine(id, expression, en)[0]).toBe(en.homeLine);
    // Today's pool holds one of the seventeen works that do not draw positions.
    expect(DAY_WORK_POOL.filter((id) => homeLine(id, 'light', en).length === 1)).toEqual([35]);
  });
});
