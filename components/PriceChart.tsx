"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Fill } from "@/lib/engine";
export type ChartLine = {
  id: string;
  price: number;
  color: string;
  title: string;
  draggable?: boolean;
};
type Props = {
  candles: Candle[];
  lines: ChartLine[];
  fills: Fill[];
  anchor: number;
  onLine: (id: string, price: number) => void;
};
export default function PriceChart({
  candles,
  lines,
  fills,
  anchor,
  onLine,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const dataRef = useRef(candles);
  dataRef.current = candles;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const callback = useRef(onLine);
  callback.current = onLine;
  const drag = useRef<{ id: string; price: number } | null>(null);
  const [revision, redraw] = useState(0);
  const [dragging, setDragging] = useState<{ id: string; y: number } | null>(
    null,
  );
  const count = useRef(0);
  const firstTime = useRef(0);
  useEffect(() => {
    if (!container.current) return;
    const relativeTime = (time: unknown) => {
      const index = dataRef.current.findIndex((b) => b.time === Number(time));
      return `Bar ${index - anchorRef.current + 1}`;
    };
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#101619" },
        textColor: "#7d8b91",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1a2226" },
        horzLines: { color: "#1a2226" },
      },
      rightPriceScale: {
        borderColor: "#273136",
        scaleMargins: { top: 0.12, bottom: 0.14 },
      },
      timeScale: {
        borderColor: "#273136",
        rightOffset: 8,
        barSpacing: 7,
        timeVisible: true,
        tickMarkFormatter: relativeTime,
      },
      localization: {
        timeFormatter: relativeTime,
        priceFormatter: (p: number) => p.toFixed(4),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#5f7179", labelBackgroundColor: "#303e45" },
        horzLine: { color: "#5f7179", labelBackgroundColor: "#303e45" },
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
    });
    api.current = chart;
    series.current = s;
    const update = () => redraw((n) => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    const observer = new ResizeObserver(update);
    observer.observe(container.current);
    const node = container.current;
    node.addEventListener("pointerup", update);
    node.addEventListener("wheel", update);
    return () => {
      observer.disconnect();
      node.removeEventListener("pointerup", update);
      node.removeEventListener("wheel", update);
      chart.remove();
      api.current = null;
      series.current = null;
      count.current = 0;
      firstTime.current = 0;
    };
  }, []);
  useEffect(() => {
    if (!series.current || !api.current || !candles.length) return;
    const changed =
      firstTime.current !== candles[0].time || candles.length < count.current;
    if (changed || !count.current || candles.length > count.current + 1)
      series.current.setData(
        candles.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
      );
    else if (candles.length > count.current) {
      const b = candles[candles.length - 1];
      series.current.update({ ...b, time: b.time as UTCTimestamp });
    }
    if (changed || !count.current)
      api.current
        .timeScale()
        .setVisibleLogicalRange({
          from: Math.max(0, candles.length - 110),
          to: candles.length + 7,
        });
    count.current = candles.length;
    firstTime.current = candles[0].time;
    redraw((n) => n + 1);
  }, [candles]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    priceLines.current.forEach((l) => s.removePriceLine(l));
    priceLines.current = lines
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        s.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.title,
        }),
      );
    redraw((n) => n + 1);
  }, [lines]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current || !series.current || !container.current) return;
      const y = e.clientY - container.current.getBoundingClientRect().top;
      const price = series.current.coordinateToPrice(y);
      if (price !== null && price > 0) {
        drag.current.price = price;
        setDragging({ id: drag.current.id, y });
      }
    };
    const up = () => {
      if (drag.current)
        callback.current(drag.current.id, +drag.current.price.toFixed(6));
      drag.current = null;
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  void revision;
  return (
    <div className="chart-surface">
      <div ref={container} className="chart-canvas" />
      <div className="chart-watermark">
        PRICE ACTION<span>READ THE MARKET. TRUST YOUR PROCESS.</span>
      </div>
      {lines
        .filter((l) => l.draggable && l.price > 0)
        .map((l) => {
          const y =
            dragging?.id === l.id
              ? dragging.y
              : series.current?.priceToCoordinate(l.price);
          if (
            y === null ||
            y === undefined ||
            y < 0 ||
            y > (container.current?.clientHeight ?? 0) - 28
          )
            return null;
          return (
            <button
              key={l.id}
              className="line-grip"
              style={{ top: y, color: l.color, borderColor: l.color }}
              title={`Drag ${l.title}; you can also edit its price in the order panel`}
              aria-label={`Drag ${l.title}`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                drag.current = { id: l.id, price: l.price };
                setDragging({ id: l.id, y });
              }}
            >
              {l.title} <span>↕</span>
            </button>
          );
        })}
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
    </div>
  );
}
