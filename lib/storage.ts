import { INTERVALS, type Interval } from "./market";
import type { Game, Trade, Turn } from "./engine";
export type Settings = { risk: number; interval: Interval };
export type Summary = {
  id: string;
  date: string;
  balance: number;
  net: number;
  fees: number;
  liquidated: boolean;
  turns: Turn[];
  trades: Trade[];
};
export const defaults: Settings = { risk: 1, interval: "5m" };
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("pa-settings") ?? "null");
    return s &&
      Number.isFinite(s.risk) &&
      s.risk > 0 &&
      s.risk <= 100 &&
      INTERVALS.includes(s.interval)
      ? s
      : defaults;
  } catch {
    return defaults;
  }
}
export function loadSummaries(): Summary[] {
  try {
    const s = JSON.parse(localStorage.getItem("pa-summaries") ?? "[]");
    return Array.isArray(s)
      ? s
          .filter(
            (x) =>
              x &&
              typeof x.id === "string" &&
              Array.isArray(x.trades) &&
              Array.isArray(x.turns) &&
              Number.isFinite(x.balance),
          )
          .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
export function saveSettings(s: Settings) {
  localStorage.setItem("pa-settings", JSON.stringify(s));
}
export function summarize(g: Game): Summary {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: new Date().toISOString(),
    balance: g.balance,
    net: g.balance - 10000,
    fees: g.fees,
    liquidated: g.liquidated,
    turns: g.turns,
    trades: g.trades,
  };
}
export function saveSummary(s: Summary) {
  const all = [s, ...loadSummaries()].slice(0, 10);
  localStorage.setItem("pa-summaries", JSON.stringify(all));
  return all;
}
