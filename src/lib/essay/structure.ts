import type { Messages } from '@/lib/i18n/en';

/*
  The essay on the Process page, in reading order: which of the catalog's words stand where,
  and what stands between them. The page renders this list and nothing else of the essay
  (src/app/[locale]/process/essay.tsx), the sources take their numerals from it
  (essaySources), and its test holds every essay key in the catalogs to one place here.
*/

/** A key of the essay's own words in the catalogs. */
export type EssayKey = Extract<keyof Messages, `essay${string}`>;

/**
 * A sentence the work in hand decides (src/lib/essay/facts.ts): which pair of its bodies is
 * bound, when its twin parts from it, whether its plait forces anything.
 */
export const CASES = {
  take: ['essayTakeBound', 'essayTakeOpen'],
  twin: ['essayTwinAfter', 'essayTwinInside', 'essayTwinNever'],
  claim: ['essayClaimForced', 'essayClaimFree'],
  pair: ['essayTwoFigure', 'essayTwoFigureOpen'],
} as const satisfies Record<string, readonly EssayKey[]>;
export type EssayCase = keyof typeof CASES;

/** One of the catalog's sentences, or the one the work decides. */
export type Part = EssayKey | { readonly choose: EssayCase };

/** The essay's figures, each drawn by src/app/[locale]/process/essay-figures.tsx. */
export type FigureName =
  'pair' | 'arrangements' | 'ledger' | 'pushes' | 'energy' | 'twin' | 'plaits' | 'sheet';

export type Block =
  /** A paragraph: its sentences, joined as the language joins them. */
  | { readonly kind: 'p'; readonly parts: readonly Part[] }
  /** What the record of the work in hand says, set apart under the work's number. */
  | { readonly kind: 'record'; readonly parts: readonly Part[] }
  /** An aside with a heading of its own. */
  | { readonly kind: 'note'; readonly title: EssayKey; readonly parts: readonly Part[] }
  /** A short list: each item a statement and what it means. */
  | { readonly kind: 'points'; readonly items: readonly (readonly [EssayKey, EssayKey])[] }
  /** A figure and its caption; a derived one carries the venue's label for an analysis. */
  | {
      readonly kind: 'figure';
      readonly figure: FigureName;
      readonly caption: Part;
      readonly derived: boolean;
    }
  /** The live figure of the choice: every beginning drawn again from the seed, in the browser. */
  | { readonly kind: 'choice' };

export interface Chapter {
  /** The chapter's address on the page: /process#two. */
  readonly id: string;
  /** Its number in the contents; a middle dot for the chapters after the numbered eight. */
  readonly numeral: string;
  readonly ground: 'night' | 'paper';
  /** The word in the contents and beside the chapter. */
  readonly word: EssayKey | 'chapterChoice';
  /** The statement the chapter makes. */
  readonly title: EssayKey;
  readonly blocks: readonly Block[];
}

const p = (...parts: Part[]): Block => ({ kind: 'p', parts });
const choose = (name: EssayCase): Part => ({ choose: name });

/** The first six chapters stand on night with the Light plate; the rest on paper with the Ink. */
export const ESSAY: readonly Chapter[] = [
  {
    id: 'two',
    numeral: '01',
    ground: 'night',
    word: 'essayTwoWord',
    title: 'essayTwoTitle',
    blocks: [
      p('essayTwo1'),
      p('essayTwo2'),
      p('essayTwo3'),
      { kind: 'record', parts: ['essayTakeLead', choose('take'), 'essayTakeAll'] },
      { kind: 'figure', figure: 'pair', caption: choose('pair'), derived: true },
    ],
  },
  {
    id: 'three',
    numeral: '02',
    ground: 'night',
    word: 'essayThreeWord',
    title: 'essayThreeTitle',
    blocks: [
      p('essayThree1'),
      p('essayThree2'),
      { kind: 'figure', figure: 'arrangements', caption: 'essayThreeFigure', derived: false },
      p('essayThree3'),
      p('essayThree4'),
      p('essayThree5'),
    ],
  },
  {
    id: 'no-formula',
    numeral: '03',
    ground: 'night',
    word: 'essayFormulaWord',
    title: 'essayFormulaTitle',
    blocks: [
      p('essayFormula1'),
      p('essayFormula2'),
      { kind: 'figure', figure: 'ledger', caption: 'essayFormulaFigure', derived: false },
      p('essayFormula3'),
      p('essayFormula4'),
      p('essayFormula5'),
      p('essayFormula6'),
      p('essayFormula7'),
    ],
  },
  {
    id: 'steps',
    numeral: '04',
    ground: 'night',
    word: 'essayStepsWord',
    title: 'essayStepsTitle',
    blocks: [
      p('essaySteps1'),
      { kind: 'note', title: 'essayUnitsTitle', parts: ['essayUnits'] },
      p('essaySteps2'),
      p('essaySteps3'),
      { kind: 'figure', figure: 'pushes', caption: 'essayPushFigure', derived: false },
      p('essaySteps4'),
      p('essaySteps5'),
      { kind: 'figure', figure: 'energy', caption: 'essayEnergyFigure', derived: true },
      p('essaySteps6'),
      p('essaySteps7'),
    ],
  },
  {
    id: 'trillionth',
    numeral: '05',
    ground: 'night',
    word: 'essayTwinWord',
    title: 'essayTwinTitle',
    blocks: [
      p('essayTwin1'),
      p('essayTwin2', choose('twin')),
      { kind: 'figure', figure: 'twin', caption: 'essayTwinFigure', derived: true },
      p('essayTwin3'),
      p('essayTwin4'),
      p('essayTwin5'),
      p('essayTwin6'),
      { kind: 'note', title: 'essayChaosTitle', parts: ['essayChaos'] },
    ],
  },
  {
    id: 'choice',
    numeral: '06',
    ground: 'night',
    word: 'chapterChoice',
    title: 'essayChoiceTitle',
    blocks: [
      p('essayChoice1'),
      p('essayChoice2'),
      p('essayChoice3'),
      p('essayChoice4'),
      { kind: 'choice' },
    ],
  },
  {
    id: 'current',
    numeral: '07',
    ground: 'paper',
    word: 'essayCurrentWord',
    title: 'essayCurrentTitle',
    blocks: [
      p('essayCurrent1'),
      p('essayCurrent2'),
      {
        kind: 'points',
        items: [
          ['essayCarriesLead', 'essayCarries'],
          ['essayRubsLead', 'essayRubs'],
          ['essaySqueezeLead', 'essaySqueeze'],
        ],
      },
      p('essayCurrent3'),
      p('essayCurrent4'),
      p('essayCurrent5'),
      p('essayCurrent6'),
      { kind: 'record', parts: ['essayInkMade'] },
      p('essayCurrent7'),
    ],
  },
  {
    id: 'plait',
    numeral: '08',
    ground: 'paper',
    word: 'essayPlaitWord',
    title: 'essayPlaitTitle',
    blocks: [
      p('essayPlait1'),
      p('essayPlait2'),
      { kind: 'figure', figure: 'plaits', caption: 'essayPlaitFigure', derived: false },
      p('essayPlait3'),
      p('essayPlait4'),
      p('essayPlait5'),
      { kind: 'figure', figure: 'sheet', caption: 'essaySheetFigure', derived: true },
      { kind: 'note', title: 'essayClaimTitle', parts: ['essayClaim', choose('claim')] },
    ],
  },
  {
    id: 'unknown',
    numeral: '·',
    ground: 'paper',
    word: 'essayUnknownWord',
    title: 'essayUnknownTitle',
    blocks: [p('essayUnknown1'), p('essayUnknown2'), p('essayUnknown3')],
  },
];

/** The venue's terms, each with what it means; the last is the label on every derived view. */
export const TERMS: readonly (readonly [EssayKey | 'analysisNotWork', EssayKey])[] = [
  ['essayTermUnit', 'essayTermUnitIs'],
  ['essayTermStep', 'essayTermStepIs'],
  ['essayTermWarmUp', 'essayTermWarmUpIs'],
  ['essayTermWindow', 'essayTermWindowIs'],
  ['essayTermHorizon', 'essayTermHorizonIs'],
  ['essayTermBound', 'essayTermBoundIs'],
  ['essayTermSyzygy', 'essayTermSyzygyIs'],
  ['essayTermClosest', 'essayTermClosestIs'],
  ['essayTermBraid', 'essayTermBraidIs'],
  ['essayTermBorda', 'essayTermBordaIs'],
  ['essayTermTwin', 'essayTermTwinIs'],
  ['analysisNotWork', 'essayTermAnalysisIs'],
];

/** The essay's words that frame the chapters: the cover, the two plates, the closing lists. */
export const FRAME = [
  'essayStandfirst',
  'essayOfWork',
  'essayLightCopy',
  'essayInkCopy',
  'essayTermsWord',
  'essayTermsTitle',
  'essaySourcesWord',
  'essaySourcesTitle',
  'essaySourcesNote',
] as const satisfies readonly EssayKey[];

const keysOf = (part: Part): readonly EssayKey[] =>
  typeof part === 'string' ? [part] : CASES[part.choose];

function blockKeys(block: Block): readonly EssayKey[] {
  switch (block.kind) {
    case 'p':
    case 'record':
      return block.parts.flatMap(keysOf);
    case 'note':
      return [block.title, ...block.parts.flatMap(keysOf)];
    case 'points':
      return block.items.flat();
    case 'figure':
      return keysOf(block.caption);
    case 'choice':
      return [];
  }
}

/**
 * Every essay key the chapters and the terms read, in reading order; a sentence the work
 * decides counts each of the forms it can take.
 */
export function chapterKeys(): EssayKey[] {
  const essay = (key: string): key is EssayKey => key.startsWith('essay');
  return [
    ...ESSAY.flatMap((chapter) => [
      ...[chapter.word, chapter.title].filter(essay),
      ...chapter.blocks.flatMap(blockKeys),
    ]),
    ...TERMS.flat().filter(essay),
  ];
}
