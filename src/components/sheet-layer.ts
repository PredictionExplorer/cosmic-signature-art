import {
  laySheets,
  ordersOf,
  type Box,
  type Maps,
  type Orders,
  type Sheets,
} from '@/lib/crossing/sheet';
import type { SheetReply, SheetRequest } from '@/lib/crossing/sheet.worker';

/** The worker is a module of its own; tests replace the global Worker. */
function sheetWorker(): Worker {
  return new Worker(new URL('../lib/crossing/sheet.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/**
 * Lays a work's two sheets for a layout (src/lib/crossing/sheet.ts): in a worker, where this
 * browser has one, and here where it has none or its worker fails. Only the newest request is
 * answered; a request it overtook resolves null, so a layout that has since changed is never
 * painted with the sheet of the one before.
 */
export class SheetLayer {
  private worker: Worker | null = null;
  /** The orders for laying here, made the first time a sheet has to be. */
  private orders: Orders | null = null;
  private request = 0;
  private waiting: {
    id: number;
    region: Box;
    art: Box;
    answer: (sheets: Sheets | null) => void;
  } | null = null;

  constructor(private readonly maps: Maps) {
    if (typeof Worker === 'undefined') return;
    try {
      const worker = sheetWorker();
      worker.onmessage = ({ data }: MessageEvent<SheetReply>) => this.replied(data);
      // A worker that cannot load or run: every sheet is laid here from now on.
      worker.onerror = () => this.fail();
      worker.postMessage({ type: 'maps', ...maps } satisfies SheetRequest);
      this.worker = worker;
    } catch {
      this.worker = null;
    }
  }

  /** The two sheets for this layout, or null if a newer layout was asked for meanwhile. */
  lay(region: Box, art: Box): Promise<Sheets | null> {
    this.waiting?.answer(null);
    const id = ++this.request;
    return new Promise((answer) => {
      this.waiting = { id, region, art, answer };
      if (this.worker)
        this.worker.postMessage({ type: 'lay', id, region, art } satisfies SheetRequest);
      else this.here();
    });
  }

  private replied(reply: SheetReply) {
    const waiting = this.waiting;
    if (!waiting || reply.id !== waiting.id) return;
    if (reply.type === 'failed') return this.fail();
    this.waiting = null;
    waiting.answer({ night: reply.night, paper: reply.paper });
  }

  /** The worker is let go, and whoever waits on it is answered from here. */
  private fail() {
    this.worker?.terminate();
    this.worker = null;
    this.here();
  }

  private here() {
    const waiting = this.waiting;
    if (!waiting) return;
    this.waiting = null;
    try {
      this.orders ??= ordersOf(this.maps);
      waiting.answer(laySheets(this.orders, waiting.region, waiting.art));
    } catch {
      waiting.answer(null);
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.waiting?.answer(null);
    this.waiting = null;
  }
}
