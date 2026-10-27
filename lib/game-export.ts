import { averageRatio } from "./trade-ratio";
import { startingBalanceOf } from "./engine";
import type { Summary } from "./storage";

export function summaryMetrics(s: Summary) {
  const wins = s.trades.filter((t) => t.net > 0).length;
  const profits = s.trades.reduce((sum, t) => sum + Math.max(0, t.net), 0);
  const losses = s.trades.reduce((sum, t) => sum + Math.max(0, -t.net), 0);
  let peak = startingBalanceOf(s),
    drawdown = 0;
  for (const t of s.turns) {
    peak = Math.max(peak, t.balance);
    drawdown = Math.max(drawdown, ((peak - t.balance) / peak) * 100);
  }
  return {
    wins,
    losses: s.trades.filter((t) => t.net < 0).length,
    breakeven: s.trades.filter((t) => t.net === 0).length,
    winRate: s.trades.length ? (wins / s.trades.length) * 100 : null,
    profitFactor: losses ? profits / losses : profits ? Infinity : null,
    drawdown,
    returnPercent: (s.net / startingBalanceOf(s)) * 100,
  };
}

// BOM and CRLF support spreadsheet imports; quote and guard text formulas.
export function csv(rows: (string | number | null | undefined)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value == null ? "" : String(value);
            if (typeof value === "string" && /^\s*[=+\-@]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
export function summaryCsv(s: Summary) {
  const m = summaryMetrics(s);
  return csv([
    [
      "game_id",
      "exported_summary_date_utc",
      "status",
      "initial_balance_usdt",
      "balance_usdt",
      "net_pnl_usdt",
      "return_percent",
      "fees_usdt",
      "completed_turns",
      "closed_trades",
      "wins",
      "losses",
      "breakeven",
      "win_rate_percent",
      "profit_factor",
      "turn_end_drawdown_percent",
      "liquidated",
      "avg_planned_tp_sl_ratio",
    ],
    [
      s.id,
      s.date,
      s.id === "current"
        ? "in_progress"
        : s.restarted
          ? "restarted"
          : "completed",
      startingBalanceOf(s),
      s.balance,
      s.net,
      m.returnPercent,
      s.fees,
      s.turns.length,
      s.trades.length,
      m.wins,
      m.losses,
      m.breakeven,
      m.winRate,
      m.profitFactor === Infinity ? "Infinity" : m.profitFactor,
      m.drawdown,
      String(s.liquidated),
      averageRatio(s.trades),
    ],
  ]);
}
export function tradesCsv(s: Summary) {
  let offset = 0;
  const turns = s.turns.map((turn) => {
    const start = offset;
    offset += turn.trades;
    return { turn, start, end: offset };
  });
  return csv([
    [
      "game_id",
      "trade_id",
      "turn",
      "symbol",
      "interval",
      "side",
      "opened_utc",
      "closed_utc",
      "entry_normalized",
      "final_exit_normalized",
      "initial_quantity_normalized",
      "normalization_factor",
      "entry_usdt",
      "final_exit_usdt",
      "initial_quantity_btc",
      "gross_pnl_usdt",
      "fees_usdt",
      "net_pnl_usdt",
      "exit_reason",
      "planned_tp_sl_ratio",
      "initial_quantity_asset",
    ],
    ...s.trades.map((t, i) => {
      const turn = turns.find((v) => i >= v.start && i < v.end)?.turn;
      const f = turn?.factor;
      return [
        s.id,
        t.id,
        turn?.number ?? (s.id === "current" ? s.turns.length + 1 : null),
        turn ? (turn.symbol ?? "BTCUSDT") : null,
        turn?.interval,
        t.side,
        iso(t.opened),
        iso(t.closed),
        t.entry,
        t.exit,
        t.qty,
        f,
        f ? t.entry / f : null,
        f ? t.exit / f : null,
        f && (turn?.symbol ?? "BTCUSDT") === "BTCUSDT" ? t.qty * f : null,
        t.gross,
        t.fees,
        t.net,
        t.reason,
        t.plannedRatio,
        f ? t.qty * f : null,
      ];
    }),
  ]);
}
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const number = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function summaryCardSvg(s: Summary) {
  const m = summaryMetrics(s),
    color = s.net >= 0 ? "#72d7b0" : "#e98080";
  const values = [startingBalanceOf(s), ...s.turns.map((t) => t.balance)];
  const low = Math.min(...values),
    span = Math.max(...values) - low || 1;
  const points = values
    .map(
      (v, i) =>
        `${48 + (i / Math.max(1, values.length - 1)) * 984},${660 - ((v - low) / span) * 100}`,
    )
    .join(" ");
  const metrics = [
    ["NET P&L", `${s.net >= 0 ? "+" : "-"}$${number(Math.abs(s.net))}`],
    ["RETURN", `${m.returnPercent >= 0 ? "+" : ""}${number(m.returnPercent)}%`],
    ["WIN RATE", m.winRate === null ? "—" : `${m.winRate.toFixed(1)}%`],
    ["CLOSED TRADES", String(s.trades.length)],
    [
      "PROFIT FACTOR",
      m.profitFactor === null
        ? "—"
        : m.profitFactor === Infinity
          ? "∞"
          : m.profitFactor.toFixed(2),
    ],
    ["TOTAL FEES", `$${number(s.fees)}`],
    ["TURN-END DRAWDOWN", `${m.drawdown.toFixed(2)}%`],
    ["TURNS", `${s.turns.length} / 20`],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="780" viewBox="0 0 1080 780"><rect width="1080" height="780" rx="24" fill="#101619"/><g font-family="Arial, sans-serif" fill="#e5edef"><text x="48" y="62" font-size="22" letter-spacing="3" fill="#72d7b0">PRICE ACTION · PRACTICE JOURNAL</text><text x="48" y="106" font-size="18" fill="#97a5ab">${escape(s.date.slice(0, 10))} · ${s.id === "current" ? "Game in progress · realized results" : s.liquidated ? "Game completed · liquidated" : s.restarted ? "Game restarted · record saved" : "Game completed"}</text><text x="48" y="163" font-size="18" fill="#97a5ab">${s.id === "current" ? "CURRENT" : "FINAL"} BALANCE</text><text x="48" y="230" font-size="60" font-weight="700">$${number(s.balance)}</text>${metrics
    .map(([label, value], i) => {
      const x = 48 + (i % 4) * 252,
        y = 295 + Math.floor(i / 4) * 116;
      return `<text x="${x}" y="${y}" font-size="14" fill="#97a5ab">${escape(label)}</text><text x="${x}" y="${y + 42}" font-size="28" fill="${i < 2 ? color : "#e5edef"}">${escape(value)}</text>`;
    })
    .join(
      "",
    )}<text x="48" y="526" font-size="16" fill="#97a5ab">BALANCE BY COMPLETED TURN</text><path d="M48 560H1032M48 610H1032M48 660H1032" stroke="#283438" stroke-dasharray="4 6"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4"/><text x="48" y="704" font-size="16" fill="#97a5ab">START · $${number(startingBalanceOf(s))}</text><text x="1032" y="704" text-anchor="end" font-size="16" fill="#97a5ab">TURN ${s.turns.length} · $${number(values[values.length - 1])}</text><text x="48" y="750" font-size="15" fill="#97a5ab">Trading simulation · Net results include fees · For practice</text></g></svg>`;
}
