import type { Candle } from "./engine";

// Formatting only: the simulation and drawing coordinates stay normalized.
export function chartPrice(value: number, factor: number | null = null) {
  return factor && factor > 0 ? (value / factor).toFixed(2) : value.toFixed(4);
}
export function chartTime(time: number) {
  return (
    new Date(time * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"
  );
}
export function chartBar(
  index: number,
  anchor: number,
  candles: Candle[],
  reveal = false,
) {
  if (!reveal) return `Bar ${index - anchor + 1}`;
  return candles[index] ? chartTime(candles[index].time) : "";
}
