export type LinePreview = { id: string; price: number };
type DragCallbacks = {
  toPrice: (y: number) => number | null;
  preview: (line: LinePreview) => void;
  commit: (line: LinePreview) => void;
  start: () => void;
  finish: () => void;
};

/** Pointer coordinates stay in chart pixels; grabbing near a line must not jump it. */
export function createLineDrag(callbacks: DragCallbacks) {
  let drag: (LinePreview & { original: number; offset: number }) | null = null;
  return {
    get active() {
      return drag;
    },
    begin(id: string, price: number, pointerY: number, lineY: number) {
      if (drag) return;
      drag = { id, price, original: price, offset: pointerY - lineY };
      callbacks.start();
      callbacks.preview({ id, price });
    },
    move(pointerY: number) {
      if (!drag) return;
      const price = callbacks.toPrice(pointerY - drag.offset);
      if (price === null || !Number.isFinite(price) || price <= 0) return;
      drag.price = +price.toFixed(6);
      callbacks.preview({ id: drag.id, price: drag.price });
    },
    end(cancel = false) {
      if (!drag) return;
      const completed = drag;
      drag = null;
      try {
        if (cancel)
          callbacks.preview({ id: completed.id, price: completed.original });
        else callbacks.commit({ id: completed.id, price: completed.price });
      } finally {
        callbacks.finish();
      }
    },
  };
}
