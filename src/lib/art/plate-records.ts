import data from './plate-records.json';

/**
 * Offline measurements of a work's own ground and weight, keyed to the still hash they were
 * taken from (scripts/build-plate-records.mjs). The Ink sheet's border tone letterboxes the
 * plate without an edge; the Light field is asserted to be true black; the weighted centre
 * is the eye line a sheet hangs on; the detail windows are the loupe's first views.
 */
export interface PlateCentre {
  /** Fraction of the still's width, 0 at the left edge. */
  x: number;
  /** Fraction of the still's height, 0 at the top edge. */
  y: number;
}
export interface PlateDetail {
  /** Pixels of the published still. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The share of the expression's weight inside this window. */
  share: number;
}
export interface PlateGround {
  stillSha256: string;
  /** Mean colour of the still's outer 8 px border, as #rrggbb. */
  tone: string;
  /** True when ink (or light) reaches the border, so a deliberate hairline is hung. */
  edge: boolean;
  /** Luminance-weighted centre: darkness against the sheet for Ink, brightness for Light. */
  centre: PlateCentre;
  /** The heaviest non-overlapping windows, heaviest first; at most three. */
  detail: PlateDetail[];
}
export interface PlateRecord {
  id: number;
  seed: `0x${string}`;
  ink?: PlateGround;
  light?: PlateGround;
}
interface PlateRecordsFile {
  schemaVersion: number;
  measuredOn: string | null;
  records: PlateRecord[];
}

const hexColor = /^#[0-9a-f]{6}$/;
const sha = /^[a-f0-9]{64}$/;
const seedPattern = /^0x[a-f0-9]{64}$/;
const unit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function validDetail(detail: unknown): detail is PlateDetail {
  if (typeof detail !== 'object' || detail === null) return false;
  const candidate = detail as Partial<PlateDetail>;
  return (
    count(candidate.x) &&
    count(candidate.y) &&
    count(candidate.width) &&
    count(candidate.height) &&
    candidate.width > 0 &&
    candidate.height > 0 &&
    unit(candidate.share)
  );
}
function validGround(ground: unknown): ground is PlateGround {
  if (typeof ground !== 'object' || ground === null) return false;
  const candidate = ground as Partial<PlateGround>;
  return (
    typeof candidate.stillSha256 === 'string' &&
    sha.test(candidate.stillSha256) &&
    typeof candidate.tone === 'string' &&
    hexColor.test(candidate.tone) &&
    typeof candidate.edge === 'boolean' &&
    typeof candidate.centre === 'object' &&
    candidate.centre !== null &&
    unit(candidate.centre.x) &&
    unit(candidate.centre.y) &&
    Array.isArray(candidate.detail) &&
    candidate.detail.length <= 3 &&
    candidate.detail.every(validDetail)
  );
}
function copyGround(ground: PlateGround): PlateGround {
  return {
    stillSha256: ground.stillSha256,
    tone: ground.tone,
    edge: ground.edge,
    centre: { x: ground.centre.x, y: ground.centre.y },
    detail: ground.detail.map(({ x, y, width, height, share }) => ({ x, y, width, height, share })),
  };
}

/** Only well-formed records are kept; a malformed expression is dropped, never guessed. */
export function parsePlateRecords(raw: unknown): Map<number, PlateRecord> {
  const records = new Map<number, PlateRecord>();
  if (typeof raw !== 'object' || raw === null) return records;
  const file = raw as Partial<PlateRecordsFile>;
  if (file.schemaVersion !== 2 || !Array.isArray(file.records)) return records;
  for (const record of file.records as unknown[]) {
    if (typeof record !== 'object' || record === null) continue;
    const candidate = record as Partial<PlateRecord>;
    if (
      !Number.isSafeInteger(candidate.id) ||
      typeof candidate.seed !== 'string' ||
      !seedPattern.test(candidate.seed)
    )
      continue;
    const parsed: PlateRecord = { id: candidate.id as number, seed: candidate.seed };
    if (validGround(candidate.ink)) parsed.ink = copyGround(candidate.ink);
    if (validGround(candidate.light)) parsed.light = copyGround(candidate.light);
    records.set(parsed.id, parsed);
  }
  return records;
}

const records = parsePlateRecords(data);

/** A ground applies only to the exact still it was measured from. */
export function getPlateGround(
  id: number,
  expression: string,
  stillSha256?: string,
): PlateGround | undefined {
  const record = records.get(id);
  const ground =
    expression === 'ink' ? record?.ink : expression === 'light' ? record?.light : undefined;
  if (!ground || !stillSha256 || ground.stillSha256 !== stillSha256) return undefined;
  return ground;
}

export function getPlateRecord(id: number): PlateRecord | undefined {
  return records.get(id);
}

/** The date the committed records were measured, or null before the first measurement. */
export const plateRecordsMeasuredOn: string | null =
  (data as Partial<PlateRecordsFile>).measuredOn ?? null;
