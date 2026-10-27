"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  TrackingModeExitMode,
  type TickMarkType,
  type Time,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { chartPrice, chartTime, chartTimeTick } from "@/lib/chart-display";
import ChartDrawings from "./ChartDrawings";
import ChartCrosshair from "./ChartCrosshair";
import { createChartNavigation } from "@/lib/chart-navigation";
import { createOscillatorPanes } from "@/lib/chart-oscillators";
import { calculateEMA, nextEMA } from "@/lib/indicators";
import ChartOrderMenu from "./ChartOrderMenu";
import ChartLineControls from "./ChartLineControls";
import type { ChartOrderType } from "@/lib/order-ticket";
import type { Side } from "@/lib/engine";
import { CHART_THEMES, type Theme } from "@/lib/theme";
import type { Candle, Fill } from "@/lib/engine";
import { createLineDrag, type LinePreview } from "@/lib/line-drag";
import type { ChartLine } from "@/lib/chart-lines";
export type { ChartLine } from "@/lib/chart-lines";
type Props = {
  candles: Candle[];
  revealFactor?: number | null;
  lines: ChartLine[];
  fills: Fill[];
  anchor: number;
  onCancelLine: (id: string) => void;
  onAddProtection: (kind: "sl" | "tp") => void;
  onLine: (id: string, price: number) => void;
  onLinePreview: (id: string, price: number) => void;
  onDragStart: () => void;
  textScale: number;
  theme: Theme;
  canTrade: boolean;
  onPrepareOrder: (side: Side, type: ChartOrderType, price: number) => void;
};
export default function PriceChart({
  candles,
  revealFactor = null,
  lines,
  fills,
  anchor,
  onLine,
  onCancelLine,
  onAddProtection,
  onLinePreview,
  onDragStart,
  textScale,
  theme,
  canTrade,
  onPrepareOrder,
}: Props) {
  const [context, setContext] = useState<{
    x: number;
    y: number;
    price: number;
  } | null>(null);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showMACD, setShowMACD] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const oscillators = useRef<ReturnType<typeof createOscillatorPanes> | null>(
    null,
  );
  const ema = useRef<ISeriesApi<"Line"> | null>(null);
  const emaValue = useRef<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi | null>(null);
  const navigation = useRef<ReturnType<typeof createChartNavigation> | null>(
    null,
  );
  if (!navigation.current)
    navigation.current = createChartNavigation(() => api.current);
  const [drawingLocked, setDrawingLocked] = useState(false);
  const drawingNavigation = useCallback((locked: boolean) => {
    navigation.current?.lock("drawing", locked);
    setDrawingLocked(locked);
  }, []);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLines = useRef(new Map<string, IPriceLine>());
  const dataRef = useRef(candles);
  dataRef.current = candles;
  const revealRef = useRef(revealFactor);
  revealRef.current = revealFactor;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const callbacks = useRef({ onLine, onLinePreview, onDragStart });
  callbacks.current = { onLine, onLinePreview, onDragStart };
  const inspectNavigation = useCallback((locked: boolean) => {
    navigation.current?.lock("inspection", locked);
    if (locked) callbacks.current.onDragStart();
  }, []);
  const [revision, redraw] = useState(0);
  const [dragging, setDragging] = useState<LinePreview | null>(null);
  const drag = useRef<ReturnType<typeof createLineDrag> | null>(null);
  if (!drag.current)
    drag.current = createLineDrag({
      toPrice: (y) => series.current?.coordinateToPrice(y) ?? null,
      start: () => {
        navigation.current?.lock("order", true);
        callbacks.current.onDragStart();
      },
      preview: (line) => {
        // Native price line and axis label update in the same pointer event.
        priceLines.current.get(line.id)?.applyOptions({ price: line.price });
        setDragging(line);
        callbacks.current.onLinePreview(line.id, line.price);
      },
      commit: (line) => callbacks.current.onLine(line.id, line.price),
      finish: () => {
        navigation.current?.lock("order", false);
        setDragging(null);
      },
    });
  useEffect(() => {
    const timeFormatter = (time: unknown) => {
      if (revealFactor) return chartTime(Number(time));
      const index = dataRef.current.findIndex((b) => b.time === Number(time));
      return `Bar ${index - anchorRef.current + 1}`;
    };
    api.current?.applyOptions({
      localization: {
        priceFormatter: (p: number) => chartPrice(p, revealFactor),
        timeFormatter,
      },
      timeScale: {
        tickMarkFormatter: (time: Time, type: TickMarkType) =>
          revealFactor
            ? chartTimeTick(Number(time), type)
            : timeFormatter(time).replace("Bar ", ""),
        tickMarkMaxCharacterLength: 8,
      },
    });
  }, [revealFactor]);
  const count = useRef(0);
  const firstTime = useRef(0);
  useEffect(() => {
    if (!container.current) return;
    const relativeTime = (time: unknown) => {
      if (revealRef.current) return chartTime(Number(time));
      const index = dataRef.current.findIndex((b) => b.time === Number(time));
      return `Bar ${index - anchorRef.current + 1}`;
    };
    const chart = createChart(container.current, {
      autoSize: true,
      trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
      layout: {
        background: { type: ColorType.Solid, color: "#101619" },
        textColor: "#7d8b91",
        fontSize: 14,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1a2226" },
        horzLines: { color: "#1a2226" },
      },
      rightPriceScale: {
        mode: PriceScaleMode.Normal,
        borderColor: "#273136",
        scaleMargins: { top: 0.12, bottom: 0.14 },
      },
      timeScale: {
        borderColor: "#273136",
        rightOffset: 8,
        barSpacing: 7,
        uniformDistribution: true,
        allowBoldLabels: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) =>
          revealRef.current
            ? chartTimeTick(Number(time), type)
            : relativeTime(time).replace("Bar ", ""),
        tickMarkMaxCharacterLength: 8,
      },
      localization: {
        timeFormatter: relativeTime,
        priceFormatter: (p: number) => chartPrice(p, revealRef.current),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Guides use a shared pointer capture layer so drawing overlays cannot hide them.
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    });
    const s = chart.addSeries(CandlestickSeries, {
      upColor: "#72d7b0",
      downColor: "#e98080",
      borderUpColor: "#72d7b0",
      borderDownColor: "#e98080",
      wickUpColor: "#72d7b0",
      wickDownColor: "#e98080",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      priceLineColor: CHART_THEMES[theme].currentPrice,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
    });
    api.current = chart;
    series.current = s;
    ema.current = chart.addSeries(LineSeries, {
      color: CHART_THEMES[theme].ema,
      lineWidth: 2,
      title: "EMA 20",
      priceLineVisible: true,
      priceLineColor: CHART_THEMES[theme].emaPriceLine,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    oscillators.current = createOscillatorPanes(chart, {
      line: LineSeries,
      histogram: HistogramSeries,
    });
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw((n) => n + 1));
    };
    const pan = (event: PointerEvent) => {
      if (event.buttons && !drag.current?.active) update();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    const observer = new ResizeObserver(update);
    observer.observe(container.current);
    const pricePane = chart.panes()[0]?.getHTMLElement();
    if (pricePane) observer.observe(pricePane);
    const node = container.current;
    const beginPan = (event: PointerEvent) => {
      if (event.button === 0) navigation.current?.beginPan();
    };
    node.addEventListener("pointerdown", beginPan, true);
    node.addEventListener("pointerup", update);
    node.addEventListener("wheel", update);
    node.addEventListener("pointermove", pan);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener("pointerup", update);
      node.removeEventListener("wheel", update);
      node.removeEventListener("pointermove", pan);
      node.removeEventListener("pointerdown", beginPan, true);
      priceLines.current.clear();
      oscillators.current?.destroy();
      oscillators.current = null;
      chart.remove();
      api.current = null;
      series.current = null;
      ema.current = null;
      emaValue.current = null;
      count.current = 0;
      firstTime.current = 0;
    };
  }, []);
  useEffect(() => {
    if (!series.current || !api.current || !candles.length) return;
    const changed =
      firstTime.current !== candles[0].time || candles.length < count.current;
    if (changed || !count.current || candles.length > count.current + 1) {
      series.current.setData(
        candles.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
      );
      const values = calculateEMA(candles, 20);
      ema.current?.setData(
        values.map((point) => ({ ...point, time: point.time as UTCTimestamp })),
      );
      emaValue.current = values.at(-1)?.value ?? null;
    } else if (candles.length > count.current) {
      const b = candles[candles.length - 1];
      series.current.update({ ...b, time: b.time as UTCTimestamp });
      const value =
        emaValue.current === null
          ? b.close
          : nextEMA(emaValue.current, b.close, 20);
      ema.current?.update({ time: b.time as UTCTimestamp, value });
      emaValue.current = value;
    }
    if (changed || !count.current)
      api.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 110),
        to: candles.length + 7,
      });
    oscillators.current?.setCandles(candles);
    count.current = candles.length;
    firstTime.current = candles[0].time;
    redraw((n) => n + 1);
  }, [candles]);
  useEffect(() => {
    oscillators.current?.setEnabled({ macd: showMACD, rsi: showRSI });
    redraw((n) => n + 1);
  }, [showMACD, showRSI]);
  useEffect(() => {
    oscillators.current?.setAppearance(theme, revealFactor);
  }, [theme, revealFactor]);
  useEffect(() => {
    ema.current?.applyOptions({ visible: showEMA20 });
  }, [showEMA20]);
  useEffect(() => {
    const palette = CHART_THEMES[theme];
    api.current?.applyOptions({
      layout: {
        fontSize: Math.round(14 * textScale),
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.label,
        },
        horzLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.label,
        },
      },
    });
    ema.current?.applyOptions({
      color: palette.ema,
      priceLineColor: palette.emaPriceLine,
    });
    series.current?.applyOptions({
      priceLineColor: palette.currentPrice,
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    redraw((n) => n + 1);
  }, [textScale, theme]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const valid = lines.filter(
      (line) => Number.isFinite(line.price) && line.price > 0,
    );
    const ids = new Set(valid.map((line) => line.id));
    for (const [id, native] of priceLines.current) {
      if (!ids.has(id)) {
        s.removePriceLine(native);
        priceLines.current.delete(id);
      }
    }
    for (const line of valid) {
      const options = {
        price:
          drag.current?.active?.id === line.id
            ? drag.current.active.price
            : line.price,
        color: line.color,
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: line.cancelLabel || line.addProtection?.length ? "" : line.title,
      };
      const native = priceLines.current.get(line.id);
      if (native) native.applyOptions(options);
      else priceLines.current.set(line.id, s.createPriceLine(options));
    }
    redraw((n) => n + 1);
  }, [lines, dragging?.id]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current?.active || !container.current) return;
      event.preventDefault();
      drag.current.move(
        event.clientY - container.current.getBoundingClientRect().top,
      );
    };
    const up = () => drag.current?.end();
    const cancel = () => drag.current?.end(true);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current?.active) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, []);
  void revision;
  const paneTop = (index: number) => {
    const pane = api.current?.panes()[index]?.getHTMLElement();
    return pane && container.current
      ? pane.getBoundingClientRect().top -
          container.current.getBoundingClientRect().top
      : 0;
  };
  return (
    <div className="chart-workbench">
      <div
        className="chart-surface"
        onContextMenu={(event) => {
          if (
            !canTrade ||
            !series.current ||
            !api.current ||
            !container.current ||
            (event.target instanceof Element &&
              event.target.closest(".drawing-toolbar, .chart-indicators"))
          )
            return;
          const bounds = container.current.getBoundingClientRect();
          const x = event.clientX - bounds.left,
            y = event.clientY - bounds.top;
          if (y < 0 || y > api.current.paneSize().height) return;
          const clicked = series.current.coordinateToPrice(y);
          if (clicked === null || !Number.isFinite(clicked) || clicked <= 0)
            return;
          event.preventDefault();
          drag.current?.end(true);
          onDragStart();
          setContext({ x, y, price: +clicked.toFixed(6) });
        }}
      >
        <div ref={container} className="chart-canvas" />
        <details
          className="chart-indicators"
          style={{
            right: (api.current?.priceScale("right").width() ?? 80) + 12,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <summary>Indicators</summary>
          <label>
            <input
              type="checkbox"
              checked={showEMA20}
              onChange={(event) => setShowEMA20(event.target.checked)}
            />
            EMA 20
          </label>
          <label>
            <input
              type="checkbox"
              checked={showMACD}
              onChange={(event) => setShowMACD(event.target.checked)}
            />
            MACD (12, 26, 9)
          </label>
          <label>
            <input
              type="checkbox"
              checked={showRSI}
              onChange={(event) => setShowRSI(event.target.checked)}
            />
            RSI (14)
          </label>
        </details>
        {(showMACD || showRSI) && (
          <div className="oscillator-labels" aria-hidden="true">
            {showMACD && (
              <span style={{ top: paneTop(1) + 8 }}>MACD (12, 26, 9)</span>
            )}
            {showRSI && (
              <span
                style={{
                  top: paneTop(showMACD ? 2 : 1) + 8,
                }}
              >
                RSI (14)
              </span>
            )}
          </div>
        )}
        <ChartDrawings
          chart={api.current}
          series={series.current}
          textScale={textScale}
          revealFactor={revealFactor}
          onInteract={onDragStart}
          contextOpen={canTrade && context !== null}
          onNavigationLock={drawingNavigation}
        />
        <ChartCrosshair
          chart={api.current}
          series={series.current}
          canvas={container.current}
          anchor={anchor}
          candles={candles}
          revealFactor={revealFactor}
          theme={theme}
          textScale={textScale}
          timeAxisTop={
            (showMACD || showRSI) && api.current && container.current
              ? container.current.clientHeight -
                api.current.timeScale().height()
              : undefined
          }
          blocked={drawingLocked || dragging !== null || context !== null}
          onInspectionChange={inspectNavigation}
        />
        <div
          className="chart-watermark"
          style={{ top: (api.current?.paneSize(0).height ?? 0) * 0.44 }}
        >
          PRICE ACTION<span>READ THE MARKET. TRUST YOUR PROCESS.</span>
        </div>
        {lines
          .filter((l) => l.draggable && l.price > 0)
          .map((l) => {
            const y = series.current?.priceToCoordinate(
              dragging?.id === l.id ? dragging.price : l.price,
            );
            if (
              y === null ||
              y === undefined ||
              y < 0 ||
              y > (api.current?.paneSize(0).height ?? 0)
            )
              return null;
            return (
              <button
                key={l.id}
                className={`chart-line-target ${dragging?.id === l.id ? "is-dragging" : ""}`}
                style={{ top: y, color: l.color }}
                title={`Drag anywhere on ${l.title}. Escape cancels. Arrow keys fine-tune the price.`}
                aria-label={`Drag ${l.title}`}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !container.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current?.begin(
                    l.id,
                    l.price,
                    e.clientY - container.current.getBoundingClientRect().top,
                    y,
                  );
                }}
                onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const step =
                    Math.max(0.0001, l.price * 0.00001) *
                    (event.shiftKey ? 10 : 1);
                  callbacks.current.onDragStart();
                  callbacks.current.onLine(
                    l.id,
                    +(
                      l.price + (event.key === "ArrowUp" ? step : -step)
                    ).toFixed(6),
                  );
                }}
              >
                <span className="chart-line-label">
                  {l.title} <span>↕</span>
                  <strong>
                    {(dragging?.id === l.id ? dragging.price : l.price).toFixed(
                      4,
                    )}
                  </strong>
                </span>
              </button>
            );
          })}
        {canTrade &&
          lines
            .filter(
              (line) =>
                (line.cancelLabel || line.addProtection?.length) &&
                Number.isFinite(line.price) &&
                line.price > 0,
            )
            .map((line) => (
              <ChartLineControls
                key={`controls-${line.id}`}
                line={line}
                preview={dragging}
                toCoordinate={(price) =>
                  series.current?.priceToCoordinate(price)
                }
                paneHeight={api.current?.paneSize().height ?? 0}
                axisWidth={api.current?.priceScale("right").width() ?? 80}
                onCancel={() => {
                  drag.current?.end(true);
                  onCancelLine(line.id);
                }}
                onAdd={(kind) => {
                  drag.current?.end(true);
                  onAddProtection(kind);
                }}
              />
            ))}
        {fills.slice(-100).map((f, i) => {
          const x = api.current
            ?.timeScale()
            .timeToCoordinate(f.time as UTCTimestamp);
          const y = series.current?.priceToCoordinate(f.price);
          if (
            x == null ||
            y == null ||
            x < 0 ||
            y < 0 ||
            x > (container.current?.clientWidth ?? 0) - 80 ||
            y > (container.current?.clientHeight ?? 0) - 25
          )
            return null;
          return (
            <span
              key={`${f.time}-${i}`}
              className={`fill-marker ${f.side}`}
              style={{ left: x, top: y }}
              title={`${f.action} · ${f.price.toFixed(4)}`}
            >
              {f.side === "long" ? "▲" : "▼"}
            </span>
          );
        })}
        {canTrade && context && (
          <ChartOrderMenu
            key={`${context.x}-${context.y}`}
            {...context}
            last={candles.at(-1)!.close}
            onChoose={onPrepareOrder}
            onClose={() => setContext(null)}
          />
        )}
      </div>
    </div>
  );
}
