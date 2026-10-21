import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import TradingGame from "../components/TradingGame";
import type { Summary } from "../lib/storage";

test("restart requires confirmation, retains trade history and rejects storage/data failures", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://game.test" });
  const doc = dom.window.document;
  const old = new Map<string, PropertyDescriptor | undefined>();
  let failData = false;
  const fakeFetch = async (input: string | URL | Request) => {
    if (String(input) === "/data/index.json")
      return new Response("", { status: 404 });
    if (failData) return new Response("", { status: 500 });
    return Response.json(
      Array.from({ length: 600 }, (_, i) => [
        Date.UTC(2024, 0, 1) + i * 300000,
        "100",
        "100.2",
        "99.8",
        "100",
        "0",
        Date.UTC(2024, 0, 1) + (i + 1) * 300000 - 1,
      ]),
    );
  };
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: doc,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    localStorage: dom.window.localStorage,
    fetch: fakeFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  const root = createRoot(doc.getElementById("root")!);
  const button = (text: string) => {
    const found = [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === text,
    );
    assert.ok(found, `Button: ${text}`);
    return found;
  };
  const click = async (text: string) =>
    act(async () => {
      button(text).click();
    });
  const stored = () =>
    JSON.parse(localStorage.getItem("pa-summaries") ?? "[]") as Summary[];
  try {
    await act(async () => root.render(createElement(TradingGame)));
    await act(async () =>
      doc.querySelector<HTMLButtonElement>(".inline-settings")!.click(),
    );
    assert.equal(
      doc.querySelector("[role=dialog] h2")?.textContent,
      "Your practice, your rules.",
    );
    await act(async () =>
      doc
        .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
        .click(),
    );
    await click("Start a new game");
    await click("Start trading");
    const risk = doc.querySelector(".risk-box")!;
    assert.ok(risk.textContent?.includes("Est. TP/SL ratio"));
    assert.ok(risk.textContent?.includes("2:1"));
    await click("Market");
    await click("Open long position");
    assert.ok(doc.querySelector(".position-pnl"));
    await click("Restart game");
    assert.equal(stored().length, 0);
    await click("Keep playing");
    assert.ok(doc.querySelector(".position-pnl"));
    await click("Restart game");
    const originalSet = dom.window.Storage.prototype.setItem;
    dom.window.Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    await click("Save record & restart");
    assert.ok(
      doc.querySelector(".position-pnl"),
      "Storage failure preserves open position",
    );
    assert.ok(
      doc
        .querySelector('[role="alert"]')
        ?.textContent?.includes("Restart canceled"),
    );
    dom.window.Storage.prototype.setItem = originalSet;
    failData = true;
    await click("Restart game");
    await click("Save record & restart");
    assert.ok(
      doc.querySelector(".position-pnl"),
      "Data failure preserves open position",
    );
    assert.equal(stored().length, 0);
    failData = false;
    await click("Restart game");
    await click("Save record & restart");
    assert.equal(doc.querySelector(".position-pnl"), null);
    assert.ok(
      doc.querySelector(".game-status")?.textContent?.includes("10,000.00"),
    );
    const [archive] = stored();
    assert.equal(archive.restarted, true);
    assert.equal(archive.trades.length, 1);
    assert.equal(archive.trades[0].reason, "Turn finished");
    assert.ok(archive.trades[0].plannedRatio! > 0);
    assert.equal(archive.turns[0].factor, 1);
    assert.equal(archive.turns[0].trades, 1);
    assert.ok(Math.abs(archive.balance - 10000 - archive.trades[0].net) < 1e-8);
    await click("Statistics1");
    assert.ok(
      doc.querySelector('[role="dialog"]')?.textContent?.includes("Restarted"),
    );
    await act(async () =>
      doc
        .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
        .click(),
    );
    for (let turn = 1; turn <= 20; turn++) {
      await click("Finish turn");
      if (turn < 20) await click("Next turn");
    }
    assert.equal(stored().length, 2, "Finished game is archived once");
    await act(async () =>
      doc
        .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
        .click(),
    );
    assert.equal(doc.querySelector(".turn-status .turn-actions"), null);
    assert.equal(doc.querySelector(".restart-game"), null);
    assert.ok(
      doc
        .querySelector(".game-status .turn-actions")
        ?.textContent?.includes("New game"),
    );
    await click("New game");
    assert.ok(doc.querySelector(".restart-game"));
    assert.ok(doc.querySelector(".turn-status .finish-button"));
    assert.equal(
      stored().length,
      2,
      "Starting again does not duplicate completed game",
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
