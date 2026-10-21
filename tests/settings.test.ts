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
    theme: "dark",
  });
});
test("all display sizes round-trip through saved settings", (t) => {
  storage(t);
  for (const displaySize of Object.keys(
    DISPLAY_SIZES,
  ) as (keyof typeof DISPLAY_SIZES)[]) {
    const settings = {
      risk: 1,
      interval: "5m" as const,
      displaySize,
      theme: "dark" as const,
    };
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
    theme: "dark",
  });
});
test("malformed settings still fall back safely", (t) => {
  storage(t, "{invalid");
  assert.deepEqual(loadSettings(), defaults);
});

test("light and dark appearance survive reload without changing risk or sizing", (t) => {
  storage(t);
  for (const theme of ["light", "dark"] as const) {
    const settings = {
      risk: 2,
      interval: "1h" as const,
      displaySize: "large" as const,
      theme,
    };
    saveSettings(settings);
    assert.deepEqual(loadSettings(), settings);
  }
});
test("invalid themes preserve prior display and trading preferences", (t) => {
  storage(
    t,
    JSON.stringify({
      risk: 4,
      interval: "1d",
      displaySize: "extra-large",
      theme: "sepia",
    }),
  );
  assert.deepEqual(loadSettings(), {
    risk: 4,
    interval: "1d",
    displaySize: "extra-large",
    theme: "dark",
  });
});

test("display size choices include -50%, -30%, -15%, and +50% without changing existing presets", () => {
  assert.deepEqual(Object.values(DISPLAY_SIZES), [0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5]);
  assert.equal(DISPLAY_SIZES.comfortable, 1);
  assert.equal(DISPLAY_SIZES.large, 1.15);
  assert.equal(DISPLAY_SIZES["extra-large"], 1.3);
});
