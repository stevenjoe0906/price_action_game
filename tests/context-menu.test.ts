import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ChartOrderMenu from "../components/ChartOrderMenu";

test("chart menu offers three contextual actions, stays in bounds, supports keyboard selection, and only prepares a ticket", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    { url: "http://localhost" },
  );
  const old = new Map<string, PropertyDescriptor | undefined>();
  const values = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(values)) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  for (const [key, value] of Object.entries({
    clientWidth: 600,
    clientHeight: 400,
    offsetWidth: 320,
    offsetHeight: 180,
  }))
    Object.defineProperty(dom.window.HTMLElement.prototype, key, {
      configurable: true,
      get: () => value,
    });
  const doc = dom.window.document,
    host = doc.getElementById("app")!,
    root = createRoot(host);
  const prepared: unknown[][] = [];
  let closed = 0;
  const render = (key: string, price: number) =>
    act(() =>
      root.render(
        createElement(
          "div",
          { className: "chart-surface" },
          createElement(ChartOrderMenu, {
            key,
            x: 590,
            y: 390,
            price,
            last: 100,
            onChoose: (...choice) => prepared.push(choice),
            onClose: () => {
              closed++;
            },
          }),
        ),
      ),
    );
  try {
    render("above", 101.123456);
    const menu = doc.querySelector('[role="menu"]') as HTMLElement;
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    assert.equal(items.length, 3);
    assert.equal(menu.style.left, "272px");
    assert.equal(menu.style.top, "212px");
    assert.match(items[0].textContent!, /Sell.*limit/);
    assert.match(items[1].textContent!, /Buy.*stop/);
    assert.match(items[2].textContent!, /Buy.*stop,.*limit/);
    assert.equal(prepared.length, 0);
    assert.equal(doc.activeElement, items[0]);
    act(() =>
      items[0].dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(doc.activeElement, items[1]);
    act(() => items[2].click());
    assert.deepEqual(prepared, [["long", "stop-limit", 101.123456]]);
    assert.equal(closed, 1);
    render("below", 99);
    const below = doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    assert.match(below[0].textContent!, /Buy.*limit/);
    assert.match(below[1].textContent!, /Sell.*stop/);
    act(() =>
      below[0].dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.equal(closed, 2);
    assert.equal(prepared.length, 1);
    act(() =>
      doc.body.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true }),
      ),
    );
    assert.equal(closed, 3);
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
