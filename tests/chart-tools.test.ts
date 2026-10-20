import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import ChartDrawings from "../components/ChartDrawings";

test("drawing toolbar places, previews, edits, hides, deletes, undoes, and measures through DOM pointer events", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    { url: "http://localhost" },
  );
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(values)) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  Object.defineProperty(dom.window.SVGElement.prototype, "setPointerCapture", {
    value: () => {},
  });
  const host = dom.window.document.getElementById("app")!;
  const root = createRoot(host);
  let pauses = 0;
  const chart = {
    paneSize: () => ({ width: 600, height: 400 }),
    applyOptions: () => {},
    timeScale: () => ({
      coordinateToLogical: (x: number) => x / 10,
      logicalToCoordinate: (x: number) => x * 10,
      setVisibleLogicalRange: () => {},
    }),
  } as unknown as IChartApi;
  const series = {
    coordinateToPrice: (y: number) => 100 - y / 10,
    priceToCoordinate: (p: number) => (100 - p) * 10,
    priceScale: () => ({ applyOptions: () => {} }),
    data: () => [],
  } as unknown as ISeriesApi<"Candlestick">;
  const button = (name: string) => {
    const b = [...host.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name,
    );
    assert.ok(b, `Button ${name} exists`);
    return b;
  };
  const click = (name: string) => act(() => button(name).click());
  const pointer = (target: Element, type: string, x: number, y: number) =>
    act(() => {
      const event = new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      target.dispatchEvent(event);
    });
  const key = (value: string) =>
    act(() =>
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: value,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  try {
    act(() =>
      root.render(
        createElement(ChartDrawings, {
          chart,
          series,
          textScale: 1,
          onInteract: () => {
            pauses++;
          },
          expanded: false,
          onExpand: () => {},
        }),
      ),
    );
    const svg = host.querySelector("svg.drawing-overlay")!;
    click("Trendline");
    pointer(svg, "pointerdown", 100, 100);
    pointer(svg, "pointermove", 200, 50);
    let line = host.querySelector(".drawing-shape line")!;
    assert.equal(
      line.getAttribute("x2"),
      "200",
      "Line follows pointer before release",
    );
    pointer(svg, "pointerup", 200, 50);
    assert.equal(host.querySelectorAll(".drawing-shape").length, 1);
    assert.equal(host.querySelectorAll(".drawing-handle").length, 2);
    pointer(host.querySelector(".drawing-shape")!, "pointerdown", 150, 75);
    pointer(svg, "pointermove", 200, 50);
    pointer(svg, "pointerup", 200, 50);
    line = host.querySelector(".drawing-shape line")!;
    assert.equal(line.getAttribute("x1"), "150");
    assert.equal(line.getAttribute("y1"), "75");
    click("Undo drawing");
    assert.equal(
      host.querySelector(".drawing-shape line")!.getAttribute("x1"),
      "100",
    );
    click("Redo drawing");
    assert.equal(
      host.querySelector(".drawing-shape line")!.getAttribute("x1"),
      "150",
    );
    click("Hide drawings");
    assert.equal(host.querySelectorAll(".drawing-shape").length, 0);
    click("Show drawings");
    assert.equal(host.querySelectorAll(".drawing-shape").length, 1);
    click("Price range / percentage ruler");
    pointer(svg, "pointerdown", 100, 100);
    pointer(svg, "pointerup", 100, 100);
    pointer(svg, "pointermove", 300, 200);
    assert.match(
      host.querySelector(".drawing-shape:last-child text")!.textContent!,
      /-11\.11%.*20 bars/,
    );
    pointer(svg, "pointerdown", 300, 200);
    pointer(svg, "pointerup", 300, 200);
    assert.equal(host.querySelectorAll(".drawing-shape").length, 2);
    click("Delete selected drawing");
    assert.equal(host.querySelectorAll(".drawing-shape").length, 1);
    click("Undo drawing");
    assert.equal(host.querySelectorAll(".drawing-shape").length, 2);
    click("Rectangle");
    pointer(svg, "pointerdown", 50, 50);
    pointer(svg, "pointermove", 100, 100);
    assert.equal(host.querySelectorAll(".drawing-shape").length, 3);
    key("Escape");
    assert.equal(
      host.querySelectorAll(".drawing-shape").length,
      2,
      "Escape discards an unfinished drawing",
    );
    assert.ok(pauses >= 4, "Drawing interactions pause replay");
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
