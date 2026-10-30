import { OrreryEngine, type OrreryReply, type OrreryRequest, type Surface } from './orrery';

/**
 * The Orrery's worker: every cell's physics and drawing, off the main thread. The page hands it
 * one OffscreenCanvas per work and says which are in view, whether motion is welcome and when a
 * cell changes size; the worker draws on its own frame clock and sleeps when nothing is in view.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OrreryRequest>) => void) | null;
  postMessage(message: OrreryReply): void;
  requestAnimationFrame?: (callback: (time: number) => void) => number;
};

let engine: OrreryEngine | null = null;
let scheduled = false;

function schedule() {
  if (scheduled || !engine) return;
  scheduled = true;
  const tick = () => {
    scheduled = false;
    if (engine?.frame(performance.now())) schedule();
  };
  // A worker's animation frames follow the page's; a worker without them keeps a 60 Hz beat.
  if (scope.requestAnimationFrame) scope.requestAnimationFrame(tick);
  else setTimeout(tick, 16);
}

scope.onmessage = ({ data }) => {
  const now = performance.now();
  if (data.type === 'cells') {
    engine = new OrreryEngine(data.ratio, data.moving, (id) =>
      scope.postMessage({ type: 'drawn', id }),
    );
    for (const cell of data.cells) {
      const surface = cell.canvas.getContext('2d') as Surface | null;
      if (surface) engine.add(cell.id, surface, cell.window, cell.hues);
    }
  } else if (data.type === 'visible') engine?.visible(data.id, data.visible, now);
  else if (data.type === 'moving') engine?.setMoving(data.moving);
  else if (data.type === 'size') engine?.resize(data.id, data.width, data.height);
  schedule();
};
