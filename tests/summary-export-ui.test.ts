import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import SummaryExport from "../components/SummaryExport";
import type { Summary } from "../lib/storage";

test("card preview renders lazily, shares a prepared PNG, isolates keys, downloads and restores focus", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test",
  });
  const doc = dom.window.document;
  const old = new Map<string, PropertyDescriptor | undefined>();
  let generated = 0,
    shared = 0,
    downloads = 0,
    parentKeys = 0;
  const revoked = new Set<string>();
  const NativeURL = URL;
  class FakeURL extends NativeURL {
    static createObjectURL() {
      return `blob:test-${++generated}`;
    }
    static revokeObjectURL(url: string) {
      revoked.add(url);
    }
  }
  class FakeImage {
    onload: (() => void) | null = null;
    set src(value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage() {},
  })) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(new Blob(["png"], { type: "image/png" }));
  };
  dom.window.HTMLAnchorElement.prototype.click = () => {
    downloads++;
  };
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: doc,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Image: FakeImage,
    URL: FakeURL,
    navigator: {
      canShare: () => true,
      share: async (data: ShareData) => {
        assert.equal(data.files?.[0].type, "image/png");
        shared++;
      },
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  dom.window.addEventListener("keydown", () => parentKeys++);
  const root = createRoot(doc.getElementById("root")!);
  const summary: Summary = {
    id: "test",
    date: "2026-10-21T00:00:00Z",
    balance: 10000,
    net: 0,
    fees: 0,
    liquidated: false,
    turns: [],
    trades: [],
  };
  const button = (text: string) =>
    [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text,
    )!;
  try {
    await act(async () =>
      root.render(createElement(SummaryExport, { summary })),
    );
    assert.equal(generated, 0, "Opening summary does not render an image");
    assert.deepEqual(
      [...doc.querySelectorAll("button")].map((b) => b.textContent),
      ["Share card", "Export CSVs"],
    );
    assert.equal(doc.querySelector("a"), null);
    const trigger = button("Share card");
    trigger.focus();
    await act(async () => {
      trigger.click();
    });
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    const dialog = doc.querySelector("dialog[open]")!;
    assert.ok(dialog.querySelector('img[src^="blob:"]'));
    assert.equal(downloads, 0, "Preview never starts a download");
    await act(async () => {
      button("Share").click();
    });
    assert.equal(shared, 1);
    assert.equal(downloads, 0);
    act(() =>
      dialog.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      ),
    );
    assert.equal(
      parentKeys,
      0,
      "Preview keys do not reach the summary/outer dialog",
    );
    act(() => button("Download").click());
    assert.equal(downloads, 1);
    assert.ok(dialog.textContent!.includes("Save Image"));
    act(() =>
      dialog.dispatchEvent(
        new dom.window.Event("cancel", { cancelable: true }),
      ),
    );
    assert.equal(doc.querySelector("dialog"), null);
    assert.equal(doc.activeElement, trigger);
    act(() => button("Export CSVs").click());
    assert.equal(downloads, 3);
    assert.equal(doc.querySelectorAll("a[download]").length, 2);
    act(() => root.unmount());
    assert.equal(
      revoked.size,
      generated,
      "Every generated URL is released on unmount",
    );
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, value] of old) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
