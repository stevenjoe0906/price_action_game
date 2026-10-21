import type { Side } from "./engine";

/** Planned gross reward/risk; absent TP or invalid directional levels have no ratio. */
export function profitLossRatio(
  side: Side,
  entry: number,
  sl: number | null,
  tp: number | null,
): number | null {
  if (
    sl == null ||
    tp == null ||
    ![entry, sl, tp].every(Number.isFinite) ||
    Math.min(entry, sl, tp) <= 0
  )
    return null;
  const direction = side === "long" ? 1 : -1;
  const risk = (entry - sl) * direction;
  const reward = (tp - entry) * direction;
  const ratio = reward / risk;
  return risk > 0 && reward > 0 && Number.isFinite(ratio) ? ratio : null;
}
export function averageRatio(
  items: { plannedRatio?: number | null }[],
): number | null {
  const values = items
    .map((item) => item.plannedRatio)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
  return values.length
    ? values.reduce((sum, n) => sum + n, 0) / values.length
    : null;
}
export const formatRatio = (ratio: number | null | undefined) =>
  ratio != null && Number.isFinite(ratio) ? `${+ratio.toFixed(2)}:1` : "—";
