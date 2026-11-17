import { describe, expect, it } from 'vitest';
import { catalogs, messages } from './messages';
import { locales, type Locale } from './routing';
import { NEVER_OF_AN_ORBIT } from '../../../tests/word-rules';

type Key = keyof typeof catalogs.en;
type ByLocale = Partial<Record<Locale, RegExp>>;
const byLocale = (words: ByLocale) => Object.entries(words) as [Locale, RegExp][];

/** The strings where English names a thing. The name of a blank ({window}) is not a word. */
const whereEnglishSays = (word: RegExp) =>
  (Object.keys(catalogs.en) as Key[]).filter((key) =>
    word.test(catalogs.en[key].replace(/\{\w+\}/g, '')),
  );

/**
 * One word for one thing (ARCHITECTURE.md § 10): a row for each term that the language reviews of
 * November 2026 found with two names in one catalogue. Add a row when a review finds another.
 */
interface Term {
  /** The thing, as its test is titled. */
  thing: string;
  /** What English calls it. */
  english: RegExp;
  /** The strings where English says that word of something else. */
  apart?: Key[];
  /** One string that must be among them, so that rewording the source cannot empty a row unseen. */
  among: Key;
  /** The one name: every string where English names the thing holds it. */
  name: ByLocale;
  /** The second name, which no string of the catalogue may hold. */
  never?: ByLocale;
  /** A second name rightly said of something else: refused only where English names this thing. */
  notHere?: ByLocale;
}
const ONE_NAME: Term[] = [
  {
    // The published trait's label and its note said 行く末, 최종 상태 and 归宿, while the row of
    // the orbit's own table, where a browser runs the same test, and the Verify page said 運命,
    // 운명 and 命运: destiny, which claims an ending the record does not.
    thing: 'a fate, on the published trait and in the orbit’s own table alike',
    english: /\bfates?\b/i,
    among: 'orbitFate',
    name: {
      uk: /дол[яюі]/i,
      ja: /行く末/,
      ko: /최종 상태/,
      zh: /归宿/,
      'zh-TW': /歸宿/,
      'zh-HK': /歸宿/,
      vi: /kết cục/i,
    },
    never: { ja: /運命/, ko: /운명/, zh: /命运/, 'zh-TW': /命運/, 'zh-HK': /命運/ },
  },
  {
    // The steps a work records. Japanese said it three ways (記録区間, 記録された区間,
    // 記録された時間), Korean two (기록 구간, 기록된 구간), Chinese two (记录区间, 记录的时段) and
    // Vietnamese three («khoảng được ghi lại», «cửa sổ đã ghi», «khoảng đã ghi»). The traditional
    // catalogues spell the noun 紀錄 and the verb 記錄, so the same name in the verb's spelling is
    // refused too. The magnifier's window is another thing, «khung xem» in Vietnamese.
    thing: 'the recorded window',
    english: /\bwindow\b/i,
    apart: ['loupeKeys'],
    among: 'orbitProgressWindow',
    name: {
      uk: /вікн/i,
      ja: /記録区間/,
      ko: /기록된 구간/,
      zh: /记录区间/,
      'zh-TW': /紀錄區間/,
      'zh-HK': /紀錄區間/,
      vi: /khoảng được ghi lại/i,
    },
    never: {
      ja: /記録された(区間|時間)/,
      ko: /기록 구간/,
      zh: /记录的时段/,
      'zh-TW': /[紀記]錄的時段|記錄區間/,
      'zh-HK': /[紀記]錄的時段|記錄區間/,
      vi: /cửa sổ|khoảng đã ghi/i,
    },
  },
  {
    // English says "measure" and "measurement" of the one thing. Japanese said 計測値 in the
    // Statement and the trails, and 測定値 in the table of the orbit derived again, where a count
    // of them is 項目. Ukrainian keeps two forms of the one root, each to its own strings (below).
    thing: 'a measurement',
    english: /\bmeasurements?\b|(?:’s|this|same|the) measure\b/i,
    among: 'orbitMeasurement',
    name: {
      uk: /вимір/i,
      ja: /計測値|項目/,
      ko: /측정/,
      zh: /测量/,
      'zh-TW': /測量/,
      'zh-HK': /測量/,
      vi: /phép đo/i,
    },
    never: { ja: /測定/ },
  },
  {
    // What the publisher gives each token. English says "characteristics" once and "trait" once,
    // and Japanese said 特徴 for the first and 特性 for the second.
    thing: 'a published trait',
    english: /\btraits?\b|\bcharacteristics\b/i,
    among: 'glossaryFate',
    name: { ja: /特性/, ko: /특성/, zh: /特征/, 'zh-TW': /特徵/, 'zh-HK': /特徵/ },
    never: { ja: /特徴/ },
  },
  {
    // Taiwan's catalogue said 算繪 in two strings and 渲染 in eight, the Statement among them.
    // Both are Taiwan's words; 渲染 is the painter's, a wash of ink.
    thing: 'a rendering, in Chinese',
    english: /\brender/i,
    among: 'glossaryExpression',
    name: { zh: /渲染/, 'zh-TW': /渲染/, 'zh-HK': /渲染/ },
    never: { 'zh-TW': /算繪/ },
  },
  {
    // The Taiwan and Hong Kong catalogues said 引力 in three strings beside 重力 in the
    // Statement. Taiwan's standard names the force 重力 and Hong Kong admits both; 引力 is the
    // mainland's name for it, which the Simplified catalogue keeps. Vietnamese said «trọng lực»
    // once, which is the Earth's pull on a thing, its weight.
    thing: 'gravity',
    english: /\bgravity\b/i,
    among: 'gravityCopy',
    name: {
      uk: /гравітац/i,
      ja: /重力/,
      ko: /중력/,
      zh: /引力/,
      'zh-TW': /重力/,
      'zh-HK': /重力/,
      vi: /lực hấp dẫn/i,
    },
    never: { zh: /重力/, 'zh-TW': /引力/, 'zh-HK': /引力/, vi: /trọng lực/i },
  },
  {
    // Hong Kong's catalogue said 哈希值, the mainland's word, in two strings, and 雜湊值, the
    // word of Hong Kong's law and government, in three.
    thing: 'a hash',
    english: /\bhash/i,
    among: 'publishedHashes',
    name: {
      uk: /хеш/i,
      ja: /ハッシュ/,
      ko: /해시/,
      zh: /哈希/,
      'zh-TW': /雜湊/,
      'zh-HK': /雜湊/,
      vi: /mã băm/i,
    },
    never: { 'zh-TW': /哈希/, 'zh-HK': /哈希/ },
  },
  {
    // A plate was 版面, a page's layout, in five strings of each Chinese catalogue. It is 图版,
    // the book's word, as 図版 and 도판 are. 幅 is its measure word, and stands for it where the
    // noun is understood: 整幅, 第 3 幅.
    thing: 'a plate in Chinese, with its measure word',
    english: /\bplates?\b/i,
    among: 'colophonPlates',
    name: {
      zh: /图版|整幅|第 \{n\} 幅/,
      'zh-TW': /圖版|整幅|第 \{n\} 幅/,
      'zh-HK': /圖版|整幅|第 \{n\} 幅/,
    },
    never: { zh: /版面/, 'zh-TW': /版面/, 'zh-HK': /版面/ },
  },
  {
    // Deriving an orbit again from its seed is «наново», afresh. «знову», once more, stood in one
    // such string; it is rightly said of a body that leaves the picture a second time.
    thing: 'the orbit derived again, in Ukrainian',
    english: /\bagain from\b|\bre-(?:derived|performed)\b/i,
    among: 'orreryNote',
    name: { uk: /наново/i },
    notHere: { uk: /знову/i },
    never: { uk: /заново/i },
  },
  {
    // The room where a work is seen alone. The key sheet said «зала перегляду» and «phòng xem»
    // beside the name on the room itself.
    thing: 'the viewing room',
    english: /\bviewing room\b/i,
    among: 'keyFilm',
    name: { uk: /зал\S* споглядання/i, vi: /phòng thưởng lãm/i },
    never: { uk: /зал\S* перегляду/i, vi: /phòng xem/i },
  },
  {
    // Light and Ink are a work's two expressions. Ukrainian said «вираз», a phrase or a formula,
    // in five strings beside «втілення» in six; Vietnamese «cách thể hiện» and «cách biểu đạt»,
    // a manner, beside the bare noun the glossary defines.
    thing: 'an expression',
    english: /\bexpressions?\b/i,
    among: 'glossaryExpression',
    name: { uk: /втілен/i, vi: /biểu đạt/i },
    never: { uk: /вираз/i, vi: /cách biểu đạt|thể hiện/i },
  },
  {
    // A work is imprinted when its cycle closes. The cycle's note said «відтиснено» under a label
    // that says «відбито».
    thing: 'an imprint, in Ukrainian',
    english: /\bimprint/i,
    among: 'cycleNote',
    name: { uk: /відби/i },
    never: { uk: /відтис/i },
  },
  {
    // The Vietnamese label said «Lớp phổ» over a note that began «Lớp quang phổ».
    thing: 'the spectral class',
    english: /\bspectral class\b/i,
    among: 'glossarySpectralClass',
    name: {
      uk: /спектральн\S* клас/i,
      ja: /スペクトル型/,
      'zh-TW': /光譜型/,
      vi: /lớp quang phổ/i,
    },
    never: { vi: /lớp phổ/i },
  },
  {
    // The labels said «điểm giao của các đường bện» and the trail «giao cắt bím»: a plait of hair.
    thing: 'a braid’s crossings, in Vietnamese',
    english: /\bcrossings?\b/i,
    among: 'measureCrossings',
    name: { vi: /điểm giao/i },
    never: { vi: /giao cắt|bím/i },
  },
  {
    // A film's name, on its control. The Vietnamese notice called it «bản nghiên cứu dài» beside
    // «Khảo sát dài»; Korean once did the like (긴 연구, refused above).
    thing: 'the long study',
    english: /\b(?:long|extended) study\b/i,
    among: 'studyWaits',
    name: {
      uk: /етюд/i,
      ja: /習作/,
      ko: /관찰/,
      zh: /研究/,
      'zh-TW': /研究/,
      'zh-HK': /研究/,
      vi: /khảo sát/i,
    },
    never: { vi: /nghiên cứu/i },
  },
  {
    // «kiểm» is a verb and does not stand as a noun. Vietnamese writing on voting says «đếm
    // Borda»; with «phép», the catalogue's word for an operation, it is a noun.
    thing: 'the Borda count, in Vietnamese',
    english: /\bborda\b/i,
    among: 'glossaryBorda',
    name: { vi: /phép đếm Borda/i },
    never: { vi: /kiểm Borda/i },
  },
  {
    // The camera's drift. Japanese and Korean had the Chinese word once (漂移, 표류) beside the
    // loan word, and Vietnamese «hình elip trôi» beside «trôi dạt».
    thing: 'the drift',
    english: /\bdrift\b/i,
    among: 'eccentricity',
    name: {
      uk: /дрейф/i,
      ja: /ドリフト/,
      ko: /드리프트/,
      zh: /漂移/,
      'zh-TW': /漂移/,
      'zh-HK': /漂移/,
      vi: /trôi dạt/i,
    },
    never: { ja: /漂移/, ko: /표류/, vi: /trôi(?! dạt)/i },
  },
];

describe('production translations', () => {
  for (const locale of locales) {
    it(`${locale} has every English key and no unexpected key`, () => {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(catalogs.en).sort());
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
        expect(value, `${locale}.${key} must be NFC`).toBe(value.normalize('NFC'));
      }
    });
    if (locale !== 'en') {
      it(`${locale} resolves its own translated catalog without an English fallback`, () => {
        expect(messages(locale)).toBe(catalogs[locale]);
        expect(messages(locale)).not.toBe(catalogs.en);
        const translations = Object.entries(catalogs[locale]).filter(
          ([key, value]) => value !== catalogs.en[key as keyof typeof catalogs.en],
        );
        expect(translations.length).toBeGreaterThan(Object.keys(catalogs.en).length * 0.9);
      });
    }
  }

  it('fills the same blanks in every language as in English', () => {
    // A translation that drops {steps} or {time} would print a sentence with its number gone.
    const blanks = (value: string) => [...value.matchAll(/\{[a-zA-Z]+\}/g)].map(([blank]) => blank);
    for (const locale of locales)
      for (const [key, value] of Object.entries(catalogs[locale]))
        expect(blanks(value).sort(), `${locale}.${key}`).toEqual(
          blanks(catalogs.en[key as keyof typeof catalogs.en]).sort(),
        );
  });

  it('names each answer to "whom to stay with" by a name that holds its visible label', () => {
    // WCAG 2.5.3: a visitor who speaks the word they see must be understood. The answers are
    // shown as "1", "2", "3" and the frame's own label, and named by what they do; a language
    // whose grammar would change the label inside the name words the name round it instead
    // (Ukrainian: «Кадр фільму: лишитися з ним»).
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.beyondStayFrame.toLowerCase(), locale).toContain(
        catalog.beyondFrame.toLowerCase(),
      );
      expect(catalog.beyondStayBody, locale).toContain('{body}');
      // Whom the running line says the picture is with comes before the line it wraps.
      expect(catalog.beyondKeptLine.indexOf('{body}'), locale).toBeLessThan(
        catalog.beyondKeptLine.indexOf('{line}'),
      );
    }
  });

  it('has one Vietnamese word for a body, «vật thể», wherever a body is named', () => {
    // «thiên thể» (a heavenly body) stood in six older strings, one of them a row of the
    // record's table beside «Khối lượng vật thể 1».
    for (const [key, value] of Object.entries(catalogs.vi))
      expect(String(value).toLowerCase(), key).not.toContain('thiên thể');
  });

  it('has one name for Ink in each language, wherever the expression or its material is named', () => {
    // Sumi is what the expression simulates, and each language has its word for it. The control
    // once said «Чорнило», インク and 잉크, the words for the ink of a pen, while the entry, the
    // Statement and the exhibitions said «Туш», 墨 and 먹 (the 14 November 2026 review, content-6).
    const name: Record<Locale, RegExp> = {
      en: /\bink\b/i,
      uk: /туш/i,
      ja: /墨/,
      ko: /먹/,
      zh: /墨/,
      'zh-TW': /墨/,
      'zh-HK': /墨/,
      vi: /mực/i,
    };
    const second: Partial<Record<Locale, RegExp>> = { uk: /чорнил/i, ja: /インク/, ko: /잉크/ };
    const named = Object.entries(catalogs.en).filter(([, value]) => name.en.test(value));
    expect(named.length).toBeGreaterThan(15);
    for (const locale of locales) {
      const catalog = catalogs[locale];
      // The word on the control is the name itself, and every sentence that names Ink in
      // English names it by that word.
      expect(catalog.ink, locale).toMatch(name[locale]);
      for (const [key] of named)
        expect(catalog[key as keyof typeof catalog], `${locale}.${key}`).toMatch(name[locale]);
      const other = second[locale];
      if (other)
        for (const [key, value] of Object.entries(catalog))
          expect(value, `${locale}.${key}`).not.toMatch(other);
    }
    expect([catalogs.uk.ink, catalogs.ja.ink, catalogs.ko.ink]).toEqual(['Туш', '墨', '먹']);
  });

  it('sets Light apart from what it says of Ink, on a work whose Ink is not indexed', () => {
    // The card shows the Light and says the Ink is not indexed yet. Japanese once joined the two
    // with a nakaguro (光・墨は…), which reads "Light and Ink are not yet indexed".
    for (const locale of locales) expect(catalogs[locale].lightOnly, locale).toContain(' · ');
    expect(catalogs.ja.lightOnly).not.toContain('・');
  });

  it('calls a plate by one word in a language, wherever English says plate', () => {
    // The Ukrainian colophon, at the foot of every page, once began «Плати відтворено…»:
    // payments, or circuit boards. Japanese and Korean had the loan word (プレート, 플레이트) in
    // three strings beside the book's word in seven, and Korean a bare 판 in two more.
    const said = (value: string) => /\bplates?\b/i.test(value.replace(/\{\w+\}/g, ''));
    const plates = Object.entries(catalogs.en).filter(([, value]) => said(value));
    expect(plates.map(([key]) => key)).toContain('colophonPlates');
    const word = { uk: 'аркуш', ja: '図版', ko: '도판', vi: 'bản in' } as const;
    for (const locale of ['uk', 'ja', 'ko', 'vi'] as const)
      for (const [key] of plates)
        expect(
          catalogs[locale][key as keyof typeof catalogs.en].toLowerCase(),
          `${locale}.${key}`,
        ).toContain(word[locale]);
    expect(catalogs.uk.colophonPlates).toMatch(/^Аркуші відтворено/);
    expect(Object.values(catalogs.ja).join(' ')).not.toContain('プレート');
    expect(Object.values(catalogs.ko).join(' ')).not.toContain('플레이트');
  });

  it('has one name for the publisher in each language', () => {
    // Japanese had 公開者 once beside 発行者, and each Chinese catalogue 发布者 once beside 发布方.
    const name: Record<Locale, RegExp> = {
      en: /publisher/i,
      uk: /видав/i,
      ja: /発行者/,
      ko: /발행자/,
      zh: /发布方/,
      'zh-TW': /發布方/,
      'zh-HK': /發佈方/,
      vi: /nhà phát hành/i,
    };
    const named = Object.entries(catalogs.en).filter(([, value]) => name.en.test(value));
    expect(named.length).toBeGreaterThan(5);
    for (const locale of locales) {
      for (const [key] of named)
        expect(catalogs[locale][key as keyof typeof catalogs.en], `${locale}.${key}`).toMatch(
          name[locale],
        );
      expect(Object.values(catalogs[locale]).join(' '), locale).not.toMatch(
        /公開者|发布者|發布者|發佈者/,
      );
    }
  });

  it('names chaos by its label, wherever it says what chaos is', () => {
    // An entry sets the label beside the mark that leads to its note, and a chaos trail prints
    // the measure beside the same work. Korean labelled it 혼돈 over a note that began 카오스는,
    // and Vietnamese «Hỗn loạn» over «Hỗn độn».
    for (const locale of locales) {
      const catalog = catalogs[locale];
      const label = catalog.chaos.toLowerCase();
      for (const key of [
        'glossaryChaos',
        'measureChaos',
        'trailAlmostStillNote',
        'trailChaosCorrected',
      ] as const)
        expect(catalog[key].toLowerCase(), `${locale}.${key}`).toContain(label);
    }
  });

  it('keeps pace and rhythm apart in Chinese', () => {
    // 节奏 stood for the film's pace in four strings where four others said 速度. The chaos notes
    // say that an orbit near 100 keeps no 节奏, and a work's page prints both.
    const paced = Object.entries(catalogs.en).filter(([, value]) =>
      /\bpace\b/i.test(value.replace(/\{\w+\}/g, '')),
    );
    expect(paced.length).toBeGreaterThan(5);
    for (const locale of ['zh', 'zh-TW', 'zh-HK'] as const)
      for (const [key] of paced) {
        const value = catalogs[locale][key as keyof typeof catalogs.en];
        expect(value, `${locale}.${key}`).toContain('速度');
        expect(value, `${locale}.${key}`).not.toMatch(/节奏|節奏/);
      }
  });

  it('keeps one name where a second had crept in', () => {
    // Each of these named, in one or two strings, a thing the rest of its catalogue names
    // otherwise: a still, the long film, a record, a fate (the reviews of November 2026).
    const second: Partial<Record<Locale, RegExp>> = {
      ko: /정지 화면|정지 화상|긴 연구/,
      zh: /静帧/,
      'zh-TW': /靜幀/,
      'zh-HK': /靜幀/,
      vi: /bản ghi|số phận|hỗn loạn/i,
    };
    for (const [locale, other] of Object.entries(second) as [Locale, RegExp][])
      for (const [key, value] of Object.entries(catalogs[locale]))
        expect(value, `${locale}.${key}`).not.toMatch(other);
  });

  for (const { thing, english, apart = [], among, name, never = {}, notHere = {} } of ONE_NAME)
    it(`has one name for ${thing}`, () => {
      const named = whereEnglishSays(english).filter((key) => !apart.includes(key));
      expect(named, 'the strings where English names it').toContain(among);
      for (const [locale, word] of byLocale(name))
        for (const key of named) expect(catalogs[locale][key], `${locale}.${key}`).toMatch(word);
      for (const [locale, word] of byLocale(notHere))
        for (const key of named)
          expect(catalogs[locale][key], `${locale}.${key}`).not.toMatch(word);
      for (const [locale, word] of byLocale(never))
        for (const [key, value] of Object.entries(catalogs[locale]))
          expect(value, `${locale}.${key}`).not.toMatch(word);
    });

  it('lets two forms stand only where each keeps to its own strings', () => {
    const holding = (locale: Locale, word: RegExp) =>
      (Object.keys(catalogs[locale]) as Key[]).filter((key) => word.test(catalogs[locale][key]));
    // Ukrainian has the result and the act of one verb, as English has "measure" and
    // "measurement". «вимір» is a measure that a trait or a trail goes by. «вимірювання» is a row
    // of the table of the orbit derived again: it heads the column, where «Вимір» alone would
    // read "Dimension", and the four sentences that count the rows say it after their label.
    expect(holding('uk', /вимірюван/i).sort()).toEqual([
      'orbitAllExact',
      'orbitMeasurement',
      'orbitSomeDiffer',
      'verifyOrbitSomeUnchecked',
      'verifyOrbitWorkIntro',
    ]);
    // Vietnamese tells two things apart, as English does with "beginnings" and "start". A «khởi
    // điểm» is one of the candidates drawn from the seed, a thing one counts (and, of a sale, the
    // opening bid). It is the word of the choice field, and of the chapter of the Process essay
    // that stands above that figure and tells the same choice (`essayChoice…`). «trạng thái ban
    // đầu» is the state a path follows from, wherever English says "its start". «điều kiện ban
    // đầu», once a third, is said nowhere.
    const start = whereEnglishSays(/\b(?:their|that|its) start\b/i);
    expect(start).toContain('statement3');
    expect(holding('vi', /trạng thái ban đầu/i).sort()).toEqual([...start].sort());
    for (const key of holding('vi', /khởi điểm/i))
      expect(key).toMatch(/^choiceField|^essayChoice|^opening/);
    expect(holding('vi', /điều kiện ban đầu/i)).toEqual([]);
  });

  it('names Sit in its key line by the word on the control', () => {
    // The control's hint and the key sheet read the one line (keySit); in seven languages it
    // once began with another word than the control beside it (Сісти beside Споглядати).
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.keySit.startsWith(catalog.sit), `${locale}: ${catalog.keySit}`).toBe(true);
    }
  });

  it('has one tagline, said one way', () => {
    // The home's title was once put together from two keys, which Japanese, Korean and
    // Vietnamese had translated apart from the line the page prints, and which set a Latin
    // space inside a Chinese or Japanese title.
    expect(catalogs.en).not.toHaveProperty('shape');
    expect(catalogs.en).not.toHaveProperty('ofMotion');
    expect(catalogs.en.shapeOfMotion).toBe('The shape of motion.');
    for (const locale of ['ja', 'zh', 'zh-TW', 'zh-HK'] as const)
      expect(catalogs[locale].shapeOfMotion, locale).not.toMatch(/\s/);
  });

  it('never says eternal, for ever or always in its own voice, in any string of any language', () => {
    // The venue has measured that it cannot know (docs/after-the-frame.md § 1.3), so the words
    // are kept out of every catalogue, not only out of the lines about an orbit. Two things are
    // not the venue speaking of an orbit: the publisher's own name for a fate, quoted as
    // published, and the sale's rule that a larger bid is always welcome.
    const QUOTED = 'Eternal Dance';
    const NOT_OF_AN_ORBIT = new Set(['ruleRaiseCopy']);
    for (const locale of locales) {
      const catalog = catalogs[locale];
      for (const [key, value] of Object.entries(catalog)) {
        if (NOT_OF_AN_ORBIT.has(key)) continue;
        const own = value.replaceAll(QUOTED, '');
        expect(own, `${locale}.${key}`).not.toMatch(NEVER_OF_AN_ORBIT[locale]);
        // Nor the English word under another language, as the token's own text once stood.
        expect(own, `${locale}.${key}`).not.toMatch(/eternal/i);
      }
      // The publisher's two names are quoted exactly as published, in every language.
      expect(catalog.glossaryFate, locale).toContain(QUOTED);
      expect(catalog.glossaryFate, locale).toContain('Ejection');
      expect(catalog.fatePublished, locale).toContain('{fate}');
      // The published name is always set off as a quotation, never left bare.
      expect(catalog.fatePublished.replace('{fate}', ''), locale).toMatch(/[“«「‘]/);
    }
  });

  it('keeps the Statement to what the venue does and says: no for ever, and its own names', () => {
    // § 3 once said two bodies circle "forever" (вічно, 永遠に, 영원히, 永远) and § 6 that nothing
    // here is computed live. Corrected in November 2026 (the 14 November review, content-4, -5).
    for (const locale of locales) {
      const catalog = catalogs[locale];
      for (const n of [1, 2, 3, 4, 5, 6] as const)
        expect(catalog[`statement${n}`], `${locale} § ${n}`).not.toMatch(NEVER_OF_AN_ORBIT[locale]);
      // § 3 sends the reader to the twin by the name its control carries on every work's page.
      expect(catalog.statement3, locale).toContain(catalog.oneInATrillion);
      // § 6 says what the venue's own measurements are marked as, in the mark's own words.
      expect(catalog.statement6.toLowerCase(), locale).toContain(
        catalog.analysisNotWork.toLowerCase(),
      );
      // The line under the byline names the paragraphs that changed.
      expect(catalog.statementCorrected, locale).toMatch(/§ 3.*§ 6/);
    }
    expect(catalogs.en.statement6).not.toMatch(/not a live simulation|publisher’s own/);
  });

  it('runs two sentences together as each language does: no space in Japanese or Chinese', () => {
    for (const locale of locales)
      expect(catalogs[locale].sentences, locale).toBe(
        ['ja', 'zh', 'zh-TW', 'zh-HK'].includes(locale) ? '{first}{second}' : '{first} {second}',
      );
  });

  it('preserves critical auction quantities in every language', () => {
    for (const locale of locales) {
      const catalog = catalogs[locale];
      expect(catalog.ruleFirstCopy).toContain('0.00001');
      expect(catalog.ruleFirstCopy).toContain('48');
      expect(catalog.ruleRaise).toContain('10%');
      expect(catalog.ruleFunds).toContain('100%');
      expect(catalog.invalidAmount).toContain('18');
    }
  });

  it('keeps the Chinese regional catalogs distinct', () => {
    expect(catalogs['zh-TW'].privacyCopy).toContain('網路');
    expect(catalogs['zh-HK'].privacyCopy).toContain('網絡');
    expect(catalogs['zh-TW'].privacy).not.toBe(catalogs['zh-HK'].privacy);
    // Each spells "publish" one way: 發佈 in Hong Kong, where eight strings once said 發布 beside
    // twenty-eight, and 發布 in Taiwan. Hong Kong writes 公佈 with the same 佈, where three strings
    // said 公布. "Here" is 這裏 in Hong Kong and 這裡 in Taiwan.
    const hongKong = Object.values(catalogs['zh-HK']).join(' ');
    const taiwan = Object.values(catalogs['zh-TW']).join(' ');
    expect(hongKong).not.toMatch(/發布|公布|這裡/);
    expect(hongKong).toContain('公佈');
    expect(hongKong).toContain('發佈方');
    expect(taiwan).not.toMatch(/發佈|這裏/);
    expect(taiwan).toContain('發布方');
  });

  it('keeps locale-specific reader conventions', () => {
    expect(Object.values(catalogs.ko).join(' ')).not.toContain('당신');
    expect(Object.values(catalogs.ja).join(' ')).not.toContain('あなた');
    expect(Object.values(catalogs.vi).join(' ')).not.toMatch(/quý khách|quý vị|\.\.\./u);
    // The Chinese catalogs address the reader as 你 throughout; 您 would change register mid-page.
    for (const locale of ['zh', 'zh-TW', 'zh-HK'] as const)
      expect(Object.values(catalogs[locale]).join(' ')).not.toContain('您');
  });
});
