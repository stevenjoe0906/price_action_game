import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { randomSession } from "../lib/market";

test("archive requests are shared across timeframes and concurrent starts; daily history loads in bounded parallel batches", async () => {
  const originalFetch = globalThis.fetch,
    originalRandom = Math.random;
  const months = Array.from({ length: 24 }, (_, i) =>
    new Date(Date.UTC(2022, i, 1)).toISOString().slice(0, 7),
  );
  const counts = new Map<string, number>();
  let active = 0,
    peak = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "/data/index.json") return Response.json({ months });
    assert.ok(url.startsWith("/data/"));
    const month = url.match(/5m-(\d{4}-\d{2})\.zip$/)![1];
    counts.set(month, (counts.get(month) ?? 0) + 1);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const date = new Date(start);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const rows = Array.from(
      { length: (date.getTime() - start) / 300000 },
      (_, i) => `${start + i * 300000},100,102,99,101`,
    ).join("\n");
    active--;
    return new Response(zipSync({ "candles.csv": strToU8(rows) }));
  }) as typeof fetch;
  Math.random = () => 0.9;
  try {
    const [first] = await Promise.all([
      randomSession("5m"),
      randomSession("15m"),
      randomSession("15m"),
    ]);
    const before = [...counts.entries()];
    const [a, b] = await Promise.all([
      randomSession("15m"),
      randomSession("15m"),
    ]);
    assert.deepEqual(
      [...counts.entries()],
      before,
      "Other timeframes reuse parsed raw archives",
    );
    assert.deepEqual(
      a.candles,
      b.candles,
      "Concurrent callers receive the same complete data",
    );
    assert.equal(first.candles.length, 1500);
    const messages: string[] = [];
    const daily = await randomSession("1d", (message) =>
      messages.push(message),
    );
    assert.ok(
      peak > 1 && peak <= 4,
      `Observed ${peak} concurrent archive requests`,
    );
    assert.ok(daily.candles.length >= 500 && daily.candles.length <= 1500);
    assert.equal(daily.candles.at(-1)!.close, 100);
    assert.ok(
      daily.candles.every(
        (c, i, rows) => !i || c.time - rows[i - 1].time === 86400,
      ),
    );
    assert.ok(messages.some((m) => m.includes("Preparing historical candles")));
    assert.ok(
      [...counts.values()].every((count) => count === 1),
      "No redundant downloads",
    );
  } finally {
    globalThis.fetch = originalFetch;
    Math.random = originalRandom;
  }
});
