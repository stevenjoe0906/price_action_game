// Download public monthly BTCUSDT/ETHUSDT perpetual archives for backend-free local replay.
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "data",
);
const args = process.argv.slice(2);
const get = (key, fallback) =>
  args.find((a) => a.startsWith(`${key}=`))?.split("=")[1] ?? fallback;
const symbols = [
  ...new Set(
    get("--symbols", "BTCUSDT,ETHUSDT")
      .split(",")
      .map((s) => s.trim().toUpperCase()),
  ),
];
if (!symbols.length || symbols.some((s) => !["BTCUSDT", "ETHUSDT"].includes(s)))
  throw new Error("Use --symbols=BTCUSDT,ETHUSDT (or either market).");
const now = new Date();
const from = get("--from", "2022-01");
const to = get(
  "--to",
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() || 12).padStart(2, "0")}`,
);
const endMonth = args.some((a) => a.startsWith("--to="))
  ? to
  : `${now.getUTCMonth() ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-${String(now.getUTCMonth() || 12).padStart(2, "0")}`;
if (
  ![from, endMonth].every((s) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(s)) ||
  from > endMonth
)
  throw new Error("Use --from=YYYY-MM --to=YYYY-MM, with from <= to.");
await mkdir(root, { recursive: true });
let previous = { months: [] };
try {
  previous = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
} catch {}
const completed = Object.fromEntries(
  ["BTCUSDT", "ETHUSDT"].map((symbol) => [
    symbol,
    new Set(
      previous.symbols?.[symbol]?.months ??
        (symbol === (previous.symbol ?? "BTCUSDT") ? previous.months : []),
    ),
  ]),
);
const months = [];
for (
  let d = new Date(`${from}-01T00:00:00Z`);
  d.toISOString().slice(0, 7) <= endMonth;
  d.setUTCMonth(d.getUTCMonth() + 1)
)
  months.push(d.toISOString().slice(0, 7));
function validZip(bytes) {
  const files = unzipSync(bytes);
  const csv = Object.values(files)[0];
  if (!csv) throw new Error("Empty archive");
  const rows = strFromU8(csv).trim().split("\n");
  if (rows.length < 2 || !rows.some((r) => /^\d{13},/.test(r)))
    throw new Error("Invalid Binance archive");
}
async function download({ month, symbol }) {
  const name = `${symbol}-5m-${month}.zip`,
    dest = path.join(root, name);
  try {
    if ((await stat(dest)).size > 1000) {
      validZip(new Uint8Array(await readFile(dest)));
      completed[symbol].add(month);
      console.log(`Cached ${symbol} ${month}`);
      return;
    }
  } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `https://data.binance.vision/data/futures/um/monthly/klines/${symbol}/5m/${name}`,
        { signal: AbortSignal.timeout(60_000) },
      );
      if (response.status === 404) {
        console.log(`Not published: ${symbol} ${month}`);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      validZip(bytes);
      await writeFile(`${dest}.tmp`, bytes);
      await rename(`${dest}.tmp`, dest);
      completed[symbol].add(month);
      console.log(
        `Downloaded ${symbol} ${month} (${Math.round(bytes.length / 1024)} KB)`,
      );
      return;
    } catch (e) {
      if (attempt === 2) throw new Error(`${symbol} ${month}: ${e.message}`);
    }
  }
}
let failure;
const jobs = symbols.flatMap((symbol) =>
  months.map((month) => ({ symbol, month })),
);
for (let i = 0; i < jobs.length; i += 4) {
  const results = await Promise.allSettled(jobs.slice(i, i + 4).map(download));
  for (const r of results)
    if (r.status === "rejected") {
      console.error(r.reason.message);
      failure = true;
    }
  const manifest = {
    version: 2,
    symbol: "BTCUSDT", // Legacy readers still see BTC history only.
    symbols: Object.fromEntries(
      Object.entries(completed)
        .filter(([, months]) => months.size)
        .map(([symbol, months]) => [symbol, { months: [...months].sort() }]),
    ),
    market: "Binance USD-M perpetual",
    baseInterval: "5m",
    months: [...completed.BTCUSDT].sort(),
  };
  await writeFile(
    path.join(root, "index.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
console.log(
  `${Object.values(completed).reduce((total, months) => total + months.size, 0)} monthly archives available. Rebuild after downloading if using a static export.`,
);
if (failure) process.exitCode = 1;
