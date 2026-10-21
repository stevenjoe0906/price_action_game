import { test } from "node:test";
import assert from "node:assert/strict";
import type { IChartApi } from "lightweight-charts";
import { createChartNavigation } from "../lib/chart-navigation";

test("manual price panning starts immediately and independent gesture locks cannot unlock each other", () => {
  const options: { handleScroll: boolean; handleScale: boolean }[] = [];
  let manual = 0;
  const chart = {
    applyOptions: (value: (typeof options)[number]) => options.push(value),
    priceScale: (id: string) => {
      assert.equal(id, "right");
      return {
        applyOptions: (value: { autoScale: boolean }) => {
          assert.equal(value.autoScale, false);
          manual++;
        },
      };
    },
  } as unknown as IChartApi;
  const navigation = createChartNavigation(() => chart);
  navigation.beginPan();
  assert.equal(
    manual,
    1,
    "First chart press permits vertical panning without dragging the axis",
  );
  navigation.lock("inspection", true);
  navigation.lock("drawing", true);
  navigation.lock("inspection", false);
  assert.equal(options.at(-1)?.handleScroll, false);
  navigation.beginPan();
  assert.equal(manual, 1, "Drawing gestures never change the price range");
  navigation.lock("order", true);
  navigation.lock("drawing", false);
  assert.equal(options.at(-1)?.handleScroll, false);
  navigation.lock("order", false);
  assert.deepEqual(options.at(-1), { handleScroll: true, handleScale: true });
  navigation.beginPan();
  assert.equal(manual, 2);
});
