import { test } from "node:test";
import assert from "node:assert/strict";
import { workingChartLines } from "../lib/chart-lines";
import {
  createGame,
  submitOrder,
  cancelOrder,
  modifyProtection,
  closePosition,
  finishTurn,
} from "../lib/engine";
import { CHART_THEMES } from "../lib/theme";
const palette = CHART_THEMES.dark;
const input = {
  side: "long" as const,
  type: "market" as const,
  entry: 100,
  sl: 95,
  tp: 110,
  risk: 1,
  leverage: 10,
};
test("every pending order has identified entry and bracket lines, including stop-limit prices", () => {
  let g = submitOrder(createGame(100, 1), {
    ...input,
    type: "limit",
    entry: 99,
    tp: 105,
  });
  g = submitOrder(g, {
    ...input,
    side: "short",
    type: "stop-limit",
    entry: 98,
    limit: 97.9999,
    sl: 102,
    tp: 90,
  });
  const lines = workingChartLines(g, palette);
  assert.equal(lines.length, 7);
  for (const order of g.orders) {
    const entry = lines.find((line) => line.id === `order-${order.id}-entry`)!;
    assert.equal(entry.price, order.entry);
    assert.ok(entry.cancelLabel!.includes(String(order.id)));
    assert.ok(entry.title.includes(order.qty.toFixed(3)));
    assert.equal(
      lines.find((line) => line.id === `order-${order.id}-sl`)!.price,
      order.sl,
    );
    assert.equal(
      lines.find((line) => line.id === `order-${order.id}-tp`)!.price,
      order.tp,
    );
  }
  const canceled = cancelOrder(g, g.orders[0].id);
  assert.equal(workingChartLines(canceled, palette).length, 4);
  assert.deepEqual(workingChartLines(finishTurn(g), palette), []);
});
test("a position has one average-entry line; its removable protection follows the full remaining quantity", () => {
  let g = submitOrder(createGame(100, 1), input);
  g = submitOrder(g, { ...input, sl: 97, tp: 112 });
  g = closePosition(g, 0.25);
  let lines = workingChartLines(g, palette);
  assert.equal(lines.filter((line) => line.id === "position-entry").length, 1);
  assert.equal(lines[0].price, g.position!.entry);
  assert.match(lines[0].title, /AVG LONG/);
  for (const line of lines)
    assert.ok(line.title.includes(g.position!.qty.toFixed(3)));
  assert.ok(lines.find((line) => line.id === "position-sl")!.cancelLabel);
  g = modifyProtection(g, null, 112);
  lines = workingChartLines(g, palette);
  assert.equal(
    lines.find((line) => line.id === "position-sl"),
    undefined,
  );
  assert.ok(lines.find((line) => line.id === "position-tp"));
  g = modifyProtection(g, 96, null);
  lines = workingChartLines(g, palette);
  assert.equal(lines.find((line) => line.id === "position-sl")!.price, 96);
  assert.equal(
    lines.find((line) => line.id === "position-tp"),
    undefined,
  );
  assert.deepEqual(workingChartLines(null, palette), []);
});
