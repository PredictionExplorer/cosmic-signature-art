import 'server-only';
import { cache } from 'react';
import { createArtRepository } from './adapter';

const repository = createArtRepository();
// Metadata and the page share one identity and media read within a server request.
export const getArtwork = cache(repository.getArtwork);
export const getCollection = repository.getCollection;
