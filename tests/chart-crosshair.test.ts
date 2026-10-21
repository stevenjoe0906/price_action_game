import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import ChartCrosshair from "../components/ChartCrosshair";
import ChartDrawings from "../components/ChartDrawings";
import { CHART_THEMES } from "../lib/theme";

test("price and bar guides survive every drawing tool, consumed events, editing, and future whitespace", () => {
  const dom = new JSDOM('<div id="app"><div id="surface"><div id="canvas"></div><div id="overlays"></div></div></div>');
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  Object.defineProperty(dom.window.SVGElement.prototype, "setPointerCapture", { value: () => {} });
  const doc = dom.window.document;
  const canvas = doc.getElementById("canvas") as HTMLDivElement;
  const surface = doc.getElementById("surface")!;
  canvas.getBoundingClientRect = () => ({ left: 40, top: 30 }) as DOMRect;
  let pane = { width: 600, height: 400 };
  const chart = {
    paneSize: () => pane,
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
    // Guides must not need data or future candles to label blank space.
    data: () => { throw new Error("Crosshair must not read candles"); },
  } as unknown as ISeriesApi<"Candlestick">;
  const root = createRoot(doc.getElementById("overlays")!);
  const render = (theme: "dark" | "light" = "dark", scale = 1, anchor = 10) => act(() => root.render(
    createElement("div", {},
      createElement(ChartDrawings, {
        chart, series, textScale: scale, onInteract: () => {},
      }),
      createElement(ChartCrosshair, { chart, series, canvas, anchor, theme, textScale: scale }),
    ),
  ));
  const pointer = (target: Element, type: string, x: number, y: number, pointerType = "mouse") => act(() => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x + 40, clientY: y + 30, button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: pointerType },
    });
    target.dispatchEvent(event);
  });
  const click = (name: string) => act(() => {
    const button = [...doc.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === name);
    assert.ok(button, name);
    button.click();
  });
  const guides = () => doc.querySelector(".chart-crosshair");
  const assertReadableLabels = () => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const selector of [".crosshair-price", ".crosshair-bar"]) {
      const label = doc.querySelector(selector)!;
      assert.ok(label.textContent?.trim(), selector + " contains a value");
      const style = dom.window.getComputedStyle(label);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      const contrast = (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05);
      assert.ok(contrast >= 4.5, selector + " must have readable text contrast");
    }
  };
  try {
    render();
    pointer(canvas, "pointermove", 200, 100);
    assert.equal(doc.querySelector(".crosshair-price")?.textContent, "90.0000");
    assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 11");
    assertReadableLabels();
    for (const name of ["Trendline", "Ray", "Horizontal line", "Vertical line", "Rectangle", "Price range / percentage ruler"]) {
      click(name);
      const overlay = doc.querySelector(".drawing-overlay")!;
      pointer(overlay, "pointermove", 300, 150);
      assert.ok(guides(), name + " keeps guides");
      assert.equal(doc.querySelector(".crosshair-price")?.textContent, "85.0000");
      assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 21");
    }
    const overlay = doc.querySelector(".drawing-overlay")!;
    overlay.getBoundingClientRect = () => ({ left: 40, top: 30 }) as DOMRect;
    click("Trendline");
    pointer(overlay, "pointerdown", 100, 100);
    pointer(overlay, "pointermove", 200, 50);
    assert.ok(guides(), "Drag placement keeps guides");
    pointer(overlay, "pointerup", 200, 50);
    const shape = doc.querySelector(".drawing-shape")!;
    pointer(shape, "pointerdown", 150, 75);
    pointer(overlay, "pointermove", 250, 60);
    assert.equal(doc.querySelector(".crosshair-price")?.textContent, "94.0000");
    pointer(overlay, "pointerup", 250, 60);
    // A child stopping bubbling cannot hide movement from the capture listener.
    overlay.addEventListener("pointermove", event => event.stopPropagation());
    pointer(overlay, "pointermove", 590, 200);
    assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 50");
    assert.equal(guides()?.querySelector("path")?.getAttribute("d"), "M0 200H600 M590 0V400");
    render("light", 1.5, 20);
    assert.equal(doc.querySelector(".crosshair-bar")?.textContent, "Bar 40");
    assert.equal(guides()?.querySelector("path")?.getAttribute("stroke"), CHART_THEMES.light.crosshair);
    assert.equal((doc.querySelector(".crosshair-price") as HTMLElement).style.fontSize, "21px");
    assertReadableLabels();
    render("dark");
    assertReadableLabels();
    pane = { width: 400, height: 200 };
    render();
    assert.equal(guides(), null, "Resize hides an out-of-pane pointer");
    pointer(overlay, "pointermove", 300, 100);
    assert.ok(guides());
    pointer(overlay, "pointermove", 401, 100);
    assert.equal(guides(), null, "Price axis is outside the plot");
    pointer(overlay, "pointermove", 100, 201);
    assert.equal(guides(), null, "Time axis is outside the plot");
    pointer(doc.querySelector(".drawing-toolbar")!, "pointermove", 100, 100);
    assert.equal(guides(), null, "Toolbar does not retain stale guides");
    pointer(canvas, "pointermove", 100, 100, "touch");
    assert.equal(guides(), null, "Touch navigation has no persistent mouse guides");
    pointer(canvas, "pointermove", 100, 100);
    act(() => surface.dispatchEvent(new dom.window.Event("pointerleave")));
    assert.equal(guides(), null);
    pointer(canvas, "pointermove", 100, 100);
    act(() => dom.window.dispatchEvent(new dom.window.Event("blur")));
    assert.equal(guides(), null);
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
