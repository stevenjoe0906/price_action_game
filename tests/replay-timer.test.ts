import { test } from "node:test";
import assert from "node:assert/strict";
import { createReplayTimer } from "../lib/replay-timer";

test("autoplay and held stepping use the same selected rate at every supported speed", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  for (const speed of [1, 2, 5, 10, 20]) {
    let played = 0,
      held = 0;
    const play = createReplayTimer(() => played++, speed);
    const next = createReplayTimer(() => held++, speed);
    play.start();
    next.start(true);
    assert.equal(held, 1, "Next advances immediately on press");
    t.mock.timers.tick(1000);
    assert.equal(played, speed);
    assert.equal(held, speed + 1);
    play.stop();
    next.stop();
    t.mock.timers.tick(1000);
    assert.equal(played, speed);
    assert.equal(held, speed + 1);
  }
});
test("changing the selected speed updates a running hold without duplicate timers or extra immediate steps", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let steps = 0;
  const next = createReplayTimer(() => steps++, 1);
  next.start(true);
  next.start(true);
  assert.equal(steps, 1);
  t.mock.timers.tick(1000);
  assert.equal(steps, 2);
  next.setSpeed(10);
  t.mock.timers.tick(1000);
  assert.equal(steps, 12);
  next.setSpeed(2);
  t.mock.timers.tick(1000);
  assert.equal(steps, 14);
  next.stop();
  assert.equal(next.running, false);
  t.mock.timers.tick(1000);
  assert.equal(steps, 14);
});
