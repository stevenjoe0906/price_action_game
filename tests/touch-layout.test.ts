import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import TradingGame from "../components/TradingGame";

for (const touchPoints of [0, 5]) {
  test(`chart/activity switching and help preserve panes; touch points: ${touchPoints}`, () => {
    const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" });
    const old = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Element: dom.window.Element,
      Node: dom.window.Node,
      localStorage: dom.window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    }
    Object.defineProperty(dom.window.navigator, "maxTouchPoints", {
      value: touchPoints,
    });
    let coarse = false;
    const listeners = new Set<() => void>();
    dom.window.matchMedia = ((query: string) => {
      assert.equal(
        query,
        "(any-pointer: coarse)",
        "Layout is capability-based, not a width breakpoint",
      );
      return {
        get matches() {
          return coarse;
        },
        addEventListener: (_type: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          listeners.delete(listener),
      };
    }) as unknown as typeof dom.window.matchMedia;
    const doc = dom.window.document;
    const root = createRoot(doc.getElementById("app")!);
    const click = (selector: string) =>
      act(() => {
        const button = doc.querySelector<HTMLButtonElement>(selector);
        assert.ok(button, selector);
        button.click();
      });
    try {
      act(() => root.render(createElement(TradingGame)));
      const left = doc.querySelector(".left-panel")!;
      const chart = doc.querySelector(".chart-panel")!;
      const activity = doc.querySelector(".activity-panel")!;
      const divider = doc.querySelector<HTMLElement>(".panel-divider")!;
      if (touchPoints) {
        assert.ok(
          left.classList.contains("touch-chart"),
          "Touch opens on the chart",
        );
        assert.equal(divider.hidden, true);
        assert.equal(divider.tabIndex, -1);
        click('[aria-label="Show orders and activity"]');
        assert.ok(left.classList.contains("touch-activity"));
        assert.equal(
          doc.querySelector(".pane-switch")?.getAttribute("aria-pressed"),
          "true",
        );
        click('[aria-label="Show chart"]');
        assert.ok(left.classList.contains("touch-chart"));
      } else {
        assert.equal(doc.querySelector(".pane-switch"), null);
        assert.equal(divider.hidden, false);
        // Narrowing a mouse-only window must not opt into the touch layout.
        Object.defineProperty(dom.window, "innerWidth", {
          value: 600,
          configurable: true,
        });
        act(() => dom.window.dispatchEvent(new dom.window.Event("resize")));
        assert.equal(doc.querySelector(".pane-switch"), null);
        act(() => {
          coarse = true;
          listeners.forEach((listener) => listener());
        });
        assert.ok(left.classList.contains("touch-chart"));
        click('[aria-label="Show orders and activity"]');
        act(() => {
          coarse = false;
          listeners.forEach((listener) => listener());
        });
        assert.equal(doc.querySelector(".pane-switch"), null);
        assert.equal(left.classList.contains("is-touch"), false);
        assert.equal(divider.hidden, false);
      }
      assert.equal(
        doc.querySelector(".chart-panel"),
        chart,
        "Chart is never remounted",
      );
      assert.equal(
        doc.querySelector(".activity-panel"),
        activity,
        "Activity keeps its DOM state",
      );
      const help = doc.querySelector<HTMLButtonElement>(
        '[aria-label="Chart help"]',
      )!;
      act(() => {
        help.focus();
        help.click();
      });
      const dialog = doc.querySelector<HTMLElement>('[role="dialog"]')!;
      assert.ok(dialog.contains(doc.activeElement));
      assert.match(dialog.textContent!, /Space.*plays or pauses/);
      assert.match(dialog.textContent!, /last displayed candle/);
      assert.ok(dialog.querySelector('a[href="https://www.tradingview.com/"]'));
      act(() =>
        dom.window.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
        ),
      );
      assert.equal(doc.querySelector('[role="dialog"]'), null);
      assert.equal(doc.activeElement, help, "Closing help restores focus");
      assert.equal(doc.querySelector(".chart-footer"), null);
      assert.ok(doc.querySelector(".turn-status .finish-button"));
      act(() => root.unmount());
      assert.equal(
        listeners.size,
        0,
        "Touch capability listener is cleaned up",
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
}
