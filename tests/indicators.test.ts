import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEMA, nextEMA } from "../lib/indicators";
import { ORDER_TYPES, DEFAULT_ORDER_TYPE } from "../lib/order-ticket";

test("EMA seeds from the first revealed close and follows the exponential recurrence", () => {
  const candles = [100, 110, 120].map((close, time) => ({ time, close }));
  assert.deepEqual(calculateEMA(candles, 3), [
    { time: 0, value: 100 },
    { time: 1, value: 105 },
    { time: 2, value: 112.5 },
  ]);
  assert.deepEqual(calculateEMA([]), []);
  assert.throws(() => calculateEMA(candles, 0));
  assert.throws(() => nextEMA(100, 101, 1.5));
});

test("EMA replay uses only the revealed prefix and incremental updates match a full calculation", () => {
  const candles = Array.from({ length: 100 }, (_, index) => ({
    time: 1704067200 + index * 300,
    close: 100 + Math.sin(index / 7) * 5,
  }));
  const full = calculateEMA(candles, 20);
  let incremental = candles[0].close;
  for (let count = 1; count <= candles.length; count++) {
    if (count > 1)
      incremental = nextEMA(incremental, candles[count - 1].close, 20);
    const prefix = calculateEMA(candles.slice(0, count), 20);
    assert.deepEqual(prefix, full.slice(0, count));
    assert.equal(incremental, prefix.at(-1)!.value);
  }
  const scaled = calculateEMA(
    candles.map((bar) => ({ ...bar, close: bar.close * 2.5 })),
    20,
  );
  scaled.forEach((point, index) =>
    assert.ok(Math.abs(point.value - full[index].value * 2.5) < 1e-10),
  );
});

test("ticket order and the default entry type are stop-first", () => {
  assert.deepEqual(ORDER_TYPES, ["stop", "stop-limit", "market", "limit"]);
  assert.equal(DEFAULT_ORDER_TYPE, "stop");
});

test("MACD has the requested EMA difference, signal and histogram", async () => {
  const { calculateMACD } = await import("../lib/indicators");
  const candles = [10, 12, 14].map((close, time) => ({ time, close }));
  const points = calculateMACD(candles, 2, 3, 2);
  assert.deepEqual(points[0], { time: 0, macd: 0, signal: 0, histogram: 0 });
  assert.ok(Math.abs(points[1].macd - 1 / 3) < 1e-12);
  assert.ok(Math.abs(points[1].signal - 2 / 9) < 1e-12);
  assert.ok(Math.abs(points[1].histogram - 1 / 9) < 1e-12);
  const defaults = calculateMACD(candles);
  const fast = calculateEMA(candles, 12),
    slow = calculateEMA(candles, 26);
  defaults.forEach((point, index) =>
    assert.equal(point.macd, fast[index].value - slow[index].value),
  );
  assert.deepEqual(calculateMACD([]), []);
  assert.throws(() => calculateMACD(candles, 0));
});

test("RSI 14 uses Wilder smoothing, a 14-change warmup and well-defined flat/extreme cases", async () => {
  const { calculateRSI } = await import("../lib/indicators");
  const values = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28, 46.0,
  ];
  const rsi = calculateRSI(values.map((close, time) => ({ close, time })));
  assert.equal(rsi[0].time, 14);
  assert.ok(Math.abs(rsi[0].value - 70.46413502109705) < 1e-10);
  assert.ok(Math.abs(rsi[1].value - 66.24961855355505) < 1e-10);
  for (const [prices, expected] of [
    [Array.from({ length: 20 }, (_, i) => i + 1), 100],
    [Array.from({ length: 20 }, (_, i) => 100 - i), 0],
    [Array(20).fill(100), 50],
  ] as const) {
    const points = calculateRSI(prices.map((close, time) => ({ close, time })));
    assert.equal(points.length, 6);
    assert.ok(points.every((p) => p.value === expected));
  }
  assert.deepEqual(
    calculateRSI(values.slice(0, 14).map((close, time) => ({ close, time }))),
    [],
  );
  assert.throws(() => calculateRSI([], 1.5));
});

test("MACD and RSI streaming match every replay prefix, remain causal and respect normalization", async () => {
  const { calculateMACD, calculateRSI, createMACD, createRSI } =
    await import("../lib/indicators");
  const candles = Array.from({ length: 90 }, (_, time) => ({
    time,
    close: 100 + Math.sin(time / 4) * 10 + time / 100,
  }));
  const macd = calculateMACD(candles),
    rsi = calculateRSI(candles),
    m = createMACD(),
    r = createRSI();
  for (let i = 0; i < candles.length; i++) {
    assert.deepEqual(m.next(candles[i]), macd[i]);
    assert.deepEqual(
      calculateMACD(candles.slice(0, i + 1)),
      macd.slice(0, i + 1),
    );
    assert.deepEqual(
      calculateRSI(candles.slice(0, i + 1)),
      rsi.filter((p) => p.time <= i),
    );
    const point = r.next(candles[i]);
    if (point) assert.deepEqual(point, rsi[i - 14]);
  }
  const scaled = candles.map((c) => ({ ...c, close: c.close * 2.5 }));
  calculateMACD(scaled).forEach((p, i) =>
    assert.ok(Math.abs(p.macd - macd[i].macd * 2.5) < 1e-10),
  );
  calculateRSI(scaled).forEach((p, i) =>
    assert.ok(Math.abs(p.value - rsi[i].value) < 1e-10),
  );
});
