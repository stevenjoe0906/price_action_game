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
  let captured: number | null = null;
  Object.defineProperties(dom.window.SVGElement.prototype, {
    setPointerCapture: {
      value: (id: number) => {
        captured = id;
      },
    },
    hasPointerCapture: { value: (id: number) => captured === id },
    releasePointerCapture: {
      value: () => {
        captured = null;
      },
    },
  });
  const host = dom.window.document.getElementById("app")!;
  const root = createRoot(host);
  let pauses = 0;
  const docBody = () => dom.window.document.body;
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
  const pointer = (
    target: Element,
    type: string,
    x: number,
    y: number,
    pointerId = 1,
  ) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: "touch" },
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
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
    const endpoint = (name: string) =>
      host.querySelector(`.drawing-handle[data-handle="${name}"]`)!;
    assert.ok(
      +endpoint("from").getAttribute("r")! >= 22,
      "Endpoint grab area is at least 44px wide",
    );
    assert.ok(
      pointer(endpoint("from"), "pointerdown", 112, 104).defaultPrevented,
    );
    assert.equal(captured, 1);
    assert.equal(docBody().style.overflow, "hidden");
    assert.equal(
      host.style.touchAction,
      "none",
      "HTML chart ancestor blocks native touch scrolling",
    );
    pointer(svg, "pointermove", 142, 124);
    line = host.querySelector(".drawing-shape line")!;
    assert.equal(
      line.getAttribute("x1"),
      "130",
      "Start endpoint retains the finger grab offset",
    );
    assert.equal(line.getAttribute("y1"), "120");
    assert.equal(
      line.getAttribute("x2"),
      "200",
      "Resizing never moves the opposite endpoint",
    );
    const touchMove = new dom.window.Event("touchmove", { cancelable: true });
    dom.window.dispatchEvent(touchMove);
    assert.ok(
      touchMove.defaultPrevented,
      "Page scrolling is prevented during a drag",
    );
    pointer(svg, "pointerup", 152, 134);
    assert.equal(
      line.getAttribute("x1"),
      "140",
      "Release coordinates commit even without a final move event",
    );
    assert.equal(captured, null);
    assert.equal(docBody().style.overflow, "");
    click("Undo drawing");
    pointer(host.querySelector(".drawing-shape")!, "pointerdown", 150, 75);
    pointer(svg, "pointerup", 150, 75);
    pointer(endpoint("to"), "pointerdown", 205, 55);
    pointer(svg, "pointermove", 265, 95);
    line = host.querySelector(".drawing-shape line")!;
    assert.equal(line.getAttribute("x2"), "260");
    assert.equal(line.getAttribute("y2"), "90");
    assert.equal(line.getAttribute("x1"), "100");
    pointer(svg, "pointercancel", 265, 95, 2);
    assert.equal(
      docBody().style.overflow,
      "hidden",
      "A second pointer cannot cancel the active drag",
    );
    pointer(svg, "pointercancel", 265, 95);
    assert.equal(
      line.getAttribute("x2"),
      "200",
      "Cancellation restores the endpoint",
    );
    assert.equal(docBody().style.overflow, "");
    pointer(endpoint("to"), "pointerdown", 205, 55);
    pointer(svg, "pointermove", 230, 80);
    pointer(svg, "lostpointercapture", 230, 80);
    assert.equal(
      line.getAttribute("x2"),
      "200",
      "Losing pointer capture cancels the preview",
    );
    assert.equal(docBody().style.overflow, "");
    pointer(endpoint("to"), "pointerdown", 205, 55);
    pointer(svg, "pointermove", 255, 85);
    pointer(svg, "pointerup", 255, 85);
    assert.equal(line.getAttribute("x2"), "250");
    assert.equal(line.getAttribute("y2"), "80");
    click("Undo drawing");
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
    click("Trendline");
    pointer(svg, "pointerdown", 300, 200);
    pointer(svg, "pointermove", 320, 200);
    pointer(svg, "pointerup", 320, 200);
    // Both enlarged targets cover this point; the nearest endpoint must win.
    pointer(endpoint("to"), "pointerdown", 302, 200);
    pointer(svg, "pointermove", 302, 220);
    pointer(svg, "pointerup", 302, 220);
    const shortLine = host.querySelector(".drawing-shape.selected line")!;
    for (const [axis, value] of Object.entries({
      x1: 300,
      y1: 220,
      x2: 320,
      y2: 200,
    })) {
      assert.ok(Math.abs(Number(shortLine.getAttribute(axis)) - value) < 1e-7);
    }
    click("Trendline");
    pointer(svg, "pointerdown", 50, 50);
    assert.equal(docBody().style.overflow, "hidden");
    act(() => root.unmount());
    assert.equal(
      docBody().style.overflow,
      "",
      "Unmount restores page scrolling",
    );
    assert.equal(host.style.touchAction, "");
    const afterUnmount = new dom.window.Event("touchmove", {
      cancelable: true,
    });
    dom.window.dispatchEvent(afterUnmount);
    assert.equal(
      afterUnmount.defaultPrevented,
      false,
      "Touch listener is removed",
    );
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
