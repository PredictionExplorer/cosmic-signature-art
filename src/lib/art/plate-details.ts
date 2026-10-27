import data from './plate-records.json';
import type { PlateGround } from './plate-records';
import { isExpression, type ArtInterpretation, type Artwork, type PlateDetail } from './types';

/**
 * The full plate records (scripts/build-plate-records.mjs), read on the server only: the
 * grounds the client also has, plus each still's detail windows, which travel with a work's
 * own media as `detail` rather than as a registry every page would carry. A window applies
 * only to the exact still it was measured from.
 */
export interface PlateRecord {
  id: number;
  seed: `0x${string}`;
  ink?: PlateGround & { detail: PlateDetail[] };
  light?: PlateGround & { detail: PlateDetail[] };
}
interface PlateRecordsFile {
  schemaVersion: number;
  measuredOn: string | null;
  records: PlateRecord[];
}

const seedPattern = /^0x[a-f0-9]{64}$/;
const hexColor = /^#[0-9a-f]{6}$/;
const sha = /^[a-f0-9]{64}$/;
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const unit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** The same ground rule the client reader applies, kept here so this module stands alone. */
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
    unit(candidate.centre.y)
  );
}

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
function validRecordGround(ground: unknown): ground is PlateRecord['ink'] & object {
  if (!validGround(ground)) return false;
  const detail = (ground as { detail?: unknown }).detail;
  return Array.isArray(detail) && detail.length <= 3 && detail.every(validDetail);
}
function copy(ground: NonNullable<PlateRecord['ink']>): NonNullable<PlateRecord['ink']> {
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
    if (validRecordGround(candidate.ink)) parsed.ink = copy(candidate.ink);
    if (validRecordGround(candidate.light)) parsed.light = copy(candidate.light);
    records.set(parsed.id, parsed);
  }
  return records;
}

const records = parsePlateRecords(data);

export function getPlateRecord(id: number): PlateRecord | undefined {
  return records.get(id);
}

/** The detail windows of the exact still, or nothing for any other still. */
export function getPlateDetail(
  id: number,
  expression: string,
  stillSha256?: string,
): PlateDetail[] | undefined {
  const record = records.get(id);
  const ground =
    expression === 'ink' ? record?.ink : expression === 'light' ? record?.light : undefined;
  if (!ground || !stillSha256 || ground.stillSha256 !== stillSha256) return undefined;
  return ground.detail.map((window) => ({ ...window }));
}

/** Attach each interpretation's detail windows, bound to its still hash. */
export function withPlateDetail(
  work: Pick<Artwork, 'id' | 'seed'>,
  media: ArtInterpretation[],
): ArtInterpretation[] {
  return media.map((interpretation) => {
    const clean = { ...interpretation };
    delete clean.detail;
    if (!isExpression(interpretation.id)) return clean;
    const record = records.get(work.id);
    if (!record || !work.seed || record.seed !== work.seed) return clean;
    const detail = getPlateDetail(work.id, interpretation.id, interpretation.stillSha256);
    if (detail?.length) clean.detail = detail;
    return clean;
  });
}

/** The date the committed records were measured, or null before the first measurement. */
export const plateRecordsMeasuredOn: string | null =
  (data as Partial<PlateRecordsFile>).measuredOn ?? null;
