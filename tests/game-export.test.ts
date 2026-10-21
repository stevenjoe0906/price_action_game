import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  csv,
  summaryCardSvg,
  summaryCsv,
  tradesCsv,
  summaryMetrics,
} from "../lib/game-export";
import { chartPrice, chartBar } from "../lib/chart-display";
import type { Summary } from "../lib/storage";
const trade = {
  id: 1,
  side: "long" as const,
  entry: 100,
  exit: 102,
  qty: 50,
  gross: 100,
  fees: 5,
  net: 95,
  opened: 1700000000,
  closed: 1700000300,
  reason: "Turn finished",
};
const summary: Summary = {
  id: "test-game",
  date: "2026-10-21T12:00:00Z",
  balance: 10095,
  net: 95,
  fees: 5,
  liquidated: false,
  turns: [
    {
      number: 1,
      trades: 1,
      bars: 1,
      net: 95,
      fees: 5,
      balance: 10095,
      factor: 0.002,
      interval: "5m",
    },
  ],
  trades: [trade],
};
function rows(source: string) {
  return source
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n")
    .map((row) =>
      row
        .slice(1, -1)
        .split('","')
        .map((cell) => cell.replaceAll('""', '"')),
    );
}
test("summary CSV preserves numeric precision and includes every brief metric", () => {
  const [headers, values] = rows(summaryCsv(summary));
  const record = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  assert.equal(record.net_pnl_usdt, "95");
  assert.equal(record.return_percent, "0.95");
  assert.equal(record.profit_factor, "Infinity");
  assert.equal(record.win_rate_percent, "100");
  assert.equal(record.closed_trades, "1");
  assert.equal(record.turn_end_drawdown_percent, "0");
  assert.equal(record.status, "completed");
  assert.ok(summaryCsv(summary).startsWith("\uFEFF"));
});
test("trade CSV assigns turns and converts source prices/quantities without changing P&L", () => {
  const second = {
    ...trade,
    id: 2,
    side: "short" as const,
    net: -10,
    reason: 'SL, "exit"',
  };
  const s = {
    ...summary,
    trades: [trade, second],
    turns: [
      ...summary.turns,
      {
        number: 2,
        trades: 1,
        bars: 3,
        net: -10,
        fees: 5,
        balance: 10085,
        factor: 0.004,
        interval: "1h",
      },
    ],
  };
  const [headers, a, b] = rows(tradesCsv(s));
  const record = (row: string[]) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  assert.equal(record(a).entry_usdt, "50000");
  assert.equal(record(a).initial_quantity_btc, "0.1");
  assert.equal(record(a).opened_utc, "2023-11-14T22:13:20.000Z");
  assert.equal(record(b).turn, "2");
  assert.equal(record(b).entry_usdt, "25000");
  assert.equal(record(b).interval, "1h");
  assert.equal(record(b).net_pnl_usdt, "-10");
  assert.equal(record(b).exit_reason, second.reason);
  const old = {
    ...summary,
    turns: summary.turns.map(({ factor, interval, ...t }) => t),
  };
  const legacy = rows(tradesCsv(old));
  assert.equal(
    record(legacy[1]).entry_usdt,
    "",
    "Do not invent source prices for older summaries",
  );
  assert.equal(record(legacy[1]).entry_normalized, "100");
});
test("CSV handles quotes, commas, multiline strings and formula injection while preserving negative numbers", () => {
  assert.equal(
    csv([["a,b", "line\nbreak", 'a"b', "=1+1", -12.34]]),
    '\uFEFF"a,b","line\nbreak","a""b","\'=1+1","-12.34"\r\n',
  );
});
test("share card has the summary metrics and equity curve, excludes the trade list, handles empty games", () => {
  for (const s of [
    summary,
    { ...summary, trades: [], turns: [], balance: 10000, net: 0, fees: 0 },
  ]) {
    const svg = summaryCardSvg(s);
    const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
    assert.equal(
      dom.window.document.documentElement.getAttribute("width"),
      "1080",
    );
    assert.ok(dom.window.document.querySelector("polyline"));
    for (const label of [
      "NET P&L",
      "WIN RATE",
      "PROFIT FACTOR",
      "TOTAL FEES",
      "TURN-END DRAWDOWN",
    ])
      assert.ok(
        dom.window.document.documentElement.textContent!.includes(label),
      );
    assert.ok(!svg.includes(trade.reason));
    assert.ok(!svg.includes("NaN"));
    assert.ok(!svg.includes("Infinity"));
    dom.window.close();
  }
  assert.equal(
    summaryMetrics({
      ...summary,
      turns: [{ ...summary.turns[0], balance: 9000 }],
    }).drawdown,
    10,
  );
});
test("chart reveal formats actual prices and UTC only after the turn without adding candles", () => {
  const candles = [
    { time: 1700000000, open: 100, high: 102, low: 99, close: 101 },
  ];
  assert.equal(chartPrice(100), "100.0000");
  assert.equal(chartPrice(100, 0.002), "50000.00");
  assert.equal(chartBar(0, 1, candles), "Bar 0");
  assert.equal(chartBar(0, 1, candles, true), "2023-11-14 22:13 UTC");
  assert.equal(
    chartBar(1, 1, candles, true),
    "",
    "No extrapolated future dates",
  );
  assert.equal(candles.length, 1);
  assert.equal(
    candles[0].close,
    101,
    "Formatting must not change the simulation",
  );
});
