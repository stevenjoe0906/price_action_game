import type { Candle } from "./engine";

export function nextEMA(previous: number, close: number, period = 20): number {
  if (!Number.isInteger(period) || period <= 0) throw new Error("EMA period must be a positive integer.");
  return previous + (close - previous) * (2 / (period + 1));
}

/** Seed from the first revealed close; no future candles or date metadata. */
export function calculateEMA(candles: readonly Pick<Candle, "time" | "close">[], period = 20) {
  if (!Number.isInteger(period) || period <= 0) throw new Error("EMA period must be a positive integer.");
  let value = candles[0]?.close ?? 0;
  return candles.map((candle, index) => {
    if (index) value = nextEMA(value, candle.close, period);
    return { time: candle.time, value };
  });
}
