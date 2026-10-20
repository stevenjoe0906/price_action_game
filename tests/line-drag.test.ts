import { test } from "node:test";
import assert from "node:assert/strict";
import { createLineDrag, type LinePreview } from "../lib/line-drag";
function setup(toPrice: (y: number) => number | null = (y) => 200 - y) {
  const previews: LinePreview[] = [],
    commits: LinePreview[] = [],
    lifecycle: string[] = [];
  // These are the same two updates used by the chart: the native line/axis and the form.
  let nativePrice = 100,
    inputPrice = 100;
  const drag = createLineDrag({
    toPrice,
    preview: (line) => {
      nativePrice = line.price;
      inputPrice = line.price;
      previews.push(line);
    },
    commit: (line) => commits.push(line),
    start: () => lifecycle.push("pause"),
    finish: () => lifecycle.push("finish"),
  });
  return {
    drag,
    previews,
    commits,
    lifecycle,
    prices: () => ({ nativePrice, inputPrice }),
  };
}
test("line and input follow every pointer move before a single final commit", () => {
  const s = setup();
  s.drag.begin("sl", 100, 100, 100);
  s.drag.move(110);
  assert.deepEqual(s.prices(), { nativePrice: 90, inputPrice: 90 });
  assert.equal(s.commits.length, 0);
  s.drag.move(115);
  assert.deepEqual(s.prices(), { nativePrice: 85, inputPrice: 85 });
  s.drag.end();
  assert.deepEqual(s.commits, [{ id: "sl", price: 85 }]);
  s.drag.end();
  assert.equal(s.commits.length, 1);
  assert.deepEqual(s.lifecycle, ["pause", "finish"]);
});
test("grabbing near the line preserves the grab offset instead of jumping", () => {
  const s = setup();
  s.drag.begin("entry", 100, 106, 100);
  s.drag.move(106);
  assert.equal(s.prices().nativePrice, 100);
  s.drag.move(116);
  assert.equal(s.prices().nativePrice, 90);
});
test("cancel restores native line and form without submitting protection changes", () => {
  const s = setup();
  s.drag.begin("tp", 100, 100, 100);
  s.drag.move(80);
  assert.equal(s.prices().inputPrice, 120);
  s.drag.end(true);
  assert.deepEqual(s.prices(), { nativePrice: 100, inputPrice: 100 });
  assert.equal(s.commits.length, 0);
  assert.equal(s.drag.active, null);
});
test("invalid and off-chart coordinates never become an order price", () => {
  const s = setup((y) =>
    y === 1 ? null : y === 2 ? NaN : y === 3 ? Infinity : -1,
  );
  s.drag.begin("sl", 100, 0, 0);
  for (const y of [1, 2, 3, 4]) s.drag.move(y);
  assert.equal(s.prices().nativePrice, 100);
  s.drag.end();
  assert.deepEqual(s.commits, [{ id: "sl", price: 100 }]);
});
test("drag target stays stable when another line is encountered", () => {
  const s = setup();
  s.drag.begin("sl", 100, 100, 100);
  s.drag.begin("tp", 120, 80, 80);
  s.drag.move(110);
  s.drag.end();
  assert.deepEqual(s.commits, [{ id: "sl", price: 90 }]);
});
test("chart interactions are restored even if a commit fails validation", () => {
  let restored = false;
  const drag = createLineDrag({
    toPrice: (y) => y,
    preview: () => {},
    start: () => {},
    commit: () => {
      throw new Error("invalid SL");
    },
    finish: () => {
      restored = true;
    },
  });
  drag.begin("sl", 100, 100, 100);
  assert.throws(() => drag.end(), /invalid SL/);
  assert.equal(restored, true);
  assert.equal(drag.active, null);
});
