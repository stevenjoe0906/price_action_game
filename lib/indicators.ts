import type { Candle } from "./engine";

export function nextEMA(previous: number, close: number, period = 20): number {
  if (!Number.isInteger(period) || period <= 0)
    throw new Error("EMA period must be a positive integer.");
  return previous + (close - previous) * (2 / (period + 1));
}

/** Seed from the first revealed close; no future candles or date metadata. */
export function calculateEMA(
  candles: readonly Pick<Candle, "time" | "close">[],
  period = 20,
) {
  if (!Number.isInteger(period) || period <= 0)
    throw new Error("EMA period must be a positive integer.");
  let value = candles[0]?.close ?? 0;
  return candles.map((candle, index) => {
    if (index) value = nextEMA(value, candle.close, period);
    return { time: candle.time, value };
  });
}

export type IndicatorCandle = Pick<Candle, "time" | "close">;
export type MACDPoint = {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
};
export function createMACD(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  for (const period of [fastPeriod, slowPeriod, signalPeriod])
    if (!Number.isInteger(period) || period <= 0)
      throw new Error("MACD periods must be positive integers.");
  let fast: number | null = null,
    slow = 0,
    signal = 0;
  return {
    next(candle: IndicatorCandle): MACDPoint {
      const first = fast === null;
      fast = first ? candle.close : nextEMA(fast!, candle.close, fastPeriod);
      slow = first ? candle.close : nextEMA(slow, candle.close, slowPeriod);
      const macd = fast - slow;
      signal = first ? macd : nextEMA(signal, macd, signalPeriod);
      return { time: candle.time, macd, signal, histogram: macd - signal };
    },
  };
}
export function calculateMACD(
  candles: readonly IndicatorCandle[],
  fast = 12,
  slow = 26,
  signal = 9,
) {
  const calculator = createMACD(fast, slow, signal);
  return candles.map((candle) => calculator.next(candle));
}

/** Wilder RSI: seed with the first period of close changes, then smooth by 1/period. */
export function createRSI(period = 14) {
  if (!Number.isInteger(period) || period <= 0)
    throw new Error("RSI period must be a positive integer.");
  let previous: number | null = null,
    changes = 0,
    gain = 0,
    loss = 0;
  return {
    next(candle: IndicatorCandle): { time: number; value: number } | null {
      if (previous === null) {
        previous = candle.close;
        return null;
      }
      const change = candle.close - previous;
      previous = candle.close;
      changes++;
      if (changes <= period) {
        gain += Math.max(change, 0);
        loss += Math.max(-change, 0);
        if (changes < period) return null;
        gain /= period;
        loss /= period;
      } else {
        gain = (gain * (period - 1) + Math.max(change, 0)) / period;
        loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
      }
      const value =
        gain === 0 && loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss);
      return { time: candle.time, value };
    },
  };
}
export function calculateRSI(candles: readonly IndicatorCandle[], period = 14) {
  const calculator = createRSI(period);
  return candles.flatMap((candle) => {
    const point = calculator.next(candle);
    return point ? [point] : [];
  });
}
