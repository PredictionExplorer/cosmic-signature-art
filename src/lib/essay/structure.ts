import type { Messages } from '@/lib/i18n/en';

/*
  The essay the home is made of, in reading order: which of the catalog's words stand where,
  and what stands between them. The page renders this list and nothing else of the essay
  (src/app/[locale]/_essay/essay.tsx), the sources take their numerals from it
  (essaySources), and its test holds every essay key in the catalogs to one place here.

  The essay has three parts, in the order a work is made: the orbit, its Light, its Ink. Each
  part opens with a plate of its own that the page sets (src/app/[locale]/page.tsx): the orbit
  in depth, the Light still with its film, the Ink still with its film.
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
  /** What the orbit in depth is a drawing of: the bodies' places, or the space the work draws. */
  depth: ['essayOrbitPlaces', 'essayOrbitSpace', 'essayOrbitCopies'],
} as const satisfies Record<string, readonly EssayKey[]>;
export type EssayCase = keyof typeof CASES;

/** One of the catalog's sentences, or the one the work decides. */
export type Part = EssayKey | { readonly choose: EssayCase };

/** The essay's figures, each drawn by src/app/[locale]/_essay/essay-figures.tsx. */
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
  | { readonly kind: 'choice' }
  /**
   * A detail of the work in hand: the densest window of its published still in one expression
   * (src/lib/art/plate-details.ts), shown near the still's own scale. The work itself, cut, so
   * it carries no label of an analysis.
   */
  | { readonly kind: 'detail'; readonly of: 'light' | 'ink' };

/** The essay's parts, in the order a work is made, and what follows them. */
export type EssayPart = 'orbit' | 'light' | 'ink' | 'close';

export interface Chapter {
  /** The chapter's address on the page: /#two. */
  readonly id: string;
  /** Its number in the contents; a middle dot for the chapter after the numbered eleven. */
  readonly numeral: string;
  /** The part it belongs to: it stands beneath that part's plate. */
  readonly part: EssayPart;
  readonly ground: 'night' | 'paper';
  /** The word in the contents and beside the chapter. */
  readonly word: EssayKey | 'chapterChoice';
  /** The statement the chapter makes. */
  readonly title: EssayKey;
  readonly blocks: readonly Block[];
}

const p = (...parts: Part[]): Block => ({ kind: 'p', parts });
const choose = (name: EssayCase): Part => ({ choose: name });

/**
 * Six chapters on the orbit and two on its Light stand on night; three on its Ink, and what is
 * not known, stand on paper.
 */
export const ESSAY: readonly Chapter[] = [
  {
    id: 'two',
    part: 'orbit',
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
    part: 'orbit',
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
    part: 'orbit',
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
    part: 'orbit',
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
    part: 'orbit',
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
    part: 'orbit',
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
    id: 'view',
    part: 'light',
    numeral: '07',
    ground: 'night',
    word: 'essayViewWord',
    title: 'essayViewTitle',
    blocks: [
      p('essayView1'),
      p('essayView2'),
      p('essayViewScores'),
      p('essayView3'),
      p('essayView4'),
      { kind: 'record', parts: ['essayViewDrift'] },
      p('essayView5'),
      p('essayView6'),
    ],
  },
  {
    id: 'stroke',
    part: 'light',
    numeral: '08',
    ground: 'night',
    word: 'essayStrokeWord',
    title: 'essayStrokeTitle',
    blocks: [
      p('essayStroke1'),
      p('essayStroke2'),
      p('essayStroke3'),
      p('essayStroke4'),
      { kind: 'record', parts: ['essayStrokeRecord'] },
      p('essayStroke5'),
      // What the chapter has said of a stroke, seen: its breadth, its brightness, its sum.
      { kind: 'detail', of: 'light' },
      p('essayStroke6'),
      p('essayStroke7'),
    ],
  },
  {
    id: 'current',
    part: 'ink',
    numeral: '09',
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
    part: 'ink',
    numeral: '10',
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
    id: 'paper',
    part: 'ink',
    numeral: '11',
    ground: 'paper',
    word: 'essayPaperWord',
    title: 'essayPaperTitle',
    blocks: [
      p('essayPaper1'),
      p('essayPaper2'),
      // The sheet, its fibre and the soot in it, seen.
      { kind: 'detail', of: 'ink' },
      p('essayPaper3'),
      p('essayPaper4'),
    ],
  },
  {
    id: 'unknown',
    part: 'close',
    numeral: '·',
    ground: 'paper',
    word: 'essayUnknownWord',
    title: 'essayUnknownTitle',
    blocks: [p('essayUnknown1'), p('essayUnknown2'), p('essayUnknown3')],
  },
];

/** The venue's terms, each with what it means; the last is the label on every derived view. */
export const TERMS: readonly (readonly [EssayKey | 'analysisNotWork', EssayKey])[] = [
  ['essayTermSeed', 'essayTermSeedIs'],
  ['essayTermGenerator', 'essayTermGeneratorIs'],
  ['essayTermRecord', 'essayTermRecordIs'],
  ['essayTermCycle', 'essayTermCycleIs'],
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

/**
 * The essay's words that frame the chapters: the cover, the three plates, the closing lists,
 * and how a work comes to exist. The orbit's own controls are its component's words
 * (src/components/orbit-depth.words.ts), as the live figure of the choice has its own.
 */
export const FRAME = [
  'essayStandfirst',
  'essayOfWork',
  'essayOrbitWord',
  'essayOrbitCopy',
  // What the orbit in depth is a drawing of, as the work decides (CASES.depth).
  ...CASES.depth,
  'essayDepthLabel',
  'essayLightTitle',
  'essayLightCopy',
  'essaySweepCopy',
  'essayInkCopy',
  'essayBornWord',
  'essayBornTitle',
  'essayBorn1',
  'essayBorn2',
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
    case 'detail':
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
