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

### Docker Compose (recommended for your server)

Requires Docker Engine and the Docker Compose plugin. Node.js and pnpm are installed inside the build image; neither is required on the host.

Until PR #1 is merged, clone the implementation branch:

```sh
git clone --branch feat/trading-training-game https://github.com/stevenjoe0906/price_action_game.git
cd price_action_game
cp .env.example .env
docker compose up -d --build
```

The container is published at **http://127.0.0.1:3002** on the server for a host Nginx reverse proxy. The first build installs dependencies, downloads free BTCUSDT history, and exports the website. The running container serves only static files with Nginx, includes an HTTP health check, and uses `restart: unless-stopped`. No database, API key, application backend, or data volume is needed. Settings and completed-game history remain in each browser.

The defaults in `compose.yaml` and `.env.example` are `BIND_ADDRESS=127.0.0.1` and `PORT=3002`, mapping host port 3002 to container port 80. If you already have a `.env` file, update these two values explicitly: pulling repository changes does not overwrite your existing configuration. Run `docker compose up -d --build` after changes. To publish directly without a host proxy, change `BIND_ADDRESS` to `0.0.0.0` and permit the selected port in your firewall.

#### Host Nginx and Cloudflare

`deploy/host-nginx.conf` is the host reverse-proxy configuration. It listens on port 80 over both IPv4 and IPv6 and forwards requests to `127.0.0.1:3002`. Docker only needs the IPv4 loopback binding; host Nginx handles both public address families. `deploy/nginx.conf` is the separate static-file configuration already baked into the container.

1. Set `BIND_ADDRESS=127.0.0.1` and `PORT=3002` in `.env`, then start the container as above.
2. Copy the host configuration and replace `trading.example.com` with your domain:

   ```sh
   sudo cp deploy/host-nginx.conf /etc/nginx/conf.d/price-action.conf
   sudo nano /etc/nginx/conf.d/price-action.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

   The host Nginx installation must include `/etc/nginx/conf.d/*.conf` inside its `http {}` context. Permit inbound TCP port 80 over IPv4 and IPv6. The server needs working IPv6 networking for direct IPv6 origin connections.
3. In Cloudflare DNS, create a proxied (orange cloud) **A** record for your server's public IPv4 address. Add a proxied **AAAA** record if the server also has a working public IPv6 address.
4. Set **SSL/TLS → Overview → Flexible** for this certificate-free HTTP origin. Cloudflare serves HTTPS to visitors, while Cloudflare-to-origin traffic remains unencrypted HTTP. Proxied DNS alone does not eliminate origin TLS requirements under Full or Full (strict). See [Cloudflare Flexible mode](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/flexible/).
5. If desired, enable **Always Use HTTPS** at Cloudflare. Do not add an HTTP-to-HTTPS redirect at the origin with Flexible mode; that causes a redirect loop.

Visit **https://YOUR_DOMAIN** through Cloudflare. No origin certificate or host port 443 listener is configured by this example.

Check status/logs or stop the service:

```sh
docker compose ps
docker compose logs --tail=100 -f web
docker compose down
```

Update the application:

```sh
git pull --ff-only
docker compose up -d --build
```

The dependency and historical-data stages are cached separately, so UI code changes can reuse both. `DATA_FROM` defaults to `2022-01`; an empty `DATA_TO` downloads through the previous UTC calendar month. Keep at least two years for daily-chart sessions. To include newly published monthly archives, change `DATA_REFRESH` in `.env` (for example, to the current month) before rebuilding, or run:

```sh
DATA_REFRESH=$(date -u +%Y-%m) docker compose up -d --build
```

Changing the refresh value invalidates the history-download stage. The refreshed archives are baked into the new static export; restarting an existing image alone does not update data.

Without Compose:

```sh
docker build -t price-action-game .
docker run -d --name price-action-game --restart unless-stopped -p 127.0.0.1:3002:80 price-action-game
```

Local archives, Git metadata, environment files, and build outputs are excluded from the Docker context. The final image contains Nginx and the static export, not the Node.js build toolchain.

## Install on a tablet or desktop

The website includes a web-app manifest, 192px/512px app icons, a maskable icon, and an Apple touch icon. Its launch mode is **standalone**, so supporting browsers can open it from the home screen in a separate app window without the normal browser address bar. Installation does not lock screen orientation or disable pinch zoom.

- **Android:** open your deployed **HTTPS** URL in Chrome, open the browser menu, and select **Install app** or **Add to Home screen** (the wording varies). Launch the installed app from its home-screen icon. If DuckDuckGo creates only a shortcut that opens a browser tab, install through Chrome instead; website configuration cannot force a browser to support standalone installation.
- **iPad:** open the HTTPS website in Safari, then use **Share → Add to Home Screen**. Enable **Open as Web App** if offered. Launch the new home-screen icon.
- **Desktop:** in a supported browser such as Chrome or Edge, use the browser's installation option.

Installation requires HTTPS, except for localhost development. Your Cloudflare-proxied HTTPS domain works with the existing HTTP origin configuration; visiting a plain HTTP server IP from a tablet does not meet the installation requirement. See [MDN installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

This change provides installation support, not a full offline mode. No service worker preloads the historical-data archives or caches application versions. A network connection is still needed to load the app/data, and the active game is still discarded on reload. Existing browser-local settings/history may not carry over when installing through a different browser. After deployment, reload the HTTPS page before installing. The static server and container Nginx serve the manifest with the correct MIME type and revalidation headers.

### Address bars and tablet overscroll

The app requests standalone display, but a home-screen icon is not proof that the browser installed a standalone PWA. If Android still shows an address bar, check that you installed from the final HTTPS hostname and launch the installed app rather than a bookmark/shortcut. Redirecting to a different hostname or origin can cause a standalone app to show browser controls. Some browser/device combinations only create shortcuts; Chrome on devices without Google Mobile Services may do this too. A screenshot of the bar, the final URL, and device/browser versions are needed to distinguish these cases. Setting the manifest to fullscreen cannot force a normal browser shortcut to become a standalone app.

The page and scroll-panel boundaries suppress overscroll bounce/pull-to-refresh with CSS while retaining scrolling within content and pinch zoom. This relies on browser support: older iPadOS Safari versions may still bounce, including a non-scrollable-page bug fixed in Safari 16.4. See [Apple's Safari 16.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-16_4-release-notes).

## Game rules

- A new game starts with **10,000 USDT**. Balance carries across **20 turns**. Liquidation ends the game immediately. There is no manual End Game button.
- Each turn randomly selects a historical start at or after January 1, 2022. It shows **500–1,500 initial candles**, repicking when history is insufficient. The initial final close is normalized to **100** using one fixed OHLC multiplier throughout the turn. Calendar dates are hidden. The market symbol and Bitcoin icon are hidden before a game starts and during active turns, and revealed only after a turn ends. The separate introductory slogan area is removed.
- Replay has **no fixed candle limit**. Play at 1×, 2×, 5×, 10×, or 20×; one candle per second at 1×. **Space** toggles playback; **Right Arrow** or **Next** advances immediately when pressed, then repeats at the same selected 1×–20× rate as Play (one candle per second at 1×). Speed changes also update a running hold. Playback pauses in a hidden tab.
- **Finish turn** cancels every pending order and closes the open position at the **last visible close**, with market slippage and fees. It reveals no further candles. Reaching the latest closed API candle or the end of the installed archive pack automatically finishes the turn. Data gaps and connection errors pause playback instead of fabricating prices.
- **Repick** changes the chart without consuming a turn, until an order is successfully submitted. Canceling that order does not unlock Repick.
- Order tabs are **Stop market → Stop limit → Market → Limit**, with **Stop market** selected for new/reset tickets. Market, limit, stop-market, and stop-limit entries support long and short directions; leverage is 2×, 3×, 5×, or 10×. **SL is required when submitting an entry for risk-based sizing**, TP is optional. Once a position is open, its SL and TP may each be canceled, re-added, or modified. SL can be moved farther away; liquidation remains active without an SL.
- Cancel an unsubmitted ticket with **×** beside its entry/trigger line or in the order-ticket header. This hides draft entry/SL/TP lines and resets the ticket without canceling placed orders or closing positions. Successful submission also returns the ticket to its initial state. Every pending order remains on the chart with its entry, SL, optional TP, and stop-limit limit price, labeled by order ID, side, type, and quantity. Its entry-line **×** cancels that pending order and removes its lines.
- The open position has one **AVG** entry line at the weighted average price. Position SL/TP labels show the entire remaining position size; same-direction additions replace both protections for the combined position, and partial closes reduce their size. Use their chart **×** controls or **Cancel SL / Cancel TP** in the sidebar to remove protection. Click **Add SL / Add TP** in the sidebar or the **SL / TP** buttons on the average-entry chart label to immediately restore missing exits at valid defaults relative to the current market (SL 0.5%, TP 1%). Enter a custom price and select **Update protection** to restore it instead; existing lines remain draggable. Blank position fields remove the corresponding protection when updated. Fields show which side of the current price is valid for the position direction, with inline errors for invalid values. Chart action labels use a separate flex row so cancel buttons cannot cover their text or the price axis.
- Quantity is **balance × risk percentage ÷ entry-to-SL distance**. Market entries use the slipped entry; pending quantities are fixed at submission. Fees and slippage are additional to the risk budget. Insufficient-margin orders are rejected, including at fill time. Pending orders conservatively reserve margin.
- There is one net position. Opposite fills reduce it; excess quantity reverses it. Same-direction fills use a weighted average entry and apply the latest order's SL, TP, and leverage to the entire combined position. Position size is not manually editable.
- Close 25%, 50%, 75%, or 100% of the **remaining** position. Grab anywhere along an entry/SL/TP line to drag it. The line, axis price, form field, and chart action label update live, including position SL/TP; Escape restores all previews. The current-price guide uses a faint neutral dotted line in both themes to distinguish it from order levels. Dragging pauses playback; position protection is validated and committed on release. Escape cancels a drag. Focus a line and use Up/Down (Shift for larger steps) for keyboard adjustments. Chart lines and price fields allow protection updates.
- Every executed fill pays **0.05%**. Market orders, stop entries, SL exits, and manual/turn-end closes have **0.01% adverse slippage**. Limit and TP fills do not have market slippage. Funding is omitted.

### Deliberate simulation simplifications

OHLC data cannot establish the intrabar price path. Protection on an existing position is evaluated first, followed by pending orders in submission order. **SL is evaluated before TP** when both are touched. Newly filled entries also check the full entry candle's range, conservatively applying SL first even when the true path is unknowable. Gapped stop fills use the worse open; limit fills can improve to the open.

Cross margin uses total account equity with a fixed **0.5% maintenance rate**, candle prices rather than mark prices, and no tiered margin schedules. If liquidation and SL are both reachable, the closer adverse threshold wins; opening gaps beyond liquidation liquidate immediately. Negative post-liquidation account balances are floored at zero. These rules model practice, not a specific exchange's liquidation system.

Prices and quantities are normalized: displayed **units are not literal BTC**. Scaling quantity inversely with normalized price preserves the simulated USDT P&L, percentage risk, fees, and margin relationships. New orders, liquidation calculations, and positions all use the same price scale.

Trade count and win rate use **fully closed position cycles**, net of entry/exit fees. Partial closes accumulate within that cycle. Reversing closes one cycle and starts another. Summary drawdown measures **turn-end balances**, not intrabar equity drawdown.

## Display and readability

The terminal uses the full browser width with no maximum page-width cap. Turn count and progress share the account statistics strip. The left column contains the chart and a bounded, scrollable orders/activity panel; the right column contains the order manager and fills the same remaining browser height. Activity starts at 400px and the chart takes the remaining left-column height; both columns stay within the desktop viewport before and during games. Header/statistics/error rows take their natural height, and the workspace flexes to the bottom without a hard-coded header offset. Drag the horizontal divider between the chart and Orders & activity to resize both panes. Focus the divider and use Up/Down (Shift for larger steps), Home/End for the minimum/maximum chart height, or Enter/double-click to restore the default split. Escape cancels an active drag. The split stays in place across turns and adapts to window resizing during the current page session. Both panes retain a usable minimum height; exceptionally short viewports reduce the initial activity height to leave chart space. Chart placeholders and overlays stay contained inside their pane, while replay controls remain above chart layers. The activity list and trading sidebar scroll independently, so pending orders, fills, and position controls remain accessible after resizing or changing font size. Narrow windows stack the columns and scroll the page. On short desktop windows, the panes scroll internally while their bottoms remain anchored to the viewport. The Expand Chart toolbar button provides a focused chart view while keeping replay controls available. Smaller screens keep a stacked layout.

Use the header’s **Light / Dark** switch or **Settings → Appearance** to change the interface, chart background, grids, candles, price labels, and annotations. Your appearance preference is saved locally and changing it does not reset the game. The page footer is removed; the read-only simulated-execution/slippage/funding note is in Settings. TradingView’s native chart logo remains visible; the Chart help dialog also links to TradingView.

The default UI uses larger text, wider trading panels, and 14-pixel chart labels. In **Settings → Display size**, choose Half size (-50%), Small (-30%), Compact (-15%), Comfortable (default), Large (+15%), Extra large (+30%), or Huge (+50%). This scales UI typography, panel widths, and chart labels together without requiring browser zoom. Existing saved risk/interval settings are retained when upgrading.

The playback toolbar is ordered **Play → Next → Speed → Repick → ?**. The question-mark button opens Chart help with keyboard shortcuts, data-source/status information, and turn/repick behavior. The old chart-footer row is removed. **Finish turn**, **Next turn**, and **New game** appear below the current-turn metrics in the right sidebar. The Blind mode tooltip opens above the OHLC row, including when focused from the keyboard.

On touch-capable devices (including iPad and Android tablets), Orders & activity is hidden initially. A switch at the right of the playback toolbar toggles the left pane between Chart and Orders & activity; the toolbar stays available in either view. Switching pauses replay and keeps both panes mounted to retain drawings, zoom, and activity state. Rotation and screen size do not determine whether this mode is enabled. Mouse-only computers retain the draggable chart/activity split, even in a narrow window. Touch-capable hybrid computers also use the touch layout. This view choice lasts for the page session.

## Right-click order preparation

During an active turn, right-click a chart price level to open three actions. Above the current price: Sell Limit, Buy Stop Market, Buy Stop Limit. Below it: Buy Limit, Sell Stop Market, Sell Stop Limit. At the current price, only the limit action is available. The menu uses the pointer’s actual chart-price coordinate, hides the asset symbol, pauses replay, and cancels unfinished drawing gestures. It stays within the chart bounds and supports arrow-key navigation, Escape, and outside-click dismissal.

Choosing an action **only opens/prefills the ticket**; it never submits an order or locks Repick. Entry/trigger is the clicked level, SL defaults to 0.5% away, and TP to 1% away in the selected direction. Risk sizing remains automatic. Stop-limit orders include an editable limit field, defaulting one normalized tick (0.0001) beyond the trigger in the order direction; moving the trigger preserves that spread. Review the ticket and explicitly place it.

Stop-limit orders first activate at the stop trigger, then behave as limit orders. A continuous intrabar trigger fills at the trigger price under the candle model. A gap beyond the limit activates the order but cannot fill it at a worse price; it stays pending until the limit is reached or improved. Limit fills do not receive market slippage. Sizing and margin reservation use the limit price. Pending triggered orders are labeled in activity and cancel normally, including at turn end.

## Chart grid and indicators

The chart uses a linear price scale and the library's uniform time-tick distribution to avoid partially drawn time marks of the same priority. Native grid lines remain tied to the price/time axes and adapt to zoom; this is not a fixed-pixel decorative grid.

Open **Indicators → EMA 20** to show/hide the 20-period exponential moving average of closes, enabled by default for each chart. It is calculated from revealed candles only, seeded from the first available close, and updated incrementally during replay. Repicking or starting another chart rebuilds it from that chart's history. Changing theme or display size keeps the indicator aligned. Its latest value has a faint dotted horizontal guide in the EMA color and a numeric price-axis label; both hide with the indicator. Lightweight Charts supports custom indicator series; it does not bundle the TradingView.com indicator catalog or Pine Script picker.

## Chart drawing toolbar

The free chart includes a custom drawing toolbar built on Lightweight Charts. It is not the proprietary TradingView Advanced Charts toolbar and needs no external library license or API key.

- **Cursor/select**, **trendline**, **ray**, **horizontal line**, **vertical line**, **rectangle**, and **price-range ruler**.
- Drag to draw, or click the first point and then the endpoint. Horizontal/vertical lines need one click. The ruler displays signed price change, percentage change, and bar distance in real time.
- Select a drawing to drag it; drag its endpoint handles to resize. Annotations store logical chart positions and prices so they remain aligned during pan, zoom, resizing, and replay. Drawing interactions pause playback.
- Choose a drawing color, hide/show annotations, undo/redo, delete a selected annotation, or clear all drawings. Clearing can be undone. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes; Delete/Backspace removes the selected drawing. Escape cancels unfinished drawing/editing or clears selection.
- Reset View restores automatic price scaling and the latest 110 candles. Expand Chart toggles the focused chart view.

The dotted price and bar-count crosshair guides remain visible while hovering over the plot with any drawing tool selected, during placement, and while editing drawings or dragging orders. They track chart coordinates through zoom, pan, resizing, theme, and display-size changes. Bar labels in blank space use logical bar positions without loading future candles. Guides clear when leaving the plot or hovering over chart menus.

Selected drawing endpoints have invisible grab targets at least 44px wide around the small visible dots. Grab an endpoint to resize while keeping the opposite endpoint fixed; grabbing off-center preserves the grab offset. The selected drawing stays above order-line drag targets. During placement or editing, touch gestures on the chart do not scroll the page, and active drags capture the pointer. Release commits the final location; Escape, pointer cancellation, or lost capture restores the original drawing and unlocks scrolling.

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
