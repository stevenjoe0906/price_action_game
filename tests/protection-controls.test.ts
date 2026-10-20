import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import PositionProtection from "../components/PositionProtection";
import ChartLineControls from "../components/ChartLineControls";
import { workingChartLines } from "../lib/chart-lines";
import {
  createGame,
  submitOrder,
  modifyProtection,
  restoreProtection,
  advance,
  type Game,
} from "../lib/engine";
import { CHART_THEMES } from "../lib/theme";

test("long and short positions can cancel and restore exits from chart/sidebar controls and correct invalid prices", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" });
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
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("app")!);
  let latest: Game;
  function Harness({ side }: { side: "long" | "short" }) {
    const [game, setGame] = useState(() =>
      submitOrder(createGame(100, 1), {
        side,
        type: "market",
        entry: 100,
        sl: side === "long" ? 95 : 105,
        tp: side === "long" ? 110 : 90,
        leverage: 10,
        risk: 1,
      }),
    );
    latest = game;
    const [sl, setSL] = useState(String(game.position!.sl));
    const [tp, setTP] = useState(String(game.position!.tp));
    const commit = (next: Game) => {
      setGame(next);
      setSL(next.position!.sl === null ? "" : String(next.position!.sl));
      setTP(next.position!.tp === null ? "" : String(next.position!.tp));
    };
    const add = (kind: "sl" | "tp") => commit(restoreProtection(game, kind));
    const cancel = (kind: "sl" | "tp") =>
      commit(
        modifyProtection(
          game,
          kind === "sl" ? null : game.position!.sl,
          kind === "tp" ? null : game.position!.tp,
        ),
      );
    return createElement(
      "div",
      {},
      createElement(PositionProtection, {
        position: game.position!,
        last: game.last,
        sl,
        tp,
        disabled: false,
        onSL: setSL,
        onTP: setTP,
        onAdd: add,
        onCancel: cancel,
        onApply: (s, t) => commit(modifyProtection(game, s, t)),
      }),
      ...workingChartLines(game, CHART_THEMES.dark)
        .filter((line) => line.cancelLabel || line.addProtection?.length)
        .map((line) =>
          createElement(ChartLineControls, {
            key: line.id,
            line,
            style: { top: 100, right: 90 },
            onAdd: add,
            onCancel: () => cancel(line.id === "position-sl" ? "sl" : "tp"),
          }),
        ),
    );
  }
  const doc = dom.window.document;
  const click = (text: string) => {
    const button = [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text,
    )!;
    assert.ok(button, `Missing ${text} button`);
    act(() => button.click());
  };
  const clickLabel = (label: string) =>
    act(() => {
      const button = doc.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )!;
      assert.ok(button, `Missing ${label} button`);
      button.click();
    });
  const type = (kind: string, value: string) =>
    act(() => {
      const input = doc.querySelector<HTMLInputElement>(
        `input[aria-label="Position ${kind}"]`,
      )!;
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  try {
    for (const side of ["long", "short"] as const) {
      act(() => root.render(createElement(Harness, { key: side, side })));
      const initialQty = latest!.position!.qty;
      const group = doc.querySelector(
        '.chart-line-controls[aria-label^="POSITION TP"]',
      )!;
      assert.equal(group.children[0].className, "chart-control-label");
      assert.equal(group.children[1].tagName, "BUTTON");
      assert.equal(group.children[0].querySelector("button"), null);
      click("Cancel SL");
      clickLabel("Cancel position take profit");
      assert.equal(latest!.position!.sl, null);
      assert.equal(latest!.position!.tp, null);
      clickLabel("Add position stop loss");
      assert.ok(
        side === "long"
          ? latest!.position!.sl! < 100
          : latest!.position!.sl! > 100,
      );
      click("Add TP");
      assert.ok(
        side === "long"
          ? latest!.position!.tp! > 100
          : latest!.position!.tp! < 100,
      );
      assert.equal(latest!.position!.qty, initialQty);
      assert.equal(
        doc.querySelector('[aria-label="Add position stop loss"]'),
        null,
      );
      click("Cancel SL");
      click("Cancel TP");
      type("SL", side === "long" ? "105" : "95");
      type("TP", side === "long" ? "95" : "105");
      assert.equal(doc.querySelectorAll('[role="alert"]').length, 2);
      assert.equal(
        [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
          (b) => b.textContent === "Update protection",
        )!.disabled,
        true,
      );
      type("SL", side === "long" ? "95" : "105");
      type("TP", side === "long" ? "110" : "90");
      assert.equal(doc.querySelectorAll('[role="alert"]').length, 0);
      click("Update protection");
      assert.equal(latest!.position!.sl, side === "long" ? 95 : 105);
      assert.equal(latest!.position!.tp, side === "long" ? 110 : 90);
      type("SL", "");
      click("Update protection");
      assert.equal(latest!.position!.sl, null);
      assert.equal(latest!.position!.tp, side === "long" ? 110 : 90);
    }
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("restored exits use the latest market price, preserve the other exit, and never submit a new entry", () => {
  for (const side of ["long", "short"] as const) {
    let g = submitOrder(createGame(100, 1), {
      side,
      type: "market",
      entry: 100,
      sl: side === "long" ? 95 : 105,
      tp: null,
      risk: 1,
      leverage: 10,
    });
    g = modifyProtection(g, null, null);
    g = advance(g, {
      time: 2,
      open: 100,
      high: 103,
      low: 97,
      close: side === "long" ? 102 : 98,
    });
    const snapshot = structuredClone(g);
    const sl = restoreProtection(g, "sl");
    assert.equal(sl.position!.sl, g.last * (side === "long" ? 0.995 : 1.005));
    const tp = restoreProtection(sl, "tp");
    assert.equal(tp.position!.sl, sl.position!.sl);
    assert.equal(tp.position!.tp, g.last * (side === "long" ? 1.01 : 0.99));
    assert.deepEqual(restoreProtection(tp, "tp"), tp);
    assert.equal(tp.position!.qty, g.position!.qty);
    assert.equal(tp.fills.length, g.fills.length);
    assert.deepEqual(g, snapshot);
  }
});
