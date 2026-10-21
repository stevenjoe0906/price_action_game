import { test } from "node:test";
import assert from "node:assert/strict";
import {
  drawingHistory,
  emptyDrawings,
  measure,
  moveDrawing,
  rayEnd,
  type Drawing,
} from "../lib/drawings";
const drawing: Drawing = {
  id: "1",
  kind: "trend",
  color: "blue",
  from: { logical: 10, price: 100 },
  to: { logical: 20, price: 110 },
};
test("percentage measurements preserve market meaning after price normalization", () => {
  const real = measure(
    { logical: 10, price: 50000 },
    { logical: 22, price: 52500 },
  );
  const normalized = measure(
    { logical: 10, price: 100 },
    { logical: 22, price: 105 },
  );
  assert.equal(real.percent, 5);
  assert.equal(normalized.percent, real.percent);
  assert.equal(normalized.bars, 12);
  assert.equal(measure(drawing.to, drawing.from).percent.toFixed(2), "-9.09");
});
test("moving annotations preserves their price range and duration", () => {
  const moved = moveDrawing(
    drawing,
    { logical: 0, price: 100 },
    { logical: 7, price: 105 },
  );
  assert.deepEqual(moved.from, { logical: 17, price: 105 });
  assert.deepEqual(moved.to, { logical: 27, price: 115 });
  assert.equal(drawing.from.price, 100);
});
test("undo and redo cover creation, edits, deletion, and clearing without changing saved snapshots", () => {
  const added = drawingHistory(emptyDrawings, { type: "add", drawing });
  const moved = { ...drawing, to: { logical: 30, price: 120 } };
  const edited = drawingHistory(added, { type: "update", drawing: moved });
  const undone = drawingHistory(edited, { type: "undo" });
  assert.deepEqual(undone.present, [drawing]);
  assert.deepEqual(drawingHistory(undone, { type: "redo" }).present, [moved]);
  const removed = drawingHistory(edited, { type: "remove", id: "1" });
  assert.equal(removed.present.length, 0);
  assert.deepEqual(drawingHistory(removed, { type: "undo" }).present, [moved]);
  const cleared = drawingHistory(edited, { type: "clear" });
  assert.deepEqual(drawingHistory(cleared, { type: "undo" }).present, [moved]);
  assert.deepEqual(added.present, [drawing]);
});
test("a fresh annotation after undo clears redo history", () => {
  let state = drawingHistory(emptyDrawings, { type: "add", drawing });
  state = drawingHistory(state, { type: "undo" });
  state = drawingHistory(state, {
    type: "add",
    drawing: { ...drawing, id: "2" },
  });
  assert.equal(state.future.length, 0);
  assert.equal(drawingHistory(state, { type: "redo" }), state);
});
test("rays extend to viewport edges in both directions without changing their anchors", () => {
  assert.deepEqual(rayEnd({ x: 10, y: 10 }, { x: 20, y: 20 }, 100, 60), {
    x: 60,
    y: 60,
  });
  assert.deepEqual(rayEnd({ x: 50, y: 30 }, { x: 30, y: 30 }, 100, 60), {
    x: 0,
    y: 30,
  });
  assert.deepEqual(rayEnd({ x: 20, y: 10 }, { x: 20, y: 10 }, 100, 60), {
    x: 20,
    y: 10,
  });
});
