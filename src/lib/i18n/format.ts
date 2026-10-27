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
