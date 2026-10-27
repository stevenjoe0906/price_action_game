"use client";
import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import { chartBar, chartPrice } from "@/lib/chart-display";
import type { Candle } from "@/lib/engine";
import { CHART_THEMES, type Theme } from "@/lib/theme";

type Props = {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  canvas: HTMLDivElement | null;
  anchor: number;
  candles?: Candle[];
  revealFactor?: number | null;
  theme: Theme;
  textScale: number;
  timeAxisTop?: number;
  blocked?: boolean;
  onInspectionChange?: (active: boolean) => void;
};

export default function ChartCrosshair({
  chart,
  series,
  canvas,
  anchor,
  candles = [],
  revealFactor = null,
  theme,
  textScale,
  timeAxisTop,
  blocked = false,
  onInspectionChange,
}: Props) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [touchPending, setTouchPending] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const inspectionCallback = useRef(onInspectionChange);
  inspectionCallback.current = onInspectionChange;
  useEffect(() => {
    const surface = canvas?.parentElement;
    if (!surface || !canvas || !chart) return;
    let mode = false;
    let gesture: {
      id: number;
      x: number;
      y: number;
      moved: boolean;
      multi: boolean;
    } | null = null;
    const notify = (active: boolean) => {
      if (inspectionCallback.current) inspectionCallback.current(active);
      else chart.applyOptions({ handleScroll: !active, handleScale: !active });
    };
    const setMode = (active: boolean) => {
      mode = active;
      setInspecting(active);
      notify(active);
    };
    const release = () => {
      const id = gesture?.id;
      gesture = null;
      if (id !== undefined && surface.hasPointerCapture?.(id))
        surface.releasePointerCapture(id);
    };
    const reset = () => {
      release();
      if (mode) setMode(false);
      setPointer(null);
      setTouchPending(false);
    };
    const position = (event: PointerEvent, clamp = false) => {
      const bounds = canvas.getBoundingClientRect();
      const pane = chart.paneSize();
      let x = event.clientX - bounds.left,
        y = event.clientY - bounds.top;
      if (clamp) {
        x = Math.max(0, Math.min(pane.width - 1, x));
        y = Math.max(0, Math.min(pane.height - 1, y));
      }
      return x >= 0 && x < pane.width && y >= 0 && y < pane.height
        ? { x, y }
        : null;
    };
    const excluded = (event: PointerEvent) =>
      event.target instanceof Element &&
      !!event.target.closest(
        ".drawing-toolbar, .chart-indicators, .chart-order-menu",
      );
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      if (gesture) {
        gesture.multi = true;
        return;
      }
      const eligible =
        !blocked &&
        !excluded(event) &&
        event.target instanceof Element &&
        !!event.target.closest(".chart-canvas, .touch-crosshair-target");
      if (!eligible || !position(event)) {
        reset();
        return;
      }
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        multi: false,
      };
      if (mode) {
        event.preventDefault();
        surface.setPointerCapture?.(event.pointerId);
        setTouchPending(true);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (gesture?.id === event.pointerId) {
          gesture.moved ||=
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >
            8;
          if (mode && !gesture.multi && gesture.moved) {
            event.preventDefault();
            setTouchPending(false);
            setPointer(position(event, true));
          }
        }
        if (!mode) setPointer(null);
        return;
      }
      if (mode) reset();
      setPointer(excluded(event) ? null : position(event));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || gesture?.id !== event.pointerId)
        return;
      const tap =
        !gesture.multi &&
        !gesture.moved &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 8;
      release();
      setTouchPending(false);
      if (tap) {
        const p = position(event);
        if (!p) return;
        setMode(!mode);
        setPointer(mode ? p : null);
      } else if (mode) setPointer(position(event, true));
    };
    const leave = () => {
      if (!mode) setPointer(null);
    };
    const cancel = (event: PointerEvent) => {
      if (!gesture || gesture.id === event.pointerId) reset();
    };
    const lost = (event: PointerEvent) => {
      if (gesture?.id === event.pointerId) reset();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset();
    };
    setPointer(null);
    setInspecting(false);
    surface.addEventListener("pointerdown", down, true);
    surface.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    surface.addEventListener("pointerup", up, true);
    surface.addEventListener("pointerleave", leave);
    surface.addEventListener("pointercancel", cancel);
    surface.addEventListener("lostpointercapture", lost);
    window.addEventListener("blur", reset);
    window.addEventListener("keydown", key);
    return () => {
      release();
      if (mode) notify(false);
      surface.removeEventListener("pointerdown", down, true);
      surface.removeEventListener("pointermove", move, true);
      surface.removeEventListener("pointerup", up, true);
      surface.removeEventListener("pointerleave", leave);
      surface.removeEventListener("pointercancel", cancel);
      surface.removeEventListener("lostpointercapture", lost);
      window.removeEventListener("blur", reset);
      window.removeEventListener("keydown", key);
    };
  }, [canvas, chart, blocked]);
  if (!pointer || !chart || !series) return null;
  const pane = chart.paneSize();
  if (pointer.x >= pane.width || pointer.y >= pane.height) return null;
  const logical = chart.timeScale().coordinateToLogical(pointer.x);
  const price = series.coordinateToPrice(pointer.y);
  if (logical === null || price === null || !Number.isFinite(price))
    return null;
  const barIndex = Math.round(logical);
  const barX = chart.timeScale().logicalToCoordinate(barIndex as Logical);
  if (barX === null) return null;
  const x = Math.max(0, Math.min(pane.width - 1, barX));
  const palette = CHART_THEMES[theme];
  const fontSize = Math.round(14 * textScale);
  return (
    <>
      {inspecting && (
        <div
          className="touch-crosshair-target"
          style={{ width: pane.width, height: pane.height }}
          aria-label="Crosshair inspection: drag to inspect, tap to resume chart panning"
        />
      )}
      {!touchPending && (
        <div className="chart-crosshair" aria-hidden="true">
          <svg width={pane.width} height={timeAxisTop ?? pane.height}>
            <path
              d={`M0 ${pointer.y}H${pane.width} M${x} 0V${timeAxisTop ?? pane.height}`}
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
              top: Math.max(
                fontSize,
                Math.min(pane.height - fontSize, pointer.y),
              ),
              background: palette.label,
              color: palette.labelText,
              fontSize,
            }}
          >
            {chartPrice(price, revealFactor)}
          </span>
          <span
            className="crosshair-bar"
            style={{
              left: x,
              top: timeAxisTop ?? pane.height,
              maxWidth: pane.width,
              background: palette.label,
              color: palette.labelText,
              fontSize,
              transform:
                x < 60 * textScale
                  ? "none"
                  : x > pane.width - 60 * textScale
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {chartBar(barIndex, anchor, candles, revealFactor !== null)}
          </span>
        </div>
      )}
    </>
  );
}
