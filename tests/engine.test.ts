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
  assert.notEqual(p.sl, null);
  approx((p.entry - p.sl!) * p.qty, 100);
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
test("moving SL farther away is permitted; invalid numeric SL values are rejected", () => {
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

test("stop-limit stays dormant until the trigger and fills without market slippage", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop-limit",
    entry: 101,
    limit: 101.1,
    sl: 98,
    tp: null,
  });
  const waiting = advance(g, candle({ high: 100.9 }));
  assert.equal(waiting.position, null);
  assert.equal(waiting.orders[0].triggered, false);
  const filled = advance(
    waiting,
    candle({ time: 3, open: 100.5, high: 102, low: 100, close: 101.5 }),
  );
  approx(filled.position!.entry, 101);
  assert.equal(filled.orders.length, 0);
  approx(filled.fees, filled.position!.qty * 101 * FEE);
});
test("gapping beyond a stop-limit activates it without violating its limit price", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop-limit",
    entry: 101,
    limit: 101.1,
    sl: 98,
    tp: null,
  });
  const gap = advance(
    g,
    candle({ open: 103, high: 104, low: 102, close: 103 }),
  );
  assert.equal(gap.position, null);
  assert.equal(gap.orders[0].triggered, true);
  assert.equal(gap.fees, 0);
  const filled = advance(
    gap,
    candle({ time: 3, open: 102, high: 103, low: 101, close: 101.5 }),
  );
  approx(filled.position!.entry, 101.1);
});
test("triggered sell stop-limit survives a gap and fills only at its limit or better", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    side: "short",
    type: "stop-limit",
    entry: 99,
    limit: 98.9,
    sl: 102,
    tp: null,
  });
  const gap = advance(g, candle({ open: 97, high: 98, low: 96, close: 97 }));
  assert.equal(gap.position, null);
  assert.equal(gap.orders[0].triggered, true);
  const filled = advance(
    gap,
    candle({ time: 3, open: 98, high: 99, low: 97, close: 98.5 }),
  );
  approx(filled.position!.entry, 98.9);
});
test("stop-limit bracket still observes stop-loss-first on its fill candle", () => {
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop-limit",
    entry: 101,
    limit: 101.1,
    sl: 99,
    tp: 103,
  });
  const filled = advance(g, candle({ low: 98, high: 104, close: 102 }));
  assert.equal(filled.trades[0].reason, "Stop loss");
});
test("invalid stop-limit prices are rejected and pending triggered orders cancel at turn end", () => {
  for (const limit of [undefined, NaN, 0, 100])
    assert.throws(() =>
      submitOrder(createGame(100, 1), {
        ...order,
        type: "stop-limit",
        entry: 101,
        limit,
        sl: 98,
        tp: null,
      }),
    );
  const g = submitOrder(createGame(100, 1), {
    ...order,
    type: "stop-limit",
    entry: 101,
    limit: 101.1,
    sl: 98,
    tp: null,
  });
  const gap = advance(
    g,
    candle({ open: 103, low: 102, high: 104, close: 103 }),
  );
  const ended = finishTurn(gap);
  assert.equal(ended.orders.length, 0);
  assert.equal(ended.fees, 0);
  assert.equal(ended.balance, 10000);
});

test("position protection can be canceled independently, restored, and still applies SL first", () => {
  const original = open({ sl: 95, tp: 110 });
  const noSL = modifyProtection(original, null, 110);
  assert.equal(noSL.position!.sl, null);
  assert.equal(original.position!.sl, 95);
  const unprotected = modifyProtection(noSL, null, null);
  const moved = advance(
    unprotected,
    candle({ high: 111, low: 94, close: 100 }),
  );
  assert.ok(moved.position);
  assert.equal(moved.trades.length, 0);
  const restored = modifyProtection(moved, 94, 108);
  const done = advance(
    restored,
    candle({ time: 3, high: 109, low: 93, close: 100 }),
  );
  assert.equal(done.position, null);
  assert.equal(done.trades[0].reason, "Stop loss");
  approx(done.trades[0].qty, original.position!.qty);
});
test("canceling SL leaves TP active and canceling TP leaves SL active", () => {
  const g = open({ sl: 95, tp: 110 });
  const tp = advance(
    modifyProtection(g, null, 110),
    candle({ low: 94, high: 111 }),
  );
  assert.equal(tp.trades[0].reason, "Take profit");
  const sl = advance(
    modifyProtection(g, 95, null),
    candle({ low: 94, high: 111 }),
  );
  assert.equal(sl.trades[0].reason, "Stop loss");
});
test("canceling SL does not disable cross-margin liquidation or required entry sizing", () => {
  const g = modifyProtection(open({ sl: 50, risk: 50, tp: null }), null, null);
  const liq = liquidationPrice(g)!;
  const done = advance(
    g,
    candle({ low: Math.max(0, liq - 1), high: 101, close: 98 }),
  );
  assert.equal(done.liquidated, true);
  assert.equal(done.position, null);
  assert.throws(() =>
    submitOrder(createGame(100, 1), {
      ...order,
      sl: null as unknown as number,
    }),
  );
});
test("long and short additions replace protection for the full position at its weighted average entry", () => {
  for (const side of ["long", "short"] as const) {
    const long = side === "long";
    let g = open({ side, sl: long ? 95 : 105, tp: long ? 110 : 90 });
    g = advance(g, candle({ high: 103, low: 97, close: long ? 102 : 98 }));
    const first = g.position!;
    const added = submitOrder(g, {
      ...order,
      side,
      sl: long ? 96 : 104,
      tp: long ? 112 : 88,
    });
    const p = added.position!;
    const addedQty = p.qty - first.qty;
    approx(
      p.entry,
      (first.entry * first.qty + added.fills.at(-1)!.price * addedQty) / p.qty,
    );
    assert.equal(p.sl, long ? 96 : 104);
    assert.equal(p.tp, long ? 112 : 88);
    assert.ok(p.qty > first.qty);
    const reduced = closePosition(added, 0.25);
    const rest = reduced.position!.qty;
    const done = advance(
      reduced,
      candle({
        time: 3,
        open: long ? 102 : 98,
        high: long ? 113 : 99,
        low: long ? 101 : 87,
        close: long ? 112 : 88,
      }),
    );
    assert.equal(done.position, null);
    assert.equal(done.trades[0].reason, "Take profit");
    approx(done.fills.at(-1)!.qty, rest);
  }
});
