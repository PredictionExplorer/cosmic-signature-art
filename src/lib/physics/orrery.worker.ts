import { OrreryEngine, type OrreryReply, type OrreryRequest, type Surface } from './orrery';

/**
 * The Orrery's worker: every cell's physics and drawing, off the main thread. The page hands it
 * one OffscreenCanvas per work and says which are in view, whether motion is welcome and when a
 * cell changes size. It draws a frame each time the page asks for one and says whether there is
 * more to draw; it keeps no beat of its own (src/lib/physics/orrery-pace.ts).
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OrreryRequest>) => void) | null;
  postMessage(message: OrreryReply): void;
};

let engine: OrreryEngine | null = null;

scope.onmessage = ({ data }) => {
  const now = performance.now();
  if (data.type === 'frame')
    scope.postMessage({ type: 'framed', more: engine?.frame(now) ?? false });
  else if (data.type === 'cells') {
    engine = new OrreryEngine(data.ratio, data.moving, {
      onDrawn: (id) => scope.postMessage({ type: 'drawn', id }),
    });
    for (const cell of data.cells) {
      const surface = cell.canvas.getContext('2d') as Surface | null;
      // A canvas this worker cannot draw on: the page shows every work's still instead.
      if (!surface) {
        engine = null;
        scope.postMessage({ type: 'failed' });
        return;
      }
      engine.add(cell.id, surface, cell.window, cell.hues);
    }
  } else if (data.type === 'visible') engine?.visible(data.id, data.visible, now);
  else if (data.type === 'moving') engine?.setMoving(data.moving);
  else if (data.type === 'size') engine?.resize(data.id, data.width, data.height);
};
