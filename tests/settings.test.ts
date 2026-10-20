import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  DISPLAY_SIZES,
  loadSettings,
  saveSettings,
} from "../lib/storage";
function storage(
  t: { after: (fn: () => void) => void },
  value: string | null = null,
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  let stored = value;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, v: string) => {
        stored = v;
      },
    },
  });
  t.after(() => {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
}
test("old settings retain risk and interval when adding display-size preference", (t) => {
  storage(t, JSON.stringify({ risk: 2.5, interval: "15m" }));
  assert.deepEqual(loadSettings(), {
    risk: 2.5,
    interval: "15m",
    displaySize: "comfortable",
  });
});
test("all display sizes round-trip through saved settings", (t) => {
  storage(t);
  for (const displaySize of Object.keys(
    DISPLAY_SIZES,
  ) as (keyof typeof DISPLAY_SIZES)[]) {
    const settings = { risk: 1, interval: "5m" as const, displaySize };
    saveSettings(settings);
    assert.deepEqual(loadSettings(), settings);
  }
});
test("unknown display sizes fall back without resetting valid trading settings", (t) => {
  storage(
    t,
    JSON.stringify({ risk: 3, interval: "4h", displaySize: "invalid" }),
  );
  assert.deepEqual(loadSettings(), {
    risk: 3,
    interval: "4h",
    displaySize: "comfortable",
  });
});
test("malformed settings still fall back safely", (t) => {
  storage(t, "{invalid");
  assert.deepEqual(loadSettings(), defaults);
});
