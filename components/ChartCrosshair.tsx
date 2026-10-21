"use client";
import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import { CHART_THEMES, type Theme } from "@/lib/theme";

type Props = {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  canvas: HTMLDivElement | null;
  anchor: number;
  theme: Theme;
  textScale: number;
};

export default function ChartCrosshair({
  chart,
  series,
  canvas,
  anchor,
  theme,
  textScale,
}: Props) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const surface = canvas?.parentElement;
    if (!surface || !canvas || !chart) return;
    const clear = () => setPointer(null);
    const move = (event: PointerEvent) => {
      const target = event.target;
      if (
        event.pointerType === "touch" ||
        (target instanceof Element &&
          target.closest(".drawing-toolbar, .chart-indicators, .chart-order-menu"))
      ) {
        clear();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const pane = chart.paneSize();
      setPointer(
        x >= 0 && x < pane.width && y >= 0 && y < pane.height
          ? { x, y }
          : null,
      );
    };
    // Capture also sees events consumed by drawing handles and order lines.
    surface.addEventListener("pointermove", move, true);
    surface.addEventListener("pointerleave", clear);
    surface.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    return () => {
      surface.removeEventListener("pointermove", move, true);
      surface.removeEventListener("pointerleave", clear);
      surface.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
    };
  }, [canvas, chart]);
  if (!pointer || !chart || !series) return null;
  const pane = chart.paneSize();
  if (pointer.x >= pane.width || pointer.y >= pane.height) return null;
  const logical = chart.timeScale().coordinateToLogical(pointer.x);
  const price = series.coordinateToPrice(pointer.y);
  if (logical === null || price === null || !Number.isFinite(price)) return null;
  const barIndex = Math.round(logical);
  const barX = chart.timeScale().logicalToCoordinate(barIndex as Logical);
  if (barX === null) return null;
  const x = Math.max(0, Math.min(pane.width - 1, barX));
  const palette = CHART_THEMES[theme];
  const fontSize = Math.round(14 * textScale);
  return (
    <div className="chart-crosshair" aria-hidden="true">
      <svg width={pane.width} height={pane.height}>
        <path
          d={`M0 ${pointer.y}H${pane.width} M${x} 0V${pane.height}`}
          fill="none"
          stroke={palette.crosshair}
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
      <span
        className="crosshair-price"
        style={{
          left: pane.width,
          top: Math.max(fontSize, Math.min(pane.height - fontSize, pointer.y)),
          background: palette.label,
          color: palette.labelText,
          fontSize,
        }}
      >
        {price.toFixed(4)}
      </span>
      <span
        className="crosshair-bar"
        style={{
          left: x,
          top: pane.height,
          maxWidth: pane.width,
          background: palette.label,
          color: palette.labelText,
          fontSize,
          transform: x < 60 * textScale
            ? "none"
            : x > pane.width - 60 * textScale
              ? "translateX(-100%)"
              : "translateX(-50%)",
        }}
      >
        Bar {barIndex - anchor + 1}
      </span>
    </div>
  );
}
