/** View preferences are presentation hints, never artwork or transaction identity. */
export interface ArtworkViewQuery {
  view?: string | string[];
  expression?: string | string[];
}

export function artworkViewParams(query: ArtworkViewQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.view === 'still') params.set('view', 'still');
  if (typeof query.expression === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(query.expression))
    params.set('expression', query.expression);
  return params;
}
