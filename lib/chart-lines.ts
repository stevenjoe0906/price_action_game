import type { Game } from "./engine";
import { orderTypeLabel } from "./order-ticket";

export type ChartLine = {
  id: string;
  price: number;
  color: string;
  title: string;
  draggable?: boolean;
  cancelLabel?: string;
};

export function workingChartLines(
  game: Game | null,
  palette: { neutral: string; up: string; down: string; accent: string },
): ChartLine[] {
  if (!game) return [];
  const lines: ChartLine[] = [];
  const active = game.status === "active";
  const p = game.position;
  if (p) {
    const qty = p.qty.toFixed(3);
    lines.push({
      id: "position-entry",
      title: `AVG ${p.side.toUpperCase()} ${qty}`,
      price: p.entry,
      color: palette.neutral,
    });
    if (p.sl !== null)
      lines.push({
        id: "position-sl",
        title: `POSITION SL ${qty}`,
        price: p.sl,
        color: palette.down,
        draggable: active,
        cancelLabel: "Cancel position stop loss",
      });
    if (p.tp !== null)
      lines.push({
        id: "position-tp",
        title: `POSITION TP ${qty}`,
        price: p.tp,
        color: palette.up,
        draggable: active,
        cancelLabel: "Cancel position take profit",
      });
  }
  for (const order of game.orders) {
    const prefix = `#${order.id}`;
    const qty = order.qty.toFixed(3);
    lines.push({
      id: `order-${order.id}-entry`,
      title: `${prefix} ${order.side === "long" ? "BUY" : "SELL"} ${orderTypeLabel(order.type)} ${qty}${order.triggered ? " ACTIVE" : ""}`,
      price: order.entry,
      color: palette.accent,
      cancelLabel: `Cancel pending order #${order.id}`,
    });
    if (order.type === "stop-limit")
      lines.push({
        id: `order-${order.id}-limit`,
        title: `${prefix} LIMIT ${qty}`,
        price: order.limit!,
        color: palette.accent,
      });
    lines.push({
      id: `order-${order.id}-sl`,
      title: `${prefix} SL ${qty}`,
      price: order.sl,
      color: palette.down,
    });
    if (order.tp !== null)
      lines.push({
        id: `order-${order.id}-tp`,
        title: `${prefix} TP ${qty}`,
        price: order.tp,
        color: palette.up,
      });
  }
  return lines;
}
