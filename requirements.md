# Price Action Training Game

This specification incorporates the decisions agreed on October 20, 2026. The implementation and README document execution details.

## Platform and data

- A browser-based website optimized for desktop, also usable on smaller screens.
- Next.js, TypeScript, React, pnpm; Docker is optional.
- All trading and accounting run locally in the browser. No application backend, authentication, or API keys.
- Free Binance BTCUSDT USD-M perpetual futures OHLC data. TradingView Lightweight Charts renders the chart; it does not supply the market data.
- Prefer an installed static historical-data pack, downloaded from Binance's public monthly archive. Support direct free Binance REST access when no pack exists. Network failures must be visible; never invent substitute candles.
- Historical pack setup is a download script, not a running backend. Serve the generated static website on localhost or the user's server.

## Game and turns

- A game starts with a fixed **10,000 USDT** balance, carrying across **20 turns**.
- The game ends after turn 20 or immediately on liquidation. No manual End Game action.
- Initially show no chart; provide Start New Game.
- Each turn chooses a random historical start at or after **2022-01-01 00:00 UTC**, before the latest available fully closed candle.
- Load up to **1,500 initial candles**. If fewer than **500** are available, repick.
- Normalize every OHLC value by one fixed multiplier so the last initial close is **100**. Use the same scale throughout that turn. Hide calendar dates to support blind practice. Hide the market symbol and asset icon during active turns; reveal them when the turn ends.
- There is **no fixed future-candle limit**. Do not reveal future candles after a turn ends.
- **Finish Turn** cancels every pending order, including stop entries, and closes the position at the last displayed close, with applicable slippage and fees. No future candle is used.
- Reaching the latest closed API candle or the end of the installed historical pack automatically finishes the turn.
- **Repick** changes the start time without ending the turn. It locks after any successful order submission, regardless of later cancellation or fill status, until the next turn.
- Users can trade as many times as they wish during a turn. There is no performance-based automatic turn limit.

## Chart controls

- Play/pause, default one candle per second.
- Speeds: **1x, 2x, 5x, 10x, 20x**.
- Next reveals one candle; holding Next or Right Arrow advances five candles per second. Releasing stops it.
- Space toggles playback; controls do not interfere with typing in inputs.
- Show draggable entry, SL, and optional TP lines after Start Trading. Support dragging anywhere along the line, with live line, price-axis label, and input updates. Pause replay while dragging, validate protection on release, and let Escape cancel.
- Permit zooming and panning. Future candles must not affect the visible chart or its price scale.

## Orders, risk, and position management

- Market, limit, and stop-market orders; long and short directions.
- **SL is required** for every entry and cannot be removed from an open position. TP is optional.
- Calculate quantity automatically: **account balance x risk percentage / absolute entry-to-SL distance**. Do not include fees or slippage in the risk budget; market sizing uses the executable slipped entry.
- Users cannot directly edit quantity. Default risk **1%**, adjustable in settings.
- Cross margin only; leverage choices **2x, 3x, 5x, 10x**.
- Reject and warn when an order exceeds available margin. Reserve margin conservatively for pending orders and recheck at execution.
- Hold only one net directional position. Opposite orders first reduce/close it, then open the excess in the opposite direction.
- Adding in the same direction uses weighted average entry and the latest order's SL, TP, and leverage for the combined position.
- Manual closes: **25%, 50%, 75%, 100%** of the remaining position.
- Modify SL and TP by dragging chart lines or entering prices. Moving SL farther away is permitted.
- Show side, leverage, quantity, unrealized PnL, entry, last, liquidation, SL, and TP.
- Show pending orders with cancellation controls, and executed-fill history.

## Simplified execution

- Fee: **0.05%** per executed fill, maker and taker, deducted from balance immediately.
- Adverse slippage: **0.01%** for market and stop-market execution, including SL and forced/manual exits. No market slippage on limit/TP fills.
- Omit funding payments.
- **SL first** when a candle touches both SL and TP. Newly filled entries use the entire candle range conservatively because the true intrabar path is unknown.
- Opening gaps fill stops at the worse opening price; limits may receive opening-price improvement.
- A documented simplified cross-margin liquidation model is acceptable: fixed **0.5% maintenance margin**, candle price instead of mark price, no exchange margin tiers. Liquidation ends the game.

## Settings and persistence

- Fixed starting balance: 10,000 USDT, reset on every new game.
- Risk default 1%; intervals: **5m, 15m, 30m, 1h, 4h, 1d**, default 5m.
- New interval selection applies to the next chart, without replacing an active chart mid-position.
- Provide readable default typography and a persistent Comfortable / Large / Extra large display-size preference, including chart labels.
- Save settings and at most **10 completed-game summaries** in local browser storage.
- **Do not save active games**. Refreshing/closing the page discards the active game.

## Layout and statistics

- Large price chart on the left; order ticket, position management, and current-turn metrics on the right.
- Top: balance, game realized/unrealized PnL, turn progress, win rate, closed trade count, and fees.
- Settings and summary/history controls in the header.
- Current-turn realized/unrealized PnL and fees.
- Summary: final balance, net return, win rate, fees, profit factor, per-turn balance plot and results, and closed-trade review.
- Fully closed position cycles count as trades; partial closes remain in the same trade. Win rate uses net results after fees. Label drawdown as measured at turn end.
