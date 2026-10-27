import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import TradingGame from "../components/TradingGame";
import type { Summary } from "../lib/storage";

test("saved balance changes affect new games and restarts without changing current turns or records", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://game.test" });
  const doc = dom.window.document;
  const old = new Map<string, PropertyDescriptor | undefined>();
  const fakeFetch = async (input: string | URL | Request) =>
    String(input) === "/data/index.json"
      ? new Response("", { status: 404 })
      : Response.json(
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
  const button = (label: string) => {
    const b = [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === label,
    );
    assert.ok(b, label);
    return b;
  };
  const click = async (label: string) => act(async () => button(label).click());
  const open = async () =>
    act(async () =>
      doc.querySelector<HTMLButtonElement>('[aria-label="Settings"]')!.click(),
    );
  const close = async () =>
    act(async () =>
      doc
        .querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!
        .click(),
    );
  const type = async (value: string) =>
    act(async () => {
      const input = doc.querySelector<HTMLInputElement>("#starting-balance")!;
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  const change = async (value: string) => {
    await open();
    await type(value);
    await click("Save settings");
  };
  const balance = () =>
    [...doc.querySelectorAll(".game-status > .detail")].find(
      (row) => row.firstElementChild?.textContent === "Balance",
    )?.lastElementChild?.textContent;
  const pnl = () =>
    [...doc.querySelectorAll(".game-status > .detail")].find(
      (row) => row.firstElementChild?.textContent === "PnL",
    )?.lastElementChild?.textContent;
  const records = () =>
    JSON.parse(localStorage.getItem("pa-summaries") ?? "[]") as Summary[];
  try {
    await act(async () => root.render(createElement(TradingGame)));
    await change("5000");
    assert.equal(balance(), "$5,000.00");
    await open();
    for (const invalid of ["", "9", "100001", "10.5"]) {
      await type(invalid);
      assert.equal(button("Save settings").disabled, true);
      assert.equal(
        doc.querySelector("#starting-balance")?.getAttribute("aria-invalid"),
        "true",
      );
      assert.equal(
        JSON.parse(localStorage.getItem("pa-settings")!).startingBalance,
        5000,
      );
    }
    for (const valid of ["10", "100000"]) {
      await type(valid);
      assert.equal(button("Save settings").disabled, false);
    }
    await close();
    await click("Start a new game");
    assert.equal(balance(), "$5,000.00");
    await change("7000");
    assert.equal(balance(), "$5,000.00");
    assert.equal(pnl(), "+0.00");
    await click("Finish turn");
    await click("Next turn");
    assert.equal(balance(), "$5,000.00");
    await click("Repick");
    assert.equal(balance(), "$5,000.00");
    await click("Restart game");
    assert.ok(
      doc.querySelector('[role="dialog"]')?.textContent?.includes("$7,000.00"),
    );
    await click("Save record & restart");
    assert.equal(balance(), "$7,000.00");
    assert.equal(pnl(), "+0.00");
    assert.equal(records()[0].startingBalance, 5000);
    assert.equal(records()[0].net, 0);
    await change("9000");
    assert.equal(balance(), "$7,000.00");
    for (let turn = 1; turn <= 20; turn++) {
      await click("Finish turn");
      if (turn < 20) await click("Next turn");
    }
    assert.equal(records()[0].startingBalance, 7000);
    assert.equal(records()[0].net, 0);
    assert.ok(
      doc.querySelector(".equity-chart")?.textContent?.includes("$7,000.00"),
    );
    assert.ok(
      doc.querySelector(".summary-top")?.textContent?.includes("+0.00% return"),
    );
    await close();
    await click("New game");
    assert.equal(balance(), "$9,000.00");
    assert.equal(pnl(), "+0.00");
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
