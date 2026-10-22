import 'server-only';
import { createArtRepository } from './adapter';

const repository = createArtRepository();
export const getArtwork = repository.getArtwork;
export const getCollection = repository.getCollection;
