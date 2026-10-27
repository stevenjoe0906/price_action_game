import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  SeriesDefinition,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "./engine";
import { createMACD, createRSI, type MACDPoint } from "./indicators";
import { CHART_THEMES, type Theme } from "./theme";
import { chartPrice } from "./chart-display";

type Line = ISeriesApi<"Line">;
type Histogram = ISeriesApi<"Histogram">;
export type OscillatorOptions = { macd: boolean; rsi: boolean };

/** Owns only oscillator series. The price pane and shared time scale stay mounted. */
export function createOscillatorPanes(
  chart: IChartApi,
  definitions: {
    line: SeriesDefinition<"Line">;
    histogram: SeriesDefinition<"Histogram">;
  },
) {
  let macd: Line | null = null,
    signal: Line | null = null,
    histogram: Histogram | null = null,
    rsi: Line | null = null;
  let guides: IPriceLine[] = [];
  let options: OscillatorOptions = { macd: false, rsi: false };
  let candles: readonly Candle[] = [],
    count = 0,
    firstTime: number | undefined;
  let macdMath = createMACD(),
    rsiMath = createRSI();
  let theme: Theme = "dark",
    factor: number | null = null;
  const priceFormat = () => ({
    type: "custom" as const,
    minMove: factor ? 0.01 * factor : 0.0001,
    formatter: (value: number) => chartPrice(value, factor),
  });
  const bar = (point: MACDPoint) => ({
    time: point.time as UTCTimestamp,
    value: point.histogram,
    color:
      point.histogram >= 0 ? CHART_THEMES[theme].up : CHART_THEMES[theme].down,
  });
  const line = (title: string, pane: number, color: string) =>
    chart.addSeries(
      definitions.line,
      {
        title,
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: priceFormat(),
      },
      pane,
    );
  const clear = () => {
    for (const series of [macd, signal, histogram, rsi])
      if (series) chart.removeSeries(series);
    guides = [];
    macd = signal = rsi = null;
    histogram = null;
  };
  const rebuild = () => {
    macdMath = createMACD();
    rsiMath = createRSI();
    const macdValues = options.macd ? candles.map((c) => macdMath.next(c)) : [];
    const rsiValues = options.rsi
      ? candles.flatMap((c) => {
          const point = rsiMath.next(c);
          return point ? [{ ...point, time: point.time as UTCTimestamp }] : [];
        })
      : [];
    macd?.setData(
      macdValues.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    signal?.setData(
      macdValues.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.signal,
      })),
    );
    histogram?.setData(macdValues.map(bar));
    rsi?.setData(rsiValues);
    count = candles.length;
    firstTime = candles[0]?.time;
  };
  const appearance = () => {
    macd?.applyOptions({
      color: CHART_THEMES[theme].study,
      priceFormat: priceFormat(),
    });
    signal?.applyOptions({
      color: CHART_THEMES[theme].ema,
      priceFormat: priceFormat(),
    });
    histogram?.applyOptions({ priceFormat: priceFormat() });
    rsi?.applyOptions({ color: CHART_THEMES[theme].study });
    guides.forEach((guide) =>
      guide.applyOptions({ color: CHART_THEMES[theme].neutral }),
    );
  };
  return {
    setEnabled(next: OscillatorOptions) {
      if (next.macd === options.macd && next.rsi === options.rsi) return;
      clear();
      options = { ...next };
      let pane = 1;
      if (options.macd) {
        macd = line("MACD 12,26,9", pane, CHART_THEMES[theme].study);
        signal = line("Signal", pane, CHART_THEMES[theme].ema);
        histogram = chart.addSeries(
          definitions.histogram,
          {
            base: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: priceFormat(),
          },
          pane,
        );
        guides.push(
          macd.createPriceLine({
            price: 0,
            color: CHART_THEMES[theme].neutral,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: "",
          }),
        );
        pane++;
      }
      if (options.rsi) {
        rsi = line("RSI 14", pane, CHART_THEMES[theme].study);
        rsi.applyOptions({
          priceFormat: {
            type: "custom",
            minMove: 0.01,
            formatter: (value: number) => value.toFixed(2),
          },
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 },
          }),
        });
        for (const price of [30, 50, 70])
          guides.push(
            rsi.createPriceLine({
              price,
              color: CHART_THEMES[theme].neutral,
              lineWidth: 1,
              lineStyle: price === 50 ? 1 : 2,
              axisLabelVisible: false,
              title: "",
            }),
          );
      }
      chart
        .panes()
        .forEach((pane, index) => pane.setStretchFactor(index === 0 ? 4 : 1));
      rebuild();
    },
    setCandles(next: readonly Candle[]) {
      const old = candles;
      candles = next;
      if (
        !count ||
        firstTime !== next[0]?.time ||
        next.length !== count + 1 ||
        old.at(-1)?.close !== next[count - 1]?.close
      ) {
        if (next === old) return;
        rebuild();
        return;
      }
      const candle = next.at(-1)!;
      if (options.macd) {
        const p = macdMath.next(candle);
        macd?.update({ time: p.time as UTCTimestamp, value: p.macd });
        signal?.update({ time: p.time as UTCTimestamp, value: p.signal });
        histogram?.update(bar(p));
      }
      if (options.rsi) {
        const p = rsiMath.next(candle);
        if (p) rsi?.update({ ...p, time: p.time as UTCTimestamp });
      }
      count = next.length;
    },
    setAppearance(nextTheme: Theme, revealFactor: number | null) {
      const recolor = theme !== nextTheme;
      theme = nextTheme;
      factor = revealFactor;
      appearance();
      if (recolor && histogram) {
        const values = createMACD();
        histogram.setData(candles.map((c) => bar(values.next(c))));
      }
    },
    destroy: clear,
  };
}
