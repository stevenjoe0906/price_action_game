import { test } from "node:test";
import assert from "node:assert/strict";
import { chartOrderChoices, orderDraft } from "../lib/order-ticket";
import { createGame, submitOrder } from "../lib/engine";
test("above-market context actions match sell limit, buy stop, and buy stop-limit", () => {
  assert.deepEqual(
    chartOrderChoices(101, 100).map(({ side, type }) => ({ side, type })),
    [
      { side: "short", type: "limit" },
      { side: "long", type: "stop" },
      { side: "long", type: "stop-limit" },
    ],
  );
});
test("below-market context actions invert direction and prepare valid tickets without submitting", () => {
  const game = createGame(100, 1);
  const choices = chartOrderChoices(99, 100);
  assert.deepEqual(
    choices.map(({ side, type }) => ({ side, type })),
    [
      { side: "long", type: "limit" },
      { side: "short", type: "stop" },
      { side: "short", type: "stop-limit" },
    ],
  );
  for (const choice of choices) {
    const draft = orderDraft(choice.side, choice.type, 99);
    assert.equal(draft.entry, 99);
    assert.equal(draft.sl, choice.side === "long" ? 98.505 : 99.495);
    assert.equal(draft.tp, choice.side === "long" ? 99.99 : 98.01);
    assert.doesNotThrow(() =>
      submitOrder(game, { ...draft, risk: 1, leverage: 10 }),
    );
  }
  assert.equal(game.orders.length, 0);
  assert.equal(game.traded, false);
  assert.equal(game.position, null);
});
test("context drafts retain the precise clicked level and risk sizing uses their executable limit", () => {
  const draft = orderDraft("long", "stop-limit", 101.123456);
  assert.equal(draft.entry, 101.123456);
  assert.equal(draft.limit, 101.123556);
  const placed = submitOrder(createGame(100, 1), {
    ...draft,
    risk: 1,
    leverage: 10,
  });
  assert.ok(
    Math.abs(placed.orders[0].qty * (draft.limit! - draft.sl) - 100) < 1e-7,
  );
});
test("stops are disabled at the current price while the limit ticket remains valid", () => {
  const choices = chartOrderChoices(100, 100);
  assert.equal(choices[1].disabled, true);
  assert.equal(choices[2].disabled, true);
  assert.doesNotThrow(() =>
    submitOrder(createGame(100, 1), {
      ...orderDraft(choices[0].side, "limit", 100),
      risk: 1,
      leverage: 10,
    }),
  );
});
