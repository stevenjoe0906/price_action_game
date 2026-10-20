# Price Action — Trading Lab

A self-hosted BTCUSDT perpetual trading practice game. Built with Next.js, React, TypeScript, and TradingView Lightweight Charts. All trades are simulated in the browser. No accounts, API keys, database, or paid services.

## Run locally

Requires Node.js 24+ and pnpm 11.

```sh
git clone https://github.com/stevenjoe0906/price_action_game.git
cd price_action_game
pnpm install
pnpm data:download
pnpm dev
```

Open **http://localhost:3000**. Downloading history is a one-time setup; rerunning it reuses validated existing archives. By default, it downloads monthly BTCUSDT USD-M perpetual 5-minute archives from January 2022 through the previous month (roughly 20–25 MB as of October 2026). The browser derives the other timeframes from complete 5-minute groups.

A smaller/custom date range is supported:

```sh
pnpm data:download --from=2023-01 --to=2025-12
```

Use at least two years of contiguous history if you want daily candles with a minimum of 500 initial bars. Missing months are never silently skipped during replay. A short data pack can be used with shorter intervals.

### Why a data download?

The application prefers local archives when `public/data/index.json` exists. Without a data pack, it attempts Binance's free futures REST API directly from the browser. Binance availability and CORS depend on the visitor's location/network; HTTP 451 restrictions are common in some locations. The downloadable archives avoid that dependency and allow offline replay once the website is available locally. Archives are public data from `https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/5m/`.

The downloader is a setup utility, not a backend. It validates ZIP/CSV content, downloads four months concurrently, retries transient failures, skips unpublished months, and maintains a manifest. Generated archives and the manifest are intentionally excluded from Git. If downloads fail, rerun the same command. No third-party CORS proxy is used.

## Production / your own server

```sh
pnpm install --frozen-lockfile
pnpm data:download
pnpm build
pnpm start
```

`pnpm start` serves the static export at http://127.0.0.1:3000. Set `HOST=0.0.0.0 PORT=3000 pnpm start` to bind to all interfaces. Alternatively, serve the generated **out/** directory using Nginx, Caddy, or another static file server; Node.js is not needed at runtime.

Download or update the data **before** building: Next.js copies `public/data` into `out/data` during the build. Rebuild after adding new months. No environment variables or secrets are required.

An example Nginx configuration is in `deploy/nginx.conf`. Set its `root` to your deployed `out/` directory. Configure your domain/TLS separately for public hosting.

### Docker (optional)

```sh
docker build -t price-action-game .
docker run --rm -p 3000:80 price-action-game
```

The build downloads the public history and exports the site. The final container only runs Nginx. Local downloaded archives are excluded from the Docker context.

## Game rules

- A new game starts with **10,000 USDT**. Balance carries across **20 turns**. Liquidation ends the game immediately. There is no manual End Game button.
- Each turn randomly selects a historical start at or after January 1, 2022. It shows **500–1,500 initial candles**, repicking when history is insufficient. The initial final close is normalized to **100** using one fixed OHLC multiplier throughout the turn. Calendar dates are hidden. The market symbol and Bitcoin icon are hidden during active turns and revealed after the turn ends.
- Replay has **no fixed candle limit**. Play at 1×, 2×, 5×, 10×, or 20×; one candle per second at 1×. **Space** toggles playback; **Right Arrow** steps or advances at five candles per second while held. The Next button supports holding too. Playback pauses in a hidden tab.
- **Finish turn** cancels every pending order and closes the open position at the **last visible close**, with market slippage and fees. It reveals no further candles. Reaching the latest closed API candle or the end of the installed archive pack automatically finishes the turn. Data gaps and connection errors pause playback instead of fabricating prices.
- **Repick** changes the chart without consuming a turn, until an order is successfully submitted. Canceling that order does not unlock Repick.
- Market, limit, and stop-market entries support long and short directions; leverage is 2×, 3×, 5×, or 10×. **SL is required**, TP is optional. SL may later be moved farther away, increasing the original risk, but cannot be removed.
- Quantity is **balance × risk percentage ÷ entry-to-SL distance**. Market entries use the slipped entry; pending quantities are fixed at submission. Fees and slippage are additional to the risk budget. Insufficient-margin orders are rejected, including at fill time. Pending orders conservatively reserve margin.
- There is one net position. Opposite fills reduce it; excess quantity reverses it. Same-direction fills use a weighted average entry and apply the latest order's SL, TP, and leverage to the entire combined position. Position size is not manually editable.
- Close 25%, 50%, 75%, or 100% of the **remaining** position. Grab anywhere along an entry/SL/TP line to drag it. The line, axis price, and form field update live. Dragging pauses playback; position protection is validated and committed on release. Escape cancels a drag. Focus a line and use Up/Down (Shift for larger steps) for keyboard adjustments. Chart lines and price fields allow protection updates.
- Every executed fill pays **0.05%**. Market orders, stop entries, SL exits, and manual/turn-end closes have **0.01% adverse slippage**. Limit and TP fills do not have market slippage. Funding is omitted.

### Deliberate simulation simplifications

OHLC data cannot establish the intrabar price path. Protection on an existing position is evaluated first, followed by pending orders in submission order. **SL is evaluated before TP** when both are touched. Newly filled entries also check the full entry candle's range, conservatively applying SL first even when the true path is unknowable. Gapped stop fills use the worse open; limit fills can improve to the open.

Cross margin uses total account equity with a fixed **0.5% maintenance rate**, candle prices rather than mark prices, and no tiered margin schedules. If liquidation and SL are both reachable, the closer adverse threshold wins; opening gaps beyond liquidation liquidate immediately. Negative post-liquidation account balances are floored at zero. These rules model practice, not a specific exchange's liquidation system.

Prices and quantities are normalized: displayed **units are not literal BTC**. Scaling quantity inversely with normalized price preserves the simulated USDT P&L, percentage risk, fees, and margin relationships. New orders, liquidation calculations, and positions all use the same price scale.

Trade count and win rate use **fully closed position cycles**, net of entry/exit fees. Partial closes accumulate within that cycle. Reversing closes one cycle and starts another. Summary drawdown measures **turn-end balances**, not intrabar equity drawdown.

## Display and readability

The terminal uses the full browser width with no maximum page-width cap. Turn count and progress share the account statistics strip. The left column contains the chart and a bounded, scrollable orders/activity panel; the right column contains the order manager and fills the same remaining browser height. Header/statistics/error rows take their natural height, and the workspace flexes to the bottom without a hard-coded header offset. The activity list and trading sidebar scroll independently, so pending orders, fills, and position controls remain accessible after resizing or changing font size. Narrow windows stack the columns, and short windows can scroll the page to retain usable chart/control sizes. The Expand Chart toolbar button provides a focused chart view while keeping replay controls available. Smaller screens keep a stacked layout.

Use the header’s **Light / Dark** switch or **Settings → Appearance** to change the interface, chart background, grids, candles, price labels, and annotations. Your appearance preference is saved locally and changing it does not reset the game. The page footer is removed; the read-only simulated-execution/slippage/funding note is in Settings. TradingView attribution remains visible in the chart status bar.

The default UI uses larger text, wider trading panels, and 14-pixel chart labels. In **Settings → Display size**, choose Comfortable, Large (+15%), or Extra large (+30%). This scales UI typography, panel widths, and chart labels together without requiring browser zoom. Existing saved risk/interval settings are retained when upgrading.

## Chart drawing toolbar

The free chart includes a custom drawing toolbar built on Lightweight Charts. It is not the proprietary TradingView Advanced Charts toolbar and needs no external library license or API key.

- **Cursor/select**, **trendline**, **ray**, **horizontal line**, **vertical line**, **rectangle**, and **price-range ruler**.
- Drag to draw, or click the first point and then the endpoint. Horizontal/vertical lines need one click. The ruler displays signed price change, percentage change, and bar distance in real time.
- Select a drawing to drag it; drag its endpoint handles to resize. Annotations store logical chart positions and prices so they remain aligned during pan, zoom, resizing, and replay. Drawing interactions pause playback.
- Choose a drawing color, hide/show annotations, undo/redo, delete a selected annotation, or clear all drawings. Clearing can be undone. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes; Delete/Backspace removes the selected drawing. Escape cancels unfinished drawing/editing or clears selection.
- Reset View restores automatic price scaling and the latest 110 candles. Expand Chart toggles the focused chart view.

Annotations belong to the current chart and reset when you start a new turn or repick. They do not affect orders or fills and are not saved after refresh. Measurements use normalized prices; percentage changes are identical to those of the underlying prices. They cannot reveal future candles.

## Persistence

Settings (including display size and appearance) and the most recent **10 completed game summaries** are stored in browser localStorage. Summaries include per-turn results and closed trades. The active game is **not saved**: refreshing or closing the page discards it. A new game always starts at 10,000 USDT. Browser-storage failures are reported without blocking the game.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

Tests cover fills, fees, risk sizing, SL-first ambiguity, gaps, partial closes, reversal accounting, atomic rejection, margin, liquidation, game lifecycle, candle parsing/aggregation, drawing history, and settings migrations. DOM interaction tests exercise drawing creation, live previews, editing, measurements, hiding, cancellation, and undo/redo with a simulated chart-coordinate adapter. Layout/Settings regressions check the two-column DOM hierarchy, turn-progress placement, retained chart attribution, removed page footer, and read-only execution note. An integration test uses the downloaded real archives across all six intervals (skipped when no local data pack exists).

## Source layout

- `lib/engine.ts` — pure, immutable simulation transitions and accounting
- `lib/market.ts` — public REST / local archive loading, aggregation, normalization, replay
- `lib/storage.ts` — settings and bounded completed-game history
- `components/PriceChart.tsx` — themed chart, draggable order lines, fill markers
- `components/ChartDrawings.tsx` — drawing toolbar, annotations, measurements, and editing
- `lib/drawings.ts` — drawing history and coordinate/measurement helpers
- `lib/theme.ts` — native chart theme palettes
- `components/TradingGame.tsx` — game controls, trading UI, settings, summaries
- `scripts/download-data.mjs` — optional public historical archive setup

## Attribution

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) under Apache 2.0. The TradingView logo remains enabled, with an additional visible attribution link. Historical market data is provided by [Binance Public Data](https://github.com/binance/binance-public-data); dataset use is subject to the provider's terms. This project is not affiliated with Binance or TradingView.
