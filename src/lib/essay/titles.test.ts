import { describe, expect, it } from 'vitest';
import { catalogs } from '@/lib/i18n/messages';
import { locales } from '@/lib/i18n/routing';
import { ESSAY } from './structure';
import { longestRun } from './titles';

describe('a title’s longest word', () => {
  it('is reckoned in ems of the title’s size, a little wide: a letter by its script, a syllable block one em', () => {
    expect(longestRun('Two bodies repeat one ellipse.', 'en')).toBe(4.4);
    // The word that ran 50 px past a 320 px screen at the chapter size (16 November 2026).
    expect(longestRun('Три тіла зберігають свою форму лише у двох розташуваннях.', 'uk')).toBe(
      8.35,
    );
    expect(longestRun('세 천체는 두 가지 배치에서만 모양을 지킵니다.', 'ko')).toBe(5);
    // A hyphen lets a line break; a no-break space does not.
    expect(longestRun('Navier-Stokes', 'en')).toBe(3.3);
    expect(longestRun('№\u00a0031 abc', 'en')).toBe(2.75);
    expect(longestRun('', 'en')).toBe(1);
  });

  it('is nothing to fit where a line breaks between any two characters', () => {
    expect(longestRun('三个天体只在两种排列中保持形状。', 'zh')).toBe(1);
    expect(longestRun('三個天體只在兩種排列中保持形狀。', 'zh-TW')).toBe(1);
    expect(longestRun('三つの天体が形を保つ配置は二つだけ。', 'ja')).toBe(1);
  });

  it('fits a 320 px screen at no less than the reading size, for every title in every language', () => {
    // 288 px between the gutters; a title shrunk under the text it heads would be no title.
    for (const locale of locales)
      for (const { title } of ESSAY) {
        const size = Math.min(44, 288 / longestRun(catalogs[locale][title], locale));
        expect(size, `${locale}: ${catalogs[locale][title]}`).toBeGreaterThanOrEqual(24);
      }
  });
});
