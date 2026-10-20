import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import ChartLineControls from "../components/ChartLineControls";
import { createLineDrag, type LinePreview } from "../lib/line-drag";
import type { ChartLine } from "../lib/chart-lines";

test("position labels follow every drag preview and restore on cancellation without changing the other exit", () => {
  const dom = new JSDOM('<div id="app"></div>');
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const native = new Map([
    ["position-sl", 98],
    ["position-tp", 104],
  ]);
  const commits: LinePreview[] = [];
  function Harness() {
    const [preview, setPreview] = useState<LinePreview | null>(null);
    const [lines, setLines] = useState<ChartLine[]>([
      {
        id: "position-sl",
        price: 98,
        title: "POSITION SL",
        color: "red",
        cancelLabel: "Cancel SL",
      },
      {
        id: "position-tp",
        price: 104,
        title: "POSITION TP",
        color: "green",
        cancelLabel: "Cancel TP",
      },
    ]);
    const [drag] = useState(() =>
      createLineDrag({
        toPrice: (y) => 200 - y,
        preview: (p) => {
          native.set(p.id, p.price);
          setPreview(p);
        },
        commit: (p) => {
          commits.push(p);
          setLines((all) =>
            all.map((line) =>
              line.id === p.id ? { ...line, price: p.price } : line,
            ),
          );
        },
        start: () => {},
        finish: () => setPreview(null),
      }),
    );
    return createElement(
      "div",
      {
        onPointerMove: (e: { clientY: number }) => drag.move(e.clientY),
        onPointerUp: () => drag.end(),
        onKeyDown: () => drag.end(true),
      },
      ...lines.map((line) =>
        createElement(
          "div",
          { key: line.id },
          createElement(
            "button",
            {
              "data-drag": line.id,
              onPointerDown: (e: { clientY: number }) =>
                drag.begin(line.id, line.price, e.clientY, 200 - line.price),
            },
            "Drag",
          ),
          createElement(ChartLineControls, {
            line,
            preview,
            toCoordinate: (p) => 200 - p,
            paneHeight: 300,
            axisWidth: 80,
            onCancel: () => {},
            onAdd: () => {},
          }),
        ),
      ),
    );
  }
  const root = createRoot(dom.window.document.getElementById("app")!);
  const doc = dom.window.document;
  const label = (kind: string) =>
    doc.querySelector<HTMLElement>(
      `[role="group"][aria-label="POSITION ${kind}"]`,
    )!;
  const pointer = (id: string, type: string, y: number) =>
    act(() =>
      doc
        .querySelector(`[data-drag="${id}"]`)!
        .dispatchEvent(
          new dom.window.MouseEvent(type, {
            clientY: y,
            button: 0,
            bubbles: true,
          }),
        ),
    );
  try {
    act(() => root.render(createElement(Harness)));
    pointer("position-sl", "pointerdown", 102);
    pointer("position-sl", "pointermove", 112);
    assert.equal(label("SL").style.top, "112px");
    assert.equal(native.get("position-sl"), 88);
    assert.equal(label("TP").style.top, "96px");
    assert.equal(commits.length, 0);
    pointer("position-sl", "pointermove", 114);
    assert.equal(label("SL").style.top, "114px");
    pointer("position-sl", "pointerup", 114);
    assert.equal(label("SL").style.top, "114px");
    assert.deepEqual(commits, [{ id: "position-sl", price: 86 }]);
    pointer("position-tp", "pointerdown", 96);
    pointer("position-tp", "pointermove", 86);
    assert.equal(label("TP").style.top, "86px");
    act(() =>
      doc
        .querySelector('[data-drag="position-tp"]')!
        .dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
          }),
        ),
    );
    assert.equal(label("TP").style.top, "96px");
    assert.equal(native.get("position-tp"), 104);
    assert.equal(commits.length, 1);
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
