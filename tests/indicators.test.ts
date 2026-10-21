import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEMA, nextEMA } from "../lib/indicators";
import { ORDER_TYPES, DEFAULT_ORDER_TYPE } from "../lib/order-ticket";

test("EMA seeds from the first revealed close and follows the exponential recurrence", () => {
  const candles = [100, 110, 120].map((close, time) => ({ time, close }));
  assert.deepEqual(calculateEMA(candles, 3), [
    { time: 0, value: 100 }, { time: 1, value: 105 }, { time: 2, value: 112.5 },
  ]);
  assert.deepEqual(calculateEMA([]), []);
  assert.throws(() => calculateEMA(candles, 0));
  assert.throws(() => nextEMA(100, 101, 1.5));
});

test("EMA replay uses only the revealed prefix and incremental updates match a full calculation", () => {
  const candles = Array.from({ length: 100 }, (_, index) => ({
    time: 1704067200 + index * 300, close: 100 + Math.sin(index / 7) * 5,
  }));
  const full = calculateEMA(candles, 20);
  let incremental = candles[0].close;
  for (let count = 1; count <= candles.length; count++) {
    if (count > 1) incremental = nextEMA(incremental, candles[count - 1].close, 20);
    const prefix = calculateEMA(candles.slice(0, count), 20);
    assert.deepEqual(prefix, full.slice(0, count));
    assert.equal(incremental, prefix.at(-1)!.value);
  }
  const scaled = calculateEMA(candles.map((bar) => ({ ...bar, close: bar.close * 2.5 })), 20);
  scaled.forEach((point, index) => assert.ok(Math.abs(point.value - full[index].value * 2.5) < 1e-10));
});

test("ticket order and the default entry type are stop-first", () => {
  assert.deepEqual(ORDER_TYPES, ["stop", "stop-limit", "market", "limit"]);
  assert.equal(DEFAULT_ORDER_TYPE, "stop");
});
