import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { aggregate, parseArchive } from "../lib/market";
import type { Candle } from "../lib/engine";
const base = 1704067200;
const rows = Array.from({ length: 12 }, (_, i): Candle => ({
  time: base + i * 300,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
}));
test("aggregation preserves OHLC and interval alignment", () => {
  const result = aggregate(rows, "15m");
  assert.equal(result.length, 4);
  assert.deepEqual(result[0], {
    time: base,
    open: 100,
    high: 104,
    low: 99,
    close: 103,
  });
  assert.equal(aggregate(rows, "1h").length, 1);
  assert.equal(aggregate(rows, "5m").length, 12);
});
test("incomplete or gapped intervals are never fabricated", () => {
  assert.equal(aggregate(rows.slice(1), "1h").length, 0);
  assert.equal(
    aggregate(
      rows.filter((_, i) => i !== 5),
      "1h",
    ).length,
    0,
  );
});
test("CSV archive parsing skips headers and handles milliseconds and microseconds", () => {
  for (const multiplier of [1000, 1e6]) {
    const bytes = zipSync({
      "test.csv": strToU8(
        `open_time,open,high,low,close\n${base * multiplier},100,102,99,101\n`,
      ),
    });
    assert.deepEqual(parseArchive(bytes)[0], {
      time: base,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    });
  }
});
test("empty or malformed archives fail visibly", () => {
  assert.throws(() =>
    parseArchive(zipSync({ "empty.csv": strToU8("open_time,open\n") })),
  );
});
