import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { advance, createGame, finishTurn, submitOrder } from "../lib/engine";
import {
  INTERVALS,
  MARKET_SYMBOLS,
  futureCandles,
  randomSession,
  seconds,
} from "../lib/market";
const root = path.resolve("public/data");
const hasData = existsSync(path.join(root, "index.json"));
test(
  "real downloaded Binance archives replay correctly across all six intervals",
  { skip: !hasData },
  async () => {
    const originalFetch = globalThis.fetch,
      originalRandom = Math.random;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      assert.ok(
        url.startsWith("/data/"),
        "Must not use network when local history exists",
      );
      try {
        return new Response(
          await readFile(path.join(root, path.basename(url))),
        );
      } catch {
        return new Response("", { status: 404 });
      }
    }) as typeof fetch;
    Math.random = () => 0.85;
    try {
      for (const symbol of MARKET_SYMBOLS) {
        const index = JSON.parse(
          await readFile(path.join(root, "index.json"), "utf8"),
        );
        if (symbol !== "BTCUSDT" && !index.symbols?.[symbol]?.months?.length)
          continue;
        for (const interval of INTERVALS) {
          const session = await randomSession(interval, undefined, symbol);
          assert.equal(session.symbol, symbol);
          assert.equal(session.source, "local");
          assert.ok(
            session.candles.length >= 500 && session.candles.length <= 1500,
          );
          const last = session.candles.at(-1)!;
          assert.ok(Math.abs(last.close - 100) < 1e-8);
          assert.ok(last.time >= Date.UTC(2022, 0, 1) / 1000);
          const future = await futureCandles(session, last.time);
          assert.ok(future.length > 0);
          assert.equal(future[0].time, last.time + seconds(interval));
          let game = submitOrder(createGame(last.close, last.time), {
            side: "long",
            type: "market",
            entry: last.close,
            sl: 98,
            tp: 104,
            leverage: 10,
            risk: 1,
          });
          for (const candle of future.slice(0, 50))
            game = advance(game, candle);
          const completed = finishTurn(game);
          assert.equal(completed.status, "turn-ended");
          assert.equal(completed.position, null);
          assert.ok(Number.isFinite(completed.balance));
          assert.equal(completed.trades.length, 1);
          assert.ok(
            Math.abs(completed.balance - 10000 - completed.trades[0].net) <
              1e-6,
          );
          const lastMonth = session.months!.at(-1)!;
          // Full last month at this interval, then replay must return no future candles.
          const { parseArchive, aggregate } = await import("../lib/market");
          const final = aggregate(
            parseArchive(
              new Uint8Array(
                await readFile(
                  path.join(
                    root,
                    `${session.symbol ?? "BTCUSDT"}-5m-${lastMonth}.zip`,
                  ),
                ),
              ),
            ),
            interval,
          ).at(-1)!;
          assert.deepEqual(await futureCandles(session, final.time), []);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      Math.random = originalRandom;
    }
  },
);
