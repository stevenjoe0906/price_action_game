import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ResizableChartPanels from "../components/ResizableChartPanels";

test("panel divider drags, clamps both panes, cancels, resets, and supports keyboard resizing", () => {
  const dom = new JSDOM('<div id="app"></div>');
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    const render = (expanded = false) =>
      act(() =>
        root.render(
          createElement(ResizableChartPanels, {
            expanded,
            children: [
              createElement("section", { key: "chart" }, "Chart"),
              createElement("section", { key: "activity" }, "Orders"),
            ],
          }),
        ),
      );
    render();
    const doc = dom.window.document;
    const panel = doc.querySelector<HTMLElement>(".left-panel")!;
    const divider = doc.querySelector<HTMLElement>('[role="separator"]')!;
    let height = 800;
    Object.defineProperty(panel, "clientHeight", { get: () => height });
    Object.defineProperty(divider, "offsetHeight", { get: () => 12 });
    Object.defineProperty(panel.firstElementChild, "offsetHeight", {
      get: () => {
        const match = panel.style.gridTemplateRows.match(
          /minmax\(0, ([\d.]+)fr\)/,
        );
        return match ? +match[1] * (height - 12) : 600;
      },
    });
    const pointer = (target: EventTarget, type: string, y = 0) =>
      act(() =>
        target.dispatchEvent(
          new dom.window.MouseEvent(type, {
            clientY: y,
            button: 0,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    const key = (name: string, shiftKey = false) =>
      act(() =>
        divider.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: name,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    const chartHeight = () =>
      (panel.firstElementChild as HTMLElement).offsetHeight;
    pointer(divider, "pointerdown", 600);
    pointer(dom.window, "pointermove", 500);
    assert.ok(Math.abs(chartHeight() - 500) < 0.001);
    assert.equal(doc.body.style.userSelect, "none");
    pointer(dom.window, "pointerup");
    assert.equal(doc.body.style.userSelect, "");
    key("ArrowDown");
    assert.ok(Math.abs(chartHeight() - 510) < 0.001);
    key("ArrowUp", true);
    assert.ok(Math.abs(chartHeight() - 460) < 0.001);
    pointer(divider, "pointerdown", 460);
    pointer(dom.window, "pointermove", -10000);
    assert.ok(Math.abs(chartHeight() - 320) < 0.001);
    key("Escape");
    assert.ok(Math.abs(chartHeight() - 460) < 0.001);
    pointer(divider, "pointerdown", 460);
    pointer(dom.window, "pointermove", 10000);
    assert.ok(Math.abs(chartHeight() - (height - 12 - 112)) < 0.001);
    pointer(dom.window, "pointerup");
    act(() =>
      divider.dispatchEvent(
        new dom.window.MouseEvent("dblclick", { bubbles: true }),
      ),
    );
    assert.equal(panel.style.gridTemplateRows, "");
    key("Home");
    assert.ok(Math.abs(chartHeight() - 320) < 0.001);
    key("End");
    assert.ok(Math.abs(chartHeight() - 676) < 0.001);
    key("Enter");
    assert.equal(panel.style.gridTemplateRows, "");
    height = 300;
    key("Home");
    assert.ok(chartHeight() > 0 && chartHeight() < height - 12);
    const split = panel.style.gridTemplateRows;
    render(true);
    assert.equal(divider.tabIndex, -1);
    key("ArrowUp");
    assert.equal(panel.style.gridTemplateRows, split);
    render(false);
    assert.equal(divider.tabIndex, 0);
    pointer(divider, "pointerdown", 200);
    pointer(dom.window, "pointermove", 220);
    act(() => root.unmount());
    assert.equal(doc.body.style.cursor, "");
    assert.equal(doc.body.style.userSelect, "");
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
