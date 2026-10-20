import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  cancelOrder,
  closePosition,
  createGame,
  equity,
  FEE,
  finishTurn,
  liquidationPrice,
  modifyProtection,
  nextTurn,
  SLIPPAGE,
  submitOrder,
  type Candle,
  type Game,
  type OrderInput,
} from "../lib/engine";
const order: OrderInput = {
  side: "long",
  type: "market",
  entry: 100,
  sl: 99,
  tp: 102,
  leverage: 10,
  risk: 1,
};
const candle = (overrides: Partial<Candle> = {}): Candle => ({
  time: 2,
  open: 100,
  high: 101,
  low: 99.5,
  close: 100.5,
  ...overrides,
});
const approx = (a: number, b: number, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const open = (overrides: Partial<OrderInput> = {}) =>
  submitOrder(createGame(100, 1), { ...order, ...overrides });
test("market sizing uses actual slipped entry and deducts the entry fee", () => {
  const g = open();
  const p = g.position!;
  approx(p.entry, 100 * (1 + SLIPPAGE));
  approx((p.entry - p.sl) * p.qty, 100);
  approx(g.balance, 10000 - p.qty * p.entry * FEE);
  assert.equal(g.traded, true);
});
test("reject invalid SL, TP, risk, leverage and entry-side values without mutation", () => {
  const g = createGame(100, 1);
  for (const override of [
    { sl: 101 },
    { tp: 99 },
    { sl: 0 },
    { risk: 0 },
    { risk: 101 },
    { leverage: 4 },
    { type: "limit" as const, entry: 101 },
    { type: "stop" as const, entry: 99 },
  ])
    assert.throws(() => submitOrder(g, { ...order, ...override }));
  assert.equal(g.balance, 10000);
  assert.equal(g.position, null);
  assert.equal(g.traded, false);
});
test("insufficient margin rejects atomically", () => {
  assert.throws(() => open({ sl: 99.99, leverage: 2 }), /margin/);
});
test("stop loss takes precedence over take profit within the same candle", () => {
  const g = advance(open(), candle({ high: 104, low: 98 }));
  assert.equal(g.position, null);
  assert.equal(g.trades[0].reason, "Stop loss");
  approx(g.trades[0].exit, 99 * (1 - SLIPPAGE));
});
test("stop loss gaps execute at the worse open plus adverse slippage", () => {
  const g = advance(open(), candle({ open: 97, low: 96, high: 99, close: 98 }));
  approx(g.trades[0].exit, 97 * (1 - SLIPPAGE));
});
test("take profit limit gets opening improvement without market slippage", () => {
  const g = advance(
    open(),
    candle({ open: 103, low: 102.5, high: 104, close: 103.5 }),
  );
  assert.equal(g.trades[0].reason, "Take profit");
  approx(g.trades[0].exit, 103);
});
test("pending limit order fills only on a subsequent candle and gets price improvement", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "limit",
    entry: 99,
    sl: 95,
    tp: null,
  });
  assert.equal(g.position, null);
  assert.equal(g.orders.length, 1);
  const next = advance(g, candle({ open: 98, low: 97, high: 100, close: 99 }));
  assert.equal(next.orders.length, 0);
  approx(next.position!.entry, 98);
});
test("stop market entry gaps fill at the worse open with slippage", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop",
    entry: 101,
    sl: 95,
    tp: null,
  });
  const next = advance(
    g,
    candle({ open: 103, high: 104, low: 102, close: 103 }),
  );
  approx(next.position!.entry, 103 * (1 + SLIPPAGE));
});
test("entry candle protection uses conservative stop-first ordering", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop",
    entry: 101,
    sl: 99,
    tp: 103,
  });
  const next = advance(
    g,
    candle({ open: 100, low: 98, high: 104, close: 102 }),
  );
  assert.equal(next.trades[0].reason, "Stop loss");
});
test("partial closes preserve trade identity and fully closed accounting reconciles", () => {
  const initial = open({ tp: null });
  const qty = initial.position!.qty;
  const partial = closePosition(initial, 0.25);
  approx(partial.position!.qty, qty * 0.75);
  assert.equal(partial.trades.length, 0);
  const closed = closePosition(partial);
  assert.equal(closed.position, null);
  assert.equal(closed.trades.length, 1);
  approx(closed.balance - 10000, closed.trades[0].net);
  approx(closed.fees, closed.trades[0].fees);
  assert.equal(initial.position!.qty, qty);
});
test("smaller opposite order reduces the existing position", () => {
  const g = open({ sl: 98, tp: null });
  const next = submitOrder(g, { ...order, side: "short", sl: 110, tp: null });
  assert.equal(next.position!.side, "long");
  assert.ok(next.position!.qty < g.position!.qty);
  assert.equal(next.trades.length, 0);
});
test("larger opposite order closes then reverses, charging fees once per executed unit", () => {
  const g = open({ sl: 95, tp: null });
  const next = submitOrder(g, { ...order, side: "short", sl: 101, tp: null });
  assert.equal(next.position!.side, "short");
  assert.equal(next.trades.length, 1);
  approx(next.balance - 10000, next.trades[0].net - next.position!.fees);
});
test("rejected oversized reversal leaves old position and accounting intact", () => {
  const g = open({ sl: 95, tp: null });
  const snapshot = structuredClone(g);
  assert.throws(
    () =>
      submitOrder(g, {
        ...order,
        side: "short",
        sl: 100.001,
        tp: null,
        leverage: 2,
      }),
    /margin/,
  );
  assert.deepEqual(g, snapshot);
});
test("same-direction additions use a weighted entry and newest protection", () => {
  const g = open({ sl: 95, tp: null });
  const next = submitOrder(g, { ...order, sl: 97, tp: 105, leverage: 5 });
  assert.ok(next.position!.qty > g.position!.qty);
  approx(next.position!.entry, g.position!.entry);
  assert.equal(next.position!.sl, 97);
  assert.equal(next.position!.leverage, 5);
});
test("moving SL farther away is permitted; removing it is rejected", () => {
  const g = modifyProtection(open(), 90, null);
  assert.equal(g.position!.sl, 90);
  assert.equal(g.position!.tp, null);
  assert.throws(() => modifyProtection(g, 0, null));
  assert.throws(() => modifyProtection(g, 101, null));
});
test("finish cancels all pending orders and closes at last displayed price without revealing bars", () => {
  let g = open({ sl: 95, tp: null });
  g = submitOrder(g, { ...order, type: "stop", entry: 110, sl: 100, tp: null });
  g = submitOrder(g, { ...order, type: "limit", entry: 90, sl: 80, tp: null });
  const done = finishTurn(g);
  assert.equal(done.orders.length, 0);
  assert.equal(done.position, null);
  assert.equal(done.time, 1);
  assert.equal(done.bars, 0);
  assert.equal(done.status, "turn-ended");
  approx(done.trades[0].exit, 100 * (1 - SLIPPAGE));
  assert.equal(done.turns.length, 1);
  assert.deepEqual(finishTurn(done), done);
});
test("all 20 turns complete a game, balance carries forward, new games reset", () => {
  let g: Game = createGame(100, 1);
  for (let i = 1; i <= 20; i++) {
    assert.equal(g.turn, i);
    g = finishTurn(g);
    if (i < 20) g = nextTurn(g, 100, 1);
  }
  assert.equal(g.status, "finished");
  assert.equal(g.turns.length, 20);
  assert.equal(g.balance, 10000);
  assert.throws(() => nextTurn(g, 100, 1));
  assert.equal(createGame(100, 1).balance, 10000);
});
test("liquidation ends the game early and cancels orders", () => {
  const g = open({ sl: 50, risk: 50, leverage: 10, tp: null });
  const moved = modifyProtection(g, 0.01, null);
  const liq = liquidationPrice(moved)!;
  assert.ok(liq > 0.01);
  const done = advance(
    moved,
    candle({ open: 100, low: Math.max(0, liq - 1), high: 101, close: 98 }),
  );
  assert.equal(done.liquidated, true);
  assert.equal(done.status, "finished");
  assert.equal(done.position, null);
  assert.equal(done.orders.length, 0);
  assert.equal(done.turns.length, 1);
  assert.ok(done.balance >= 0);
});
test("a stop loss before the liquidation threshold prevents liquidation", () => {
  const g = open({ sl: 95, risk: 10, tp: null });
  const liq = liquidationPrice(g)!;
  const next = advance(
    g,
    candle({ open: 100, low: liq - 1, high: 101, close: 96 }),
  );
  assert.equal(next.liquidated, false);
  assert.equal(next.trades[0].reason, "Stop loss");
});
test("short SL and TP priority is symmetric", () => {
  const g = advance(
    open({ side: "short", sl: 101, tp: 98 }),
    candle({ high: 102, low: 97 }),
  );
  assert.equal(g.trades[0].reason, "Stop loss");
  approx(g.trades[0].exit, 101 * (1 + SLIPPAGE));
});
test("pending orders reserve margin and canceled orders do not unlock repick", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "limit",
    entry: 99,
    sl: 98,
  });
  const next = cancelOrder(g, g.orders[0].id);
  assert.equal(next.orders.length, 0);
  assert.equal(next.traded, true);
});
test("chronological validation and finished-turn protection", () => {
  assert.throws(
    () => advance(createGame(100, 1), candle({ time: 1 })),
    /chronological/,
  );
  const ended = finishTurn(createGame(100, 1));
  assert.deepEqual(advance(ended, candle()), ended);
  assert.throws(() => submitOrder(ended, order));
});
test("equity reflects unrealized loss and fees", () => {
  const g = open();
  approx(equity(g, 99), g.balance + (99 - g.position!.entry) * g.position!.qty);
});
