export type DrawingKind =
  "trend" | "ray" | "horizontal" | "vertical" | "rectangle" | "measure";
export type DrawingColor = "blue" | "accent" | "green" | "red";
export type DrawingPoint = { logical: number; price: number };
export type Drawing = {
  id: string;
  kind: DrawingKind;
  from: DrawingPoint;
  to: DrawingPoint;
  color: DrawingColor;
};
export type DrawingHistory = {
  past: Drawing[][];
  present: Drawing[];
  future: Drawing[][];
};
export const emptyDrawings: DrawingHistory = {
  past: [],
  present: [],
  future: [],
};
export type DrawingAction =
  | { type: "add" | "update"; drawing: Drawing }
  | { type: "remove"; id: string }
  | { type: "clear" | "undo" | "redo" };
export function drawingHistory(
  state: DrawingHistory,
  action: DrawingAction,
): DrawingHistory {
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  }
  let next: Drawing[];
  if (action.type === "add") next = [...state.present, action.drawing];
  else if (action.type === "update")
    next = state.present.map((d) =>
      d.id === action.drawing.id ? action.drawing : d,
    );
  else if (action.type === "remove")
    next = state.present.filter((d) => d.id !== action.id);
  else next = [];
  if (
    next.length === state.present.length &&
    next.every((d, i) => d === state.present[i])
  )
    return state;
  return {
    past: [...state.past.slice(-49), state.present],
    present: next,
    future: [],
  };
}
export function measure(from: DrawingPoint, to: DrawingPoint) {
  return {
    change: to.price - from.price,
    percent: ((to.price - from.price) / from.price) * 100,
    bars: Math.round(Math.abs(to.logical - from.logical)),
  };
}
export function moveDrawing(
  drawing: Drawing,
  from: DrawingPoint,
  to: DrawingPoint,
): Drawing {
  const deltaX = to.logical - from.logical,
    deltaY = to.price - from.price;
  return {
    ...drawing,
    from: {
      logical: drawing.from.logical + deltaX,
      price: drawing.from.price + deltaY,
    },
    to: {
      logical: drawing.to.logical + deltaX,
      price: drawing.to.price + deltaY,
    },
  };
}
export function rayEnd(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const candidates = [
    dx > 0 ? (width - a.x) / dx : dx < 0 ? -a.x / dx : Infinity,
    dy > 0 ? (height - a.y) / dy : dy < 0 ? -a.y / dy : Infinity,
  ].filter((n) => Number.isFinite(n) && n >= 0);
  const factor = candidates.length ? Math.min(...candidates) : 1;
  return { x: a.x + dx * factor, y: a.y + dy * factor };
}
