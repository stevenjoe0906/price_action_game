import type { OrderType, Side } from "./engine";
export type ChartOrderType = Exclude<OrderType, "market">;
export type ChartOrderChoice = {
  side: Side;
  type: ChartOrderType;
  disabled?: boolean;
};
export function chartOrderChoices(
  price: number,
  last: number,
): ChartOrderChoice[] {
  const above = price >= last;
  return [
    { side: above ? "short" : "long", type: "limit" },
    { side: above ? "long" : "short", type: "stop", disabled: price === last },
    {
      side: above ? "long" : "short",
      type: "stop-limit",
      disabled: price === last,
    },
  ];
}
export function orderDraft(side: Side, type: ChartOrderType, price: number) {
  const limit = +(price + (side === "long" ? 0.0001 : -0.0001)).toFixed(6);
  return {
    side,
    type,
    entry: price,
    limit: type === "stop-limit" ? limit : undefined,
    sl: +(price * (side === "long" ? 0.995 : 1.005)).toFixed(6),
    tp: +(price * (side === "long" ? 1.01 : 0.99)).toFixed(6),
  };
}
export const orderTypeLabel = (type: OrderType) =>
  ({
    market: "Market",
    limit: "Limit",
    stop: "Stop market",
    "stop-limit": "Stop limit",
  })[type];
