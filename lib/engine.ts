export const FEE = 0.0005;
export const SLIPPAGE = 0.0001;
export const MAINTENANCE = 0.005;
export const INITIAL_BALANCE = 10_000;
export type Side = "long" | "short";
export type OrderType = "market" | "limit" | "stop";
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type Order = {
  id: number;
  side: Side;
  type: OrderType;
  entry: number;
  sl: number;
  tp: number | null;
  qty: number;
  leverage: number;
};
export type Position = {
  side: Side;
  qty: number;
  entry: number;
  sl: number;
  tp: number | null;
  leverage: number;
  opened: number;
  gross: number;
  fees: number;
  initialQty: number;
};
export type Trade = {
  id: number;
  side: Side;
  entry: number;
  exit: number;
  qty: number;
  gross: number;
  fees: number;
  net: number;
  opened: number;
  closed: number;
  reason: string;
};
export type Fill = {
  time: number;
  price: number;
  side: Side;
  action: string;
  qty: number;
  fee: number;
};
export type Turn = {
  number: number;
  net: number;
  fees: number;
  trades: number;
  bars: number;
  balance: number;
};
export type Game = {
  balance: number;
  fees: number;
  position: Position | null;
  orders: Order[];
  trades: Trade[];
  fills: Fill[];
  turns: Turn[];
  turn: number;
  status: "active" | "turn-ended" | "finished";
  traded: boolean;
  last: number;
  time: number;
  bars: number;
  baseline: number;
  feeBaseline: number;
  tradeBaseline: number;
  nextId: number;
  notice: string;
  liquidated: boolean;
};
export type OrderInput = {
  side: Side;
  type: OrderType;
  entry: number;
  sl: number;
  tp: number | null;
  leverage: number;
  risk: number;
};
const direction = (s: Side) => (s === "long" ? 1 : -1);
const copy = (g: Game): Game => structuredClone(g);
export const unrealized = (g: Game, price = g.last) =>
  g.position
    ? (price - g.position.entry) * g.position.qty * direction(g.position.side)
    : 0;
export const equity = (g: Game, price = g.last) =>
  g.balance + unrealized(g, price);
export const margin = (g: Game) =>
  g.position ? (g.position.qty * g.position.entry) / g.position.leverage : 0;
export const slip = (price: number, side: Side) =>
  price * (1 + direction(side) * SLIPPAGE);
export function createGame(last: number, time: number): Game {
  return {
    balance: INITIAL_BALANCE,
    fees: 0,
    position: null,
    orders: [],
    trades: [],
    fills: [],
    turns: [],
    turn: 1,
    status: "active",
    traded: false,
    last,
    time,
    bars: 0,
    baseline: INITIAL_BALANCE,
    feeBaseline: 0,
    tradeBaseline: 0,
    nextId: 1,
    notice: "",
    liquidated: false,
  };
}
export function liquidationPrice(g: Game): number | null {
  const p = g.position;
  if (!p) return null;
  return Math.max(
    0,
    p.side === "long"
      ? (p.qty * p.entry - g.balance) / (p.qty * (1 - MAINTENANCE))
      : (g.balance + p.qty * p.entry) / (p.qty * (1 + MAINTENANCE)),
  );
}
function recordFill(
  g: Game,
  side: Side,
  qty: number,
  price: number,
  action: string,
) {
  const fee = qty * price * FEE;
  g.balance -= fee;
  g.fees += fee;
  g.fills.push({ time: g.time, side, qty, price, action, fee });
  return fee;
}
function close(g: Game, qty: number, price: number, reason: string) {
  const p = g.position!;
  qty = Math.min(qty, p.qty);
  const gross = (price - p.entry) * qty * direction(p.side);
  const fee = recordFill(
    g,
    p.side === "long" ? "short" : "long",
    qty,
    price,
    reason,
  );
  g.balance += gross;
  p.gross += gross;
  p.fees += fee;
  p.qty -= qty;
  if (p.qty < 1e-8) {
    g.trades.push({
      id: g.nextId++,
      side: p.side,
      entry: p.entry,
      exit: price,
      qty: p.initialQty,
      gross: p.gross,
      fees: p.fees,
      net: p.gross - p.fees,
      opened: p.opened,
      closed: g.time,
      reason,
    });
    g.position = null;
  }
}
function execute(g: Game, o: Order, price: number): boolean {
  // Apply fills to a candidate first: a rejected reversal must leave the old position untouched.
  const candidate = copy(g);
  let qty = o.qty;
  if (candidate.position && candidate.position.side !== o.side) {
    const reduction = Math.min(qty, candidate.position.qty);
    close(candidate, reduction, price, "Opposite order");
    qty -= reduction;
  }
  if (qty > 1e-8) {
    const p = candidate.position;
    const totalQty = qty + (p?.qty ?? 0);
    const entry = (qty * price + (p ? p.qty * p.entry : 0)) / totalQty;
    const fee = qty * price * FEE;
    const projectedEquity = equity(candidate, price) - fee;
    const reserved = candidate.orders
      .filter((order) => order.id !== o.id)
      .reduce(
        (sum, order) => sum + (order.qty * order.entry) / order.leverage,
        0,
      );
    if (
      (totalQty * entry) / o.leverage + reserved > projectedEquity ||
      projectedEquity <= 0
    ) {
      g.notice =
        "Order rejected: insufficient available margin. Reduce risk or increase leverage.";
      return false;
    }
    const paid = recordFill(candidate, o.side, qty, price, "Entry");
    candidate.position = {
      side: o.side,
      qty: totalQty,
      entry,
      sl: o.sl,
      tp: o.tp,
      leverage: o.leverage,
      opened: p?.opened ?? g.time,
      gross: p?.gross ?? 0,
      fees: (p?.fees ?? 0) + paid,
      initialQty: (p?.initialQty ?? 0) + qty,
    };
  }
  Object.assign(g, candidate);
  return true;
}
export function submitOrder(original: Game, input: OrderInput): Game {
  const g = copy(original);
  g.notice = "";
  if (g.status !== "active") throw new Error("Start an active turn first.");
  const entry =
    input.type === "market" ? slip(g.last, input.side) : input.entry;
  if (
    ![entry, input.sl, input.risk, input.leverage].every(Number.isFinite) ||
    entry <= 0 ||
    input.sl <= 0 ||
    input.risk <= 0 ||
    input.risk > 100 ||
    ![2, 3, 5, 10].includes(input.leverage)
  )
    throw new Error("Enter valid prices, leverage, and risk (0–100%).");
  if (input.side === "long" ? input.sl >= entry : input.sl <= entry)
    throw new Error(
      "Stop loss must be below a long entry or above a short entry.",
    );
  if (
    input.tp !== null &&
    (!Number.isFinite(input.tp) ||
      input.tp <= 0 ||
      (input.side === "long" ? input.tp <= entry : input.tp >= entry))
  )
    throw new Error(
      "Take profit must be above a long entry or below a short entry.",
    );
  if (input.type !== "market") {
    const correctSide =
      input.type === "limit"
        ? input.side === "long"
          ? entry < g.last
          : entry > g.last
        : input.side === "long"
          ? entry > g.last
          : entry < g.last;
    if (!correctSide)
      throw new Error(
        "Limit buys belong below price; limit sells above. Stop buys belong above price; stop sells below.",
      );
  }
  const qty = (g.balance * input.risk) / 100 / Math.abs(entry - input.sl);
  if (!Number.isFinite(qty) || qty <= 0)
    throw new Error("Insufficient balance or invalid stop distance.");
  const o: Order = { id: g.nextId++, ...input, entry, qty };
  if (input.type === "market") {
    if (!execute(g, o, entry)) throw new Error(g.notice);
  } else {
    // Reserve gross notional for pending orders; actual fills are checked again.
    const reserved = g.orders.reduce(
      (sum, order) => sum + (order.qty * order.entry) / order.leverage,
      0,
    );
    const reduction =
      g.position && g.position.side !== o.side
        ? Math.min(o.qty, g.position.qty)
        : 0;
    const released = g.position
      ? (reduction * g.position.entry) / g.position.leverage
      : 0;
    if (
      margin(g) -
        released +
        ((o.qty - reduction) * o.entry) / o.leverage +
        reserved +
        o.qty * o.entry * FEE >
      equity(g)
    )
      throw new Error(
        "Order rejected: insufficient available margin. Reduce risk or increase leverage.",
      );
    g.orders.push(o);
  }
  g.traded = true;
  return g;
}
export function closePosition(original: Game, fraction = 1): Game {
  const g = copy(original);
  if (g.status !== "active" || !g.position) return g;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1)
    throw new Error("Invalid close fraction.");
  close(
    g,
    g.position.qty * fraction,
    slip(g.last, g.position.side === "long" ? "short" : "long"),
    fraction === 1 ? "Manual close" : "Partial close",
  );
  return g;
}
function protection(g: Game, b: Candle) {
  const p = g.position;
  if (!p) return;
  const long = p.side === "long";
  const liq = liquidationPrice(g)!;
  const slHit = long ? b.low <= p.sl : b.high >= p.sl;
  const liqHit = long ? b.low <= liq : b.high >= liq;
  const liqBeforeSL = long ? liq >= p.sl : liq <= p.sl;
  const gapLiquidated = long ? b.open <= liq : b.open >= liq;
  if (liqHit && (gapLiquidated || !slHit || liqBeforeSL)) {
    const price = long ? Math.min(b.open, liq) : Math.max(b.open, liq);
    close(g, p.qty, slip(price, long ? "short" : "long"), "Liquidation");
    g.balance = Math.max(0, g.balance);
    g.orders = [];
    g.liquidated = true;
    finishMutable(g);
    g.status = "finished";
    g.notice = "Liquidated. Your game has ended.";
    return;
  }
  if (slHit) {
    const price = long ? Math.min(b.open, p.sl) : Math.max(b.open, p.sl);
    close(g, p.qty, slip(price, long ? "short" : "long"), "Stop loss");
    return;
  }
  if (p.tp !== null && (long ? b.high >= p.tp : b.low <= p.tp)) {
    close(
      g,
      p.qty,
      long ? Math.max(b.open, p.tp) : Math.min(b.open, p.tp),
      "Take profit",
    );
  }
}
export function advance(original: Game, b: Candle): Game {
  const g = copy(original);
  if (g.status !== "active") return g;
  if (b.time <= g.time)
    throw new Error("Candles must advance in chronological order.");
  g.last = b.close;
  g.time = b.time;
  g.bars++;
  g.notice = "";
  protection(g, b);
  if (g.status !== "active") return g;
  const pending = [...g.orders];
  for (const order of pending) {
    const long = order.side === "long";
    const hit =
      order.type === "limit"
        ? long
          ? b.low <= order.entry
          : b.high >= order.entry
        : long
          ? b.high >= order.entry
          : b.low <= order.entry;
    if (!hit) continue;
    g.orders = g.orders.filter((o) => o.id !== order.id);
    let price =
      order.type === "limit"
        ? long
          ? Math.min(b.open, order.entry)
          : Math.max(b.open, order.entry)
        : slip(
            long
              ? Math.max(b.open, order.entry)
              : Math.min(b.open, order.entry),
            order.side,
          );
    const filled = execute(g, order, price);
    // Conservative OHLC model: check protection on the entry candle too, with SL first.
    if (filled) protection(g, { ...b, open: price });
    if (g.status !== "active") break;
  }
  return g;
}
function finishMutable(g: Game) {
  g.orders = [];
  if (g.position)
    close(
      g,
      g.position.qty,
      slip(g.last, g.position.side === "long" ? "short" : "long"),
      "Turn finished",
    );
  g.turns.push({
    number: g.turn,
    net: g.balance - g.baseline,
    fees: g.fees - g.feeBaseline,
    trades: g.trades.length - g.tradeBaseline,
    bars: g.bars,
    balance: g.balance,
  });
  g.status = g.turn >= 20 || g.liquidated ? "finished" : "turn-ended";
}
export function finishTurn(original: Game): Game {
  const g = copy(original);
  if (g.status === "active") finishMutable(g);
  return g;
}
export function nextTurn(original: Game, last: number, time: number): Game {
  if (original.status !== "turn-ended")
    throw new Error("Finish the current turn first.");
  return {
    ...copy(original),
    turn: original.turn + 1,
    last,
    time,
    bars: 0,
    baseline: original.balance,
    feeBaseline: original.fees,
    tradeBaseline: original.trades.length,
    traded: false,
    status: "active",
    notice: "",
  };
}
export function modifyProtection(
  original: Game,
  sl: number,
  tp: number | null,
): Game {
  const g = copy(original);
  if (!g.position || g.status !== "active") return g;
  const long = g.position.side === "long";
  if (!Number.isFinite(sl) || sl <= 0 || (long ? sl >= g.last : sl <= g.last))
    throw new Error("Stop loss must be on the loss side of the current price.");
  if (
    tp !== null &&
    (!Number.isFinite(tp) || tp <= 0 || (long ? tp <= g.last : tp >= g.last))
  )
    throw new Error(
      "Take profit must be on the profit side of the current price.",
    );
  g.position.sl = sl;
  g.position.tp = tp;
  return g;
}
export function cancelOrder(original: Game, id: number): Game {
  return {
    ...copy(original),
    orders: original.orders.filter((o) => o.id !== id),
  };
}
