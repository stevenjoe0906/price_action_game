import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
const run = promisify(execFile);

test("downloader migrates BTC manifest, adds ETH, reuses archives and excludes unpublished months", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "market-downloader-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "public/data"), { recursive: true });
    await symlink(
      path.resolve("node_modules"),
      path.join(root, "node_modules"),
      "dir",
    );
    await writeFile(
      path.join(root, "scripts/download-data.mjs"),
      await readFile("scripts/download-data.mjs"),
    );
    const bytes = zipSync({
      "rows.csv": strToU8(
        Array.from(
          { length: 2000 },
          (_, i) =>
            `${Date.UTC(2024, 0, 1) + i * 300000},${100 + i},${102 + i},${99 + i},${101 + i}`,
        ).join("\n"),
      ),
    });
    await writeFile(
      path.join(root, "public/data/BTCUSDT-5m-2024-01.zip"),
      bytes,
    );
    await writeFile(
      path.join(root, "public/data/index.json"),
      JSON.stringify({ symbol: "BTCUSDT", months: ["2024-01"] }),
    );
    const mock = path.join(root, "mock.mjs");
    await writeFile(
      mock,
      `import {readFile} from 'node:fs/promises'; const bytes=await readFile(new URL('./public/data/BTCUSDT-5m-2024-01.zip',import.meta.url)); globalThis.fetch=async url=>{console.log('FETCH '+url);return String(url).includes('2024-02')?new Response('',{status:404}):new Response(bytes);};`,
    );
    const args = [
      "--import",
      mock,
      path.join(root, "scripts/download-data.mjs"),
      "--from=2024-01",
      "--to=2024-02",
    ];
    const first = await run(process.execPath, args, { timeout: 10000 });
    assert.ok(first.stdout.includes("Cached BTCUSDT 2024-01"));
    assert.ok(first.stdout.includes("Downloaded ETHUSDT 2024-01"));
    assert.ok(
      first.stdout.includes("/klines/ETHUSDT/5m/ETHUSDT-5m-2024-01.zip"),
    );
    const manifest = JSON.parse(
      await readFile(path.join(root, "public/data/index.json"), "utf8"),
    );
    assert.deepEqual(manifest.months, ["2024-01"]);
    assert.deepEqual(manifest.symbols, {
      BTCUSDT: { months: ["2024-01"] },
      ETHUSDT: { months: ["2024-01"] },
    });
    const second = await run(
      process.execPath,
      [...args.slice(0, -2), "--from=2024-01", "--to=2024-01"],
      { timeout: 10000 },
    );
    assert.ok(second.stdout.includes("Cached ETHUSDT 2024-01"));
    assert.ok(!second.stdout.includes("FETCH"), "Second run needs no network");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
