import { test } from "node:test";
import assert from "node:assert/strict";
import { randomSession, futureCandles } from "../lib/market";

test("API startup and future replay keep the selected market", async () => {
  const original = globalThis.fetch,
    random = Math.random;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input) === "/data/index.json")
      return new Response("", { status: 404 });
    const url = new URL(String(input));
    const symbol = url.searchParams.get("symbol")!;
    calls.push(symbol);
    const start = Number(
      url.searchParams.get("startTime") ?? Date.UTC(2024, 0, 1),
    );
    const price = symbol === "ETHUSDT" ? 2000 : 40000;
    return Response.json(
      Array.from({ length: 600 }, (_, i) => [
        start + i * 300000,
        String(price),
        String(price + 2),
        String(price - 1),
        String(price + 1),
        "0",
        start + (i + 1) * 300000 - 1,
      ]),
    );
  }) as typeof fetch;
  try {
    for (const [pick, symbol] of [
      [0.1, "BTCUSDT"],
      [0.9, "ETHUSDT"],
    ] as const) {
      Math.random = () => pick;
      const s = await randomSession("5m");
      assert.equal(s.symbol, symbol);
      await futureCandles(s, s.cursor);
      assert.deepEqual(calls.splice(0), [symbol, symbol]);
    }
  } finally {
    globalThis.fetch = original;
    Math.random = random;
  }
});
