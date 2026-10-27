import type { ArtFilm, ArtInterpretation } from '@/lib/art/types';
import type { Messages } from './en';

/** Fill `{name}` placeholders in a catalog string; unknown names are left visible, never dropped. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** A published file's size in the reader's own units: megabytes to one place, kilobytes below one. */
export function formatBytes(bytes: number, locale: string): string {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 1
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'megabyte',
        maximumFractionDigits: 1,
      }).format(megabytes)
    : new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(bytes / 1000);
}

/** Elapsed time in plain minutes and seconds; never the contract's hours. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

/** The word for an expression: the catalog's for Ink and Light, the publisher's label otherwise. */
export function expressionWord(
  media: Pick<ArtInterpretation, 'id' | 'label'> | string | undefined,
  t: Messages,
): string | undefined {
  const id = typeof media === 'string' ? media : media?.id;
  if (id === 'ink') return t.ink;
  if (id === 'light') return t.light;
  return typeof media === 'string' ? media : media?.label;
}

/** The word for a film variant: the catalog's for the published roles, the publisher's label otherwise. */
export function filmLabel(film: ArtFilm, t: Messages): string {
  return film.id === 'normal'
    ? t.film
    : film.id === 'medium'
      ? t.longStudy
      : film.id === 'slow'
        ? t.extendedStudy
        : film.id === 'sweep'
          ? t.spectralSweep
          : film.label;
}
