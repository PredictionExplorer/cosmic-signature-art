import { AWAITS_STREAM } from '@/lib/without-script';

/**
 * A plate-shaped reservation on the current ground, never a spinner: the place a page keeps
 * while it waits for a record only the indexer holds. Nothing else waits behind it. A page the
 * venue can set from what it holds itself (a work in the registry or the index, the collection,
 * every prerendered page) is sent whole, with no boundary around it.
 */
export function WaitingRoom() {
  return (
    <main id="main" className="loading-room" aria-busy="true" {...AWAITS_STREAM}>
      <div className="loading-plate" aria-hidden="true" />
      <p>Cosmic Signature</p>
    </main>
  );
}
