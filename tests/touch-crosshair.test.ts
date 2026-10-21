import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import ChartCrosshair from "../components/ChartCrosshair";

test("touch tap toggles inspection, drag moves guides without panning, and exit restores navigation", () => {
  const dom = new JSDOM(
    '<div id="surface"><div class="chart-canvas"></div><div id="overlay"></div></div>',
  );
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const doc = dom.window.document;
  const canvas = doc.querySelector<HTMLDivElement>(".chart-canvas")!;
  const surface = doc.getElementById("surface")!;
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  let capture: number | null = null;
  surface.setPointerCapture = (id) => {
    capture = id;
  };
  surface.hasPointerCapture = (id) => capture === id;
  surface.releasePointerCapture = () => {
    capture = null;
  };
  let locked = false,
    pans = 0;
  const onInspectionChange = (active: boolean) => {
    locked = active;
  };
  canvas.addEventListener("pointermove", () => {
    if (!locked) pans++;
  });
  const chart = {
    paneSize: () => ({ width: 600, height: 400 }),
    timeScale: () => ({
      coordinateToLogical: (x: number) => x / 10,
      logicalToCoordinate: (x: number) => x * 10,
    }),
  } as unknown as IChartApi;
  const series = {
    coordinateToPrice: (y: number) => 100 - y / 10,
  } as unknown as ISeriesApi<"Candlestick">;
  const root = createRoot(doc.getElementById("overlay")!);
  const render = (blocked = false) =>
    act(() =>
      root.render(
        createElement(ChartCrosshair, {
          chart,
          series,
          canvas,
          anchor: 10,
          theme: "dark",
          textScale: 1,
          blocked,
          onInspectionChange,
        }),
      ),
    );
  const pointer = (
    target: Element,
    type: string,
    x: number,
    y: number,
    id = 1,
  ) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x + 10,
      clientY: y + 20,
    });
    Object.defineProperties(event, {
      pointerType: { value: "touch" },
      pointerId: { value: id },
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  const tap = (target: Element, x: number, y: number) => {
    pointer(target, "pointerdown", x, y);
    pointer(target, "pointerup", x, y);
  };
  const target = () => doc.querySelector(".touch-crosshair-target")!;
  try {
    render();
    pointer(canvas, "pointerdown", 100, 100);
    pointer(canvas, "pointermove", 160, 130);
    pointer(canvas, "pointerup", 160, 130);
    assert.equal(pans, 1, "Ordinary dragging pans and never enters inspection");
    assert.equal(target(), null);
    tap(canvas, 200, 100);
    assert.equal(locked, true);
    assert.ok(target());
    assert.equal(doc.querySelector(".crosshair-price")?.textContent, "90.0000");
    assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 11");
    assert.ok(pointer(target(), "pointerdown", 200, 100).defaultPrevented);
    assert.equal(capture, 1);
    assert.ok(pointer(surface, "pointermove", 300, 150).defaultPrevented);
    pointer(surface, "pointerup", 300, 150);
    assert.equal(capture, null);
    assert.equal(locked, true, "Releasing a drag keeps inspection active");
    assert.equal(pans, 1, "Inspection dragging never reaches the chart canvas");
    assert.equal(doc.querySelector(".crosshair-price")?.textContent, "85.0000");
    assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 21");
    act(() => surface.dispatchEvent(new dom.window.Event("pointerleave")));
    assert.ok(target(), "Crosshair remains after the finger lifts/leaves");
    pointer(target(), "pointerdown", 120, 90);
    assert.equal(
      doc.querySelector(".chart-crosshair"),
      null,
      "Exit tap hides guides immediately instead of moving them",
    );
    assert.ok(target(), "Capture target stays mounted through pointer release");
    pointer(surface, "pointermove", 122, 91);
    assert.equal(
      doc.querySelector(".chart-crosshair"),
      null,
      "Small tap jitter does not move or restore guides",
    );
    pointer(surface, "pointerup", 122, 91);
    assert.equal(locked, false);
    assert.equal(doc.querySelector(".chart-crosshair"), null);
    pointer(canvas, "pointerdown", 100, 100);
    pointer(canvas, "pointermove", 150, 100);
    pointer(canvas, "pointerup", 150, 100);
    assert.equal(pans, 2, "Normal chart panning is restored");
    // Pinch/multiple pointers must not accidentally toggle inspection on release.
    pointer(canvas, "pointerdown", 100, 100);
    pointer(canvas, "pointerdown", 200, 100, 2);
    pointer(canvas, "pointerup", 200, 100, 2);
    pointer(canvas, "pointerup", 100, 100);
    assert.equal(target(), null);
    tap(canvas, 100, 100);
    pointer(target(), "pointerdown", 100, 100);
    pointer(surface, "pointercancel", 100, 100, 2);
    assert.equal(locked, true);
    pointer(surface, "pointercancel", 100, 100);
    assert.equal(locked, false);
    assert.equal(capture, null);
    tap(canvas, 100, 100);
    render(true);
    assert.equal(locked, false, "Drawing/order gestures cancel inspection");
    tap(canvas, 100, 100);
    assert.equal(
      target(),
      null,
      "Tap inspection is disabled while drawing or editing orders",
    );
    render();
    tap(canvas, 100, 100);
    act(() =>
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
      ),
    );
    assert.equal(locked, false);
    tap(canvas, 100, 100);
    act(() => root.unmount());
    assert.equal(locked, false, "Unmount cannot leave chart navigation locked");
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
