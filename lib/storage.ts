import { INTERVALS, type Interval } from "./market";
import type { Theme } from "./theme";
import type { Game, Trade, Turn } from "./engine";
export const DISPLAY_SIZES = {
  half: 0.5,
  small: 0.7,
  compact: 0.85,
  comfortable: 1,
  large: 1.15,
  "extra-large": 1.3,
  huge: 1.5,
} as const;
export type DisplaySize = keyof typeof DISPLAY_SIZES;
export type Settings = {
  risk: number;
  interval: Interval;
  displaySize: DisplaySize;
  theme: Theme;
};
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
export const defaults: Settings = {
  risk: 1,
  interval: "5m",
  displaySize: "comfortable",
  theme: "dark",
};
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("pa-settings") ?? "null");
    if (
      !s ||
      !Number.isFinite(s.risk) ||
      s.risk <= 0 ||
      s.risk > 100 ||
      !INTERVALS.includes(s.interval)
    )
      return defaults;
    return {
      risk: s.risk,
      interval: s.interval,
      theme:
        s.theme === "light" || s.theme === "dark" ? s.theme : defaults.theme,
      displaySize: Object.hasOwn(DISPLAY_SIZES, s.displaySize)
        ? s.displaySize
        : defaults.displaySize,
    };
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
