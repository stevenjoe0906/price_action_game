import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import TradingGame from "../components/TradingGame";

test("turn progress belongs to statistics and chart/activity share the left workspace column", () => {
  const dom = new JSDOM(renderToStaticMarkup(createElement(TradingGame)));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll(".game-progress").length, 1);
    assert.ok(doc.querySelector(".metrics-strip .game-progress"));
    assert.equal(doc.querySelector("header .game-progress"), null);
    const workspace = doc.querySelector(".workspace")!;
    assert.equal(workspace.children.length, 2);
    assert.ok(workspace.children[0].matches(".left-panel"));
    assert.ok(workspace.children[0].querySelector(".chart-panel"));
    assert.ok(
      workspace.children[0].querySelector(".activity-panel .activity-content"),
    );
    assert.ok(
      workspace.children[1].matches('aside[aria-label="Order manager"]'),
    );
    assert.equal(workspace.children[1].querySelector(".activity-panel"), null);
    assert.equal(doc.querySelector("footer"), null);
    assert.ok(
      doc.querySelector('.chart-footer a[href="https://www.tradingview.com/"]'),
    );
    assert.equal(
      doc.querySelector('[role="progressbar"]')!.getAttribute("aria-valuemax"),
      "20",
    );
  } finally {
    dom.window.close();
  }
});
test("execution information is read-only in Settings and absent from the normal workspace", () => {
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
    localStorage: dom.window.localStorage,
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
  const root = createRoot(dom.window.document.getElementById("app")!);
  const doc = dom.window.document;
  const text = "Simulated execution · 0.01% market slippage · No funding";
  try {
    act(() => root.render(createElement(TradingGame)));
    assert.ok(!doc.body.textContent!.includes(text));
    act(() =>
      (
        doc.querySelector('button[aria-label="Settings"]') as HTMLButtonElement
      ).click(),
    );
    const dialog = doc.querySelector('[role="dialog"]')!;
    const note = dialog.querySelector(".settings-execution")!;
    assert.ok(note.textContent!.includes(text));
    assert.equal(note.querySelector("input, select, textarea, button"), null);
    act(() =>
      (
        dialog.querySelector(
          'button[aria-label="Close dialog"]',
        ) as HTMLButtonElement
      ).click(),
    );
    assert.equal(doc.querySelector('[role="dialog"]'), null);
    assert.ok(!doc.body.textContent!.includes(text));
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
