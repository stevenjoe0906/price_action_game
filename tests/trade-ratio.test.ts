import { test } from "node:test";
import assert from "node:assert/strict";
import { profitLossRatio, averageRatio, formatRatio } from "../lib/trade-ratio";
import {
  createGame,
  submitOrder,
  closePosition,
  modifyProtection,
  finishTurn,
  nextTurn,
  advance,
} from "../lib/engine";
import { summarize } from "../lib/storage";
import { summaryCsv, tradesCsv } from "../lib/game-export";

test("planned profit:loss uses directional prices and handles missing/invalid protection", () => {
  assert.equal(profitLossRatio("long", 100, 99, 105), 5);
  assert.equal(profitLossRatio("short", 100, 101, 95), 5);
  for (const [sl, tp] of [
    [100, 105],
    [101, 105],
    [99, 95],
    [99, null],
    [NaN, 105],
    [99, Infinity],
  ] as const)
    assert.equal(profitLossRatio("long", 100, sl, tp), null);
  assert.equal(formatRatio(5), "5:1");
  assert.equal(formatRatio(1.234), "1.23:1");
  assert.equal(formatRatio(null), "—");
  assert.equal(
    averageRatio([
      {},
      { plannedRatio: null },
      { plannedRatio: 2 },
      { plannedRatio: 4 },
    ]),
    3,
  );
  assert.equal(averageRatio([{}]), null);
});

for (const side of ["long", "short"] as const) {
  test(`${side} plans persist through additions, partial closes, exit edits, turn changes and exports`, () => {
    const sign = side === "long" ? 1 : -1;
    const input = {
      side,
      type: "market" as const,
      entry: 100,
      sl: 100 - sign,
      tp: 100 + sign * 5,
      leverage: 10,
      risk: 0.25,
    };
    let game = submitOrder(createGame(100, 1), input);
    const first = game.position!;
    const ratio = profitLossRatio(side, first.entry, input.sl, input.tp)!;
    assert.ok(Math.abs(first.plannedRatio! - ratio) < 1e-10);
    game = closePosition(game, 0.25);
    const next = submitOrder(game, { ...input, tp: 100 + sign * 3 });
    const addedQty = next.position!.initialQty - first.initialQty;
    const addedRatio = profitLossRatio(
      side,
      first.entry,
      input.sl,
      100 + sign * 3,
    )!;
    const expected =
      (first.initialQty * ratio + addedQty * addedRatio) /
      (first.initialQty + addedQty);
    assert.ok(Math.abs(next.position!.plannedRatio! - expected) < 1e-10);
    const recorded = next.position!.plannedRatio;
    game = modifyProtection(next, null, null);
    assert.equal(
      game.position!.plannedRatio,
      recorded,
      "Exit edits preserve the entry plan",
    );
    game = finishTurn(game);
    assert.equal(game.trades[0].plannedRatio, recorded);
    game = nextTurn(game, 100, 2);
    assert.equal(averageRatio(game.trades.slice(game.tradeBaseline)), null);
    assert.equal(averageRatio(game.trades), recorded);
    const summary = summarize(game);
    assert.ok(tradesCsv(summary).includes('"planned_tp_sl_ratio"'));
    assert.ok(tradesCsv(summary).includes(`"${recorded}"`));
    assert.ok(
      summaryCsv({ ...summary, restarted: true }).includes('"restarted"'),
    );
  });
}
test("pending stop-limit retains its limit-price plan and unprotected trades remain unknown", () => {
  let game = submitOrder(createGame(100, 1), {
    side: "long",
    type: "stop-limit",
    entry: 101,
    limit: 102,
    sl: 100,
    tp: 108,
    risk: 0.25,
    leverage: 10,
  });
  assert.equal(game.orders[0].plannedRatio, 3);
  game = advance(game, {
    time: 2,
    open: 101,
    high: 101.5,
    low: 101,
    close: 101.2,
  });
  assert.equal(game.position!.plannedRatio, 3);
  const trade = finishTurn(game).trades[0];
  assert.equal(trade.plannedRatio, 3);
  const withoutTP = submitOrder(createGame(100, 1), {
    side: "long",
    type: "market",
    entry: 100,
    sl: 99,
    tp: null,
    risk: 0.25,
    leverage: 10,
  });
  assert.equal(finishTurn(withoutTP).trades[0].plannedRatio, null);
});
