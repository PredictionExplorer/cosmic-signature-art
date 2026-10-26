/** The destination's own plate skeleton on the current ground, never a spinner. */
export default function Loading() {
  return (
    <main id="main" className="loading-room" aria-busy="true">
      <div className="loading-plate" aria-hidden="true" />
      <p>Cosmic Signature</p>
    </main>
  );
}
