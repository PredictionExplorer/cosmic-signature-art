/** One numbering grammar: the work's name is "№ 031"; the bare folio is "031". */
export function workFolio(id: number): string {
  return String(id).padStart(3, '0');
}
export function workNumber(id: number): string {
  return `№ ${workFolio(id)}`;
}
