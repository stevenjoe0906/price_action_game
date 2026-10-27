import { test } from "node:test";
import assert from "node:assert/strict";
import type { IChartApi, SeriesDefinition } from "lightweight-charts";
import { createOscillatorPanes } from "../lib/chart-oscillators";
import { calculateMACD, calculateRSI } from "../lib/indicators";
import { CHART_THEMES } from "../lib/theme";

test("indicator panes toggle independently, stream replay, reformat and clean up without replacing price series", () => {
  const active: MockSeries[] = [];
  const weights = new Map<number, number>();
  class MockSeries {
    data: { time: number; value: number; color?: string }[] = [];
    // Options are intentionally open to the chart library's varied series formats.
    options: Record<string, any>;
    guides: Record<string, any>[] = [];
    constructor(
      public kind: string,
      options: Record<string, any>,
      public pane: number,
    ) {
      this.options = { ...options };
    }
    setData(data: typeof this.data) {
      this.data = [...data];
    }
    update(p: (typeof this.data)[number]) {
      this.data.push(p);
    }
    applyOptions(options: Record<string, any>) {
      this.options = { ...this.options, ...options };
    }
    createPriceLine(options: Record<string, any>) {
      const guide = { ...options };
      this.guides.push(guide);
      return {
        applyOptions: (next: Record<string, any>) => Object.assign(guide, next),
      };
    }
  }
  const chart = {
    addSeries: (
      definition: { type: string },
      options: Record<string, any>,
      pane: number,
    ) => {
      assert.ok(pane > 0);
      const s = new MockSeries(definition.type, options, pane);
      active.push(s);
      return s;
    },
    removeSeries: (series: MockSeries) => {
      const index = active.indexOf(series);
      assert.ok(index >= 0);
      active.splice(index, 1);
    },
    panes: () =>
      Array.from(
        { length: Math.max(0, ...active.map((s) => s.pane)) + 1 },
        (_, index) => ({
          setStretchFactor: (value: number) => weights.set(index, value),
        }),
      ),
  } as unknown as IChartApi;
  const controller = createOscillatorPanes(chart, {
    line: { type: "Line" } as SeriesDefinition<"Line">,
    histogram: { type: "Histogram" } as SeriesDefinition<"Histogram">,
  });
  const candles = Array.from({ length: 50 }, (_, i) => ({
    time: 1700000000 + i * 300,
    open: 100,
    high: 105,
    low: 95,
    close: 100 + Math.sin(i / 4) * 5,
  }));
  controller.setCandles(candles.slice(0, 15));
  controller.setEnabled({ macd: true, rsi: true });
  assert.equal(active.length, 4);
  assert.deepEqual(
    active.map((s) => s.pane),
    [1, 1, 1, 2],
  );
  assert.deepEqual([...weights.values()], [4, 1, 1]);
  const macd = active[0],
    signal = active[1],
    hist = active[2],
    rsi = active[3];
  assert.deepEqual(
    rsi.guides.map((g) => g.price),
    [30, 50, 70],
  );
  assert.deepEqual(rsi.options.autoscaleInfoProvider(), {
    priceRange: { minValue: 0, maxValue: 100 },
  });
  for (let count = 16; count <= candles.length; count++)
    controller.setCandles(candles.slice(0, count));
  const expected = calculateMACD(candles);
  assert.deepEqual(
    macd.data,
    expected.map((p) => ({ time: p.time, value: p.macd })),
  );
  assert.deepEqual(
    signal.data,
    expected.map((p) => ({ time: p.time, value: p.signal })),
  );
  assert.deepEqual(
    hist.data.map((p) => p.value),
    expected.map((p) => p.histogram),
  );
  assert.deepEqual(rsi.data, calculateRSI(candles));
  controller.setAppearance("light", 0.01);
  assert.equal(macd.options.priceFormat.formatter(1), "100.00");
  assert.equal(rsi.options.priceFormat.formatter(50), "50.00");
  assert.equal(macd.options.color, CHART_THEMES.light.study);
  assert.ok(rsi.guides.every((g) => g.color === CHART_THEMES.light.neutral));
  assert.ok(
    hist.data.every(
      (p) =>
        p.color ===
        (p.value >= 0 ? CHART_THEMES.light.up : CHART_THEMES.light.down),
    ),
  );
  controller.setEnabled({ macd: false, rsi: true });
  assert.equal(active.length, 1);
  assert.equal(active[0].pane, 1);
  assert.equal(active[0].options.title, "RSI 14");
  assert.deepEqual(active[0].data, calculateRSI(candles));
  controller.setCandles(candles.slice(0, 10));
  assert.deepEqual(active[0].data, []);
  controller.setEnabled({ macd: true, rsi: false });
  assert.equal(active.length, 3);
  assert.equal(active[0].data.length, 10);
  controller.setCandles([]);
  assert.equal(active[0].data.length, 0);
  controller.setCandles(candles);
  assert.equal(active[0].data.length, 50);
  controller.setEnabled({ macd: false, rsi: false });
  assert.equal(active.length, 0);
  controller.setEnabled({ macd: true, rsi: true });
  controller.destroy();
  assert.equal(active.length, 0);
});
