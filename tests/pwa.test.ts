import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import manifest from "../app/manifest";

test("install manifest has standalone scope and real PNG icons at required sizes", () => {
  const app = manifest();
  assert.equal(app.id, "/");
  assert.equal(app.start_url, "/");
  assert.equal(app.scope, "/");
  assert.equal(app.display, "standalone");
  assert.ok(app.name && app.short_name);
  assert.equal(app.prefer_related_applications, false);
  for (const size of [192, 512]) {
    assert.ok(
      app.icons?.some(
        (icon) => icon.sizes === `${size}x${size}` && icon.purpose === "any",
      ),
    );
  }
  assert.ok(app.icons?.some((icon) => icon.purpose === "maskable"));
  for (const icon of app.icons ?? []) {
    const bytes = readFileSync(
      new URL(`../public${icon.src}`, import.meta.url),
    );
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(icon.type, "image/png");
    assert.equal(
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      icon.sizes,
    );
  }
  const apple = readFileSync(
    new URL("../public/icons/apple-touch-icon.png", import.meta.url),
  );
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
});
