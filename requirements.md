# Price Action Training Game

This specification incorporates the decisions agreed on October 20, 2026. The implementation and README document execution details.

## Platform and data

- A browser-based website optimized for desktop, also usable on smaller screens. Use the full page width, a chart-first viewport-height layout, and a focused expand-chart mode.
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
- Normalize every OHLC value by one fixed multiplier so the last initial close is **100**. Use the same scale throughout that turn. Hide calendar dates to support blind practice. Hide the market symbol and asset icon before the game starts and during active turns; reveal them only when the turn ends. Remove the separate introductory slogan area.
- There is **no fixed future-candle limit**. Do not reveal future candles after a turn ends.
- **Finish Turn** cancels every pending order, including stop entries, and closes the position at the last displayed close, with applicable slippage and fees. No future candle is used.
- Reaching the latest closed API candle or the end of the installed historical pack automatically finishes the turn.
- **Repick** changes the start time without ending the turn. It locks after any successful order submission, regardless of later cancellation or fill status, until the next turn.
- Users can trade as many times as they wish during a turn. There is no performance-based automatic turn limit.

## Chart controls

- Play/pause, default one candle per second.
- Speeds: **1x, 2x, 5x, 10x, 20x**.
- Next reveals one candle immediately; holding Next or Right Arrow repeats at the selected replay speed, matching Play (1× = one candle per second). Releasing stops it.
- Space toggles playback; controls do not interfere with typing in inputs.
- Show draggable entry, SL, and optional TP lines after Start Trading. Support dragging anywhere along the line, with live line, price-axis label, and input updates. Pause replay while dragging, validate protection on release, and let Escape cancel.
- Permit zooming and panning. Future candles must not affect the visible chart or its price scale.

## Chart context menu

- Right-click during an active turn to prepare orders at the clicked chart-price level. Above market: sell limit, buy stop-market, buy stop-limit. Below market: buy limit, sell stop-market, sell stop-limit.
- Selecting an item opens the ticket and sets direction, order type, entry/trigger, SL, TP, and a stop-limit limit when applicable. Do not submit an order automatically. Use the same 0.5% SL / 1% TP default distances as Start Trading, with risk-based size.
- Stop-limit orders activate on trigger and then fill only at their limit or better. Gap triggers can remain unfilled. Size/reserve margin from the limit, expose the limit field, and show triggered status in pending orders.
- Hide the symbol in the menu, pause replay, dismiss with Escape/outside click, and keep the menu inside chart bounds.

## Drawing toolbar

- Provide a free custom toolbar on the chart: select, trendline, ray, horizontal/vertical lines, rectangle, and a percentage/price-change ruler.
- Support drag-to-draw or two-point placement, live previews, selecting/moving drawings, endpoint editing, and colors.
- Keep drawings anchored to chart coordinates through pan, zoom, resize, and candle replay. Drawings must not influence orders or expose future candles.
- Support hide/show, delete/clear, undo/redo, cancellation, reset view, and chart expansion. Drawings reset with a new chart/turn.
- This is a custom toolbar on Lightweight Charts; the proprietary TradingView Advanced Charts toolbar is not a dependency.

## Orders, risk, and position management

- Market, limit, stop-market, and stop-limit orders; long and short directions.
- **SL is required** for every entry to calculate risk-based size. Once filled, position SL and TP can each be canceled, re-added, or modified. TP is optional, and liquidation remains active without SL.
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
- Provide a persistent Light/Dark switch affecting the interface, native chart, and drawing colors.
- Provide readable default typography and a persistent Comfortable / Large / Extra large display-size preference, including chart labels.
- Save settings and at most **10 completed-game summaries** in local browser storage.
- **Do not save active games**. Refreshing/closing the page discards the active game.

## Layout and statistics

- Left column: chart above a scrollable orders/activity panel. Right column: order ticket, position management, and current-turn metrics. Both columns fill the remaining browser height; use natural header/statistics heights rather than fixed viewport offsets. Resize automatically, with independent scrolling for overflow and stacked columns on narrow screens.
- One statistics strip contains balance, game realized/unrealized PnL, turn count/progress, win rate, closed trade count, and fees. Do not show a separate turn-progress area.
- Settings and summary/history controls in the header. Remove the page footer; show simulated-execution/slippage/no-funding information read-only inside Settings. Preserve visible TradingView attribution in the chart status bar.
- Current-turn realized/unrealized PnL and fees.
- Summary: final balance, net return, win rate, fees, profit factor, per-turn balance plot and results, and closed-trade review.
- Fully closed position cycles count as trades; partial closes remain in the same trade. Win rate uses net results after fees. Label drawdown as measured at turn end.

- On desktop, both columns must fill the remaining viewport height before and during games. Initial activity height is 400px (reduced only when the viewport is too short); the chart takes the rest. Dragging changes the split without moving either column’s bottom. Contain empty/loading/chart overlays within their pane. A draggable horizontal divider between the chart and Orders & activity lets users adjust their heights, with minimum pane heights, keyboard adjustment, Escape cancellation, and double-click/Enter reset. Keep the split across turns in the current page session and adapt it to window resizing.

- Order ticket cancel: × on the draft entry/trigger line and ticket header hides all draft lines and resets the ticket, leaving submitted orders and positions intact. Successful submission also resets the ticket.
- Display every pending entry and attached SL/TP on the chart, with order ID, side, type, quantity, and any stop-limit limit price. An entry-line × cancels that pending order and removes its lines. Show one weighted average entry line for the net position.
- Position SL/TP each cover the full remaining position; newest same-direction fill replaces both. Allow independent cancellation from chart/sidebar, re-adding via price fields, and modification through fields or dragging. Required entry SL sizing does not prevent canceling the position SL after execution.

- Missing position exits expose Add SL/Add TP in the padded sidebar and SL/TP buttons beside the average-entry chart label. Restore valid defaults from the current market without submitting a new entry; allow custom prices with inline directional validation. Chart text and action buttons must occupy separate non-overlapping slots outside the price axis.

- Position SL/TP action labels must track live drag previews on every pointer move and restore on cancellation, matching the native line and price field. Use a faint neutral current-price guide, distinct from order/protection lines in both themes. Play and held Next/Right Arrow share the selected 1×–20× multiplier, including speed changes during a hold; Next still advances immediately on press.
