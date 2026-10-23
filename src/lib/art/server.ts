import 'server-only';
import { cache } from 'react';
import { createArtRepository } from './adapter';
import { createArtworkHistoryRepository } from './history';
import { createArtworkDetailsRepository } from './details';

const repository = createArtRepository();
// Metadata and the page share one identity and media read within a server request.
export const getArtwork = cache(repository.getArtwork);
export const getCollection = repository.getCollection;
const historyRepository = createArtworkHistoryRepository();
export const getArtworkHistory = cache(historyRepository.getArtworkHistory);
const detailsRepository = createArtworkDetailsRepository();
export const getArtworkDetails = cache(detailsRepository.getArtworkDetails);
