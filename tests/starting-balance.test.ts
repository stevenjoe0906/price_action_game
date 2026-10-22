import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  finishTurn,
  nextTurn,
  submitOrder,
  closePosition,
  INITIAL_BALANCE,
} from "../lib/engine";
import {
  defaults,
  loadSettings,
  saveSettings,
  summarize,
  type Summary,
} from "../lib/storage";
import { summaryMetrics, summaryCsv, summaryCardSvg } from "../lib/game-export";

test("starting balance accepts inclusive integer bounds and rejects invalid values", () => {
  for (const value of [10, 1000, 100000]) {
    const game = createGame(100, 1, value);
    assert.equal(game.balance, value);
    assert.equal(game.baseline, value);
    assert.equal(game.startingBalance, value);
    assert.equal(nextTurn(finishTurn(game), 100, 2).startingBalance, value);
  }
  for (const invalid of [9, 100001, 10.5, NaN, Infinity, -10, 0])
    assert.throws(() => createGame(100, 1, invalid), /whole number/);
  assert.equal(createGame(100, 1).startingBalance, INITIAL_BALANCE);
});

test("risk sizing and realized summary use each game's captured capital", () => {
  const input = {
    side: "long" as const,
    type: "market" as const,
    entry: 100,
    sl: 98,
    tp: 104,
    risk: 1,
    leverage: 10,
  };
  const small = submitOrder(createGame(100, 1, 1000), input);
  const large = submitOrder(createGame(100, 1, 10000), input);
  assert.ok(Math.abs(large.position!.qty / small.position!.qty - 10) < 1e-10);
  const closed = closePosition(small);
  const summary = summarize(closed);
  assert.equal(summary.startingBalance, 1000);
  assert.equal(summary.net, closed.balance - 1000);
  assert.ok(Math.abs(summary.net - closed.trades[0].net) < 1e-8);
});

test("settings migrate and validate capital independently from other preferences", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  let stored = JSON.stringify({
    risk: 2,
    interval: "15m",
    theme: "light",
    displaySize: "large",
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    },
  });
  try {
    assert.equal(loadSettings().startingBalance, 10000);
    for (const startingBalance of [10, 5000, 100000]) {
      saveSettings({ ...defaults, startingBalance });
      assert.equal(loadSettings().startingBalance, startingBalance);
    }
    for (const invalid of [0, 9, 100001, 10.5, NaN, Infinity, "5000", null]) {
      stored = JSON.stringify({
        risk: 2,
        interval: "15m",
        theme: "light",
        displaySize: "large",
        startingBalance: invalid,
      });
      assert.equal(loadSettings().startingBalance, 10000);
      assert.equal(loadSettings().risk, 2);
      assert.equal(loadSettings().theme, "light");
    }
    assert.throws(
      () => saveSettings({ ...defaults, startingBalance: 10.5 }),
      /whole number/,
    );
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("CSV, card, returns and drawdown use custom capital, while legacy summaries retain 10000", () => {
  const s: Summary = {
    ...summarize(createGame(100, 1, 5000)),
    balance: 4500,
    net: -500,
    turns: [
      { number: 1, net: -500, fees: 0, trades: 0, bars: 1, balance: 4500 },
    ],
  };
  assert.equal(summaryMetrics(s).returnPercent, -10);
  assert.equal(summaryMetrics(s).drawdown, 10);
  const rows = summaryCsv(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n")
    .map((row) => row.slice(1, -1).split('\",\"'));
  const record = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
  assert.equal(record.initial_balance_usdt, "5000");
  assert.equal(record.return_percent, "-10");
  assert.ok(summaryCardSvg(s).includes("START · $5,000.00"));
  const { startingBalance, ...legacy } = s;
  assert.equal(summaryMetrics(legacy).returnPercent, -5);
  assert.ok(summaryCardSvg(legacy).includes("START · $10,000.00"));
});
