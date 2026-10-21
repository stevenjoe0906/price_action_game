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
    assert.equal(doc.querySelector(".game-heading"), null);
    assert.ok(
      !doc.body.textContent!.includes("YOUR EDGE STARTS WITH PRACTICE"),
    );
    assert.ok(!doc.body.textContent!.includes("Make your move."));
    assert.ok(!doc.body.textContent!.includes("BTC"));
    assert.ok(!doc.body.textContent!.includes("Bitcoin"));
    assert.ok(!doc.body.textContent!.includes("₿"));
    const workspace = doc.querySelector(".workspace")!;
    assert.equal(workspace.children.length, 2);
    assert.ok(workspace.children[0].matches(".left-panel"));
    assert.ok(workspace.children[0].querySelector(".chart-panel"));
    const panes = workspace.children[0].children;
    assert.ok(panes[0].matches(".chart-panel"));
    assert.ok(
      panes[1].matches('[role="separator"][aria-orientation="horizontal"]'),
    );
    assert.ok(panes[2].matches(".activity-panel"));
    assert.ok(
      workspace.children[0].querySelector(".activity-panel .activity-content"),
    );
    assert.ok(
      workspace.children[1].matches('aside[aria-label="Order manager"]'),
    );
    assert.equal(workspace.children[1].querySelector(".activity-panel"), null);
    assert.equal(doc.querySelector("footer"), null);
    assert.equal(doc.querySelector(".chart-footer"), null);
    assert.ok(doc.querySelector('button[aria-label="Chart help"]'));
    assert.ok(doc.querySelector("aside .turn-status .finish-button"));
    assert.equal(doc.querySelector(".replay-toolbar .finish-button"), null);
    const playback = doc.querySelector(".playback-buttons")!;
    assert.deepEqual(
      [...playback.children].map(
        (node) => node.getAttribute("aria-label") || node.textContent?.trim(),
      ),
      ["Play replay", "Next→", "Replay speed", "Repick", "Chart help"],
    );
    assert.equal(doc.querySelector(".pane-switch"), null);
    assert.equal(doc.querySelector('[role="progressbar"]'), null);
    assert.deepEqual(
      [...doc.querySelectorAll(".metrics-strip .metric > span")].map(
        (node) => node.textContent,
      ),
      ["Progress", "Balance", "PnL", "uPnL", "Win rate", "Trades", "Fees"],
    );
    assert.ok(doc.querySelector(".repick.next-button"));
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
