import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { randomSession, futureCandles } from "../lib/market";

test("BTC and ETH are independently selected, cached, normalized and replayed", async () => {
  const oldFetch = globalThis.fetch,
    oldRandom = Math.random;
  const downloads = new Map<string, number>();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "/data/index.json")
      return Response.json({
        version: 2,
        symbols: {
          BTCUSDT: { months: ["2024-01"] },
          ETHUSDT: { months: ["2024-01"] },
        },
      });
    const symbol = url.includes("ETHUSDT") ? "ETHUSDT" : "BTCUSDT";
    assert.equal(url, `/data/${symbol}-5m-2024-01.zip`);
    downloads.set(symbol, (downloads.get(symbol) ?? 0) + 1);
    const start = Date.UTC(2024, 0, 1);
    const price = symbol === "BTCUSDT" ? 40000 : 2000;
    return new Response(
      zipSync({
        "candles.csv": strToU8(
          Array.from(
            { length: 31 * 288 },
            (_, i) =>
              `${start + i * 300000},${price + i},${price + i + 2},${price + i - 1},${price + i + 1}`,
          ).join("\n"),
        ),
      }),
    );
  }) as typeof fetch;
  try {
    Math.random = () => 0.2;
    const btc = await randomSession("5m");
    Math.random = () => 0.8;
    const eth = await randomSession("5m");
    assert.equal(btc.symbol, "BTCUSDT");
    assert.equal(eth.symbol, "ETHUSDT");
    assert.ok(btc.factor !== eth.factor);
    for (const session of [btc, eth]) {
      assert.equal(session.candles.at(-1)!.close, 100);
      const next = await futureCandles(session, session.cursor);
      assert.equal(next[0].time, session.cursor + 300);
      assert.ok(Math.abs(next[0].close - 100 - session.factor) < 1e-10);
    }
    await Promise.all([
      randomSession("15m", undefined, "ETHUSDT"),
      randomSession("15m", undefined, "BTCUSDT"),
      randomSession("15m", undefined, "ETHUSDT"),
    ]);
    assert.deepEqual(
      [...downloads.values()],
      [1, 1],
      "Timeframes reuse each symbol’s archive independently",
    );
  } finally {
    globalThis.fetch = oldFetch;
    Math.random = oldRandom;
  }
});
