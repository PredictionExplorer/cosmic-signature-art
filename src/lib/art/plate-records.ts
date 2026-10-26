import data from './plate-records.json';

/**
 * Offline measurements of a work's own ground, keyed to the still hash they were
 * taken from. The Ink sheet's border tone letterboxes the plate without an edge; the
 * Light field is asserted to be true black. Produced by scripts/build-plate-records.mjs.
 */
export interface PlateGround {
  stillSha256: string;
  /** Mean colour of the still's outer 8 px border, as #rrggbb. */
  tone: string;
  /** True when ink (or light) reaches the border, so a deliberate hairline is hung. */
  edge: boolean;
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
function validGround(ground: unknown): ground is PlateGround {
  if (typeof ground !== 'object' || ground === null) return false;
  const candidate = ground as Partial<PlateGround>;
  return (
    typeof candidate.stillSha256 === 'string' &&
    sha.test(candidate.stillSha256) &&
    typeof candidate.tone === 'string' &&
    hexColor.test(candidate.tone) &&
    typeof candidate.edge === 'boolean'
  );
}

/** Only well-formed records are kept; a malformed expression is dropped, never guessed. */
export function parsePlateRecords(raw: unknown): Map<number, PlateRecord> {
  const records = new Map<number, PlateRecord>();
  if (typeof raw !== 'object' || raw === null) return records;
  const file = raw as Partial<PlateRecordsFile>;
  if (file.schemaVersion !== 1 || !Array.isArray(file.records)) return records;
  for (const record of file.records as unknown[]) {
    if (typeof record !== 'object' || record === null) continue;
    const candidate = record as Partial<PlateRecord>;
    if (
      !Number.isSafeInteger(candidate.id) ||
      typeof candidate.seed !== 'string' ||
      !seedPattern.test(candidate.seed)
    )
      continue;
    const ink = validGround(candidate.ink) ? candidate.ink : undefined;
    const light = validGround(candidate.light) ? candidate.light : undefined;
    const parsed: PlateRecord = { id: candidate.id as number, seed: candidate.seed };
    if (ink) parsed.ink = { stillSha256: ink.stillSha256, tone: ink.tone, edge: ink.edge };
    if (light)
      parsed.light = { stillSha256: light.stillSha256, tone: light.tone, edge: light.edge };
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
