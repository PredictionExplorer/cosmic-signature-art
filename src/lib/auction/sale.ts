import { cycles, type CollectionIndex } from '@/lib/art/collection-index';

/**
 * The next sale is the coming cycle's eight works. Its number is read from the index, never
 * typed into copy; eligibility and dates remain the chain's to state.
 */
export function comingCycle(index?: CollectionIndex): number {
  return (cycles(index).at(-1)?.cycle ?? -1) + 1;
}
