import data from './plate-grounds.json';

/**
 * The ground every plate hangs on, measured offline and keyed to the still hash it was taken
 * from (scripts/build-plate-records.mjs): the Ink sheet's border tone letterboxes the plate
 * without an edge, the Light field is asserted to be true black, and the luminance-weighted
 * centre is the eye line. This is the client's projection of the records; the detail windows
 * travel with a work's own media (plate-details.ts, server side) rather than in a registry.
 */
export type { PlateDetail } from './types';
export interface PlateCentre {
  /** Fraction of the still's width, 0 at the left edge. */
  x: number;
  /** Fraction of the still's height, 0 at the top edge. */
  y: number;
}
export interface PlateGround {
  stillSha256: string;
  /** Mean colour of the still's outer 8 px border, as #rrggbb. */
  tone: string;
  /** True when ink (or light) reaches the border, so a deliberate hairline is hung. */
  edge: boolean;
  /** Luminance-weighted centre: darkness against the sheet for Ink, brightness for Light. */
  centre: PlateCentre;
}
export interface PlateGrounds {
  id: number;
  ink?: PlateGround;
  light?: PlateGround;
}
interface PlateGroundsFile {
  schemaVersion: number;
  measuredOn: string | null;
  grounds: PlateGrounds[];
}

const hexColor = /^#[0-9a-f]{6}$/;
const sha = /^[a-f0-9]{64}$/;
const unit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

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
function copyGround(ground: PlateGround): PlateGround {
  return {
    stillSha256: ground.stillSha256,
    tone: ground.tone,
    edge: ground.edge,
    centre: { x: ground.centre.x, y: ground.centre.y },
  };
}

/** Only well-formed grounds are kept; a malformed expression is dropped, never guessed. */
export function parsePlateGrounds(raw: unknown): Map<number, PlateGrounds> {
  const grounds = new Map<number, PlateGrounds>();
  if (typeof raw !== 'object' || raw === null) return grounds;
  const file = raw as Partial<PlateGroundsFile>;
  if (file.schemaVersion !== 2 || !Array.isArray(file.grounds)) return grounds;
  for (const entry of file.grounds as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<PlateGrounds>;
    if (!Number.isSafeInteger(candidate.id)) continue;
    const parsed: PlateGrounds = { id: candidate.id as number };
    if (validGround(candidate.ink)) parsed.ink = copyGround(candidate.ink);
    if (validGround(candidate.light)) parsed.light = copyGround(candidate.light);
    grounds.set(parsed.id, parsed);
  }
  return grounds;
}

const grounds = parsePlateGrounds(data);

/** A ground applies only to the exact still it was measured from. */
export function getPlateGround(
  id: number,
  expression: string,
  stillSha256?: string,
): PlateGround | undefined {
  const entry = grounds.get(id);
  const ground =
    expression === 'ink' ? entry?.ink : expression === 'light' ? entry?.light : undefined;
  if (!ground || !stillSha256 || ground.stillSha256 !== stillSha256) return undefined;
  return ground;
}

export function getPlateRecord(id: number): PlateGrounds | undefined {
  return grounds.get(id);
}

/** The date the committed grounds were measured, or null before the first measurement. */
export const plateRecordsMeasuredOn: string | null =
  (data as Partial<PlateGroundsFile>).measuredOn ?? null;
