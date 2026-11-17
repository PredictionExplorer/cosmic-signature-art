import { laySheets, ordersOf, type Box, type Maps, type Orders, type Sheets } from './sheet';

/**
 * The sheet's worker: a work's two sheets laid off the main thread and handed back by transfer.
 * Laying one takes a few tens of milliseconds, more than a frame, and a page that is busy must
 * never keep a Turn waiting.
 *
 * It is told a work's two arrival maps once, and takes the eight-bit steps out of them once.
 * After that each request names only a layout: everything that turns with the plate, and the
 * work inside it.
 */
export type SheetRequest =
  ({ type: 'maps' } & Maps) | { type: 'lay'; id: number; region: Box; art: Box };

export type SheetReply =
  ({ type: 'laid'; id: number } & Sheets) | { type: 'failed'; id: number; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SheetRequest>) => void) | null;
  postMessage(message: SheetReply, transfer?: Transferable[]): void;
};

let orders: Orders | null = null;

scope.onmessage = ({ data }) => {
  if (data.type === 'maps') {
    orders = ordersOf(data);
    return;
  }
  try {
    if (!orders) throw new Error('no maps to lay a sheet from');
    const sheets = laySheets(orders, data.region, data.art);
    scope.postMessage({ type: 'laid', id: data.id, ...sheets }, [
      sheets.night.time.buffer,
      sheets.paper.time.buffer,
    ]);
  } catch (failure) {
    scope.postMessage({
      type: 'failed',
      id: data.id,
      message: failure instanceof Error ? failure.message : String(failure),
    });
  }
};
