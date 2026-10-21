import { unzipSync, strFromU8 } from "fflate";
import type { Candle } from "./engine";
export const INTERVALS = ["5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];
export const seconds = (interval: Interval) =>
  ({
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
  })[interval];
export const MARKET_SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;
export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];
const EARLIEST = Date.UTC(2022, 0, 1);
type Raw = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  ...unknown[],
];
export type MarketSession = {
  symbol?: MarketSymbol;
  candles: Candle[];
  factor: number;
  cursor: number;
  interval: Interval;
  source: "api" | "local";
  months?: string[];
  endTime?: number;
};
type MarketCatalog = Partial<Record<MarketSymbol, string[]>>;
let manifest: Promise<MarketCatalog | null> | null = null;
const cache = new Map<string, Candle[]>();
// Raw archives are shared across timeframes; bounded caches avoid tablet memory growth.
const rawCache = new Map<string, Candle[]>();
const rawPending = new Map<string, Promise<Candle[]>>();
const pending = new Map<string, Promise<Candle[]>>();
async function rawMonth(
  month: string,
  symbol: MarketSymbol,
): Promise<Candle[]> {
  const key = `${symbol}-${month}`;
  const cached = rawCache.get(key);
  if (cached) {
    rawCache.delete(key);
    rawCache.set(key, cached);
    return cached;
  }
  if (rawPending.has(key)) return rawPending.get(key)!;
  const task = (async () => {
    const response = await fetch(`/data/${symbol}-5m-${month}.zip`);
    if (!response.ok)
      throw new Error(
        `Historical archive ${symbol} ${month} is missing. Run pnpm data:download, then rebuild.`,
      );
    const rows = parseArchive(new Uint8Array(await response.arrayBuffer()));
    rawCache.set(key, rows);
    if (rawCache.size > 8) rawCache.delete(rawCache.keys().next().value!);
    return rows;
  })();
  rawPending.set(key, task);
  try {
    return await task;
  } finally {
    rawPending.delete(key);
  }
}
export function parseArchive(bytes: Uint8Array): Candle[] {
  const files = unzipSync(bytes);
  const csv = Object.entries(files).find(([name]) =>
    name.endsWith(".csv"),
  )?.[1];
  if (!csv) throw new Error("Historical archive is empty.");
  const result = strFromU8(csv)
    .trim()
    .split("\n")
    .map((line) => line.split(","))
    .filter((r) => /^\d+$/.test(r[0]))
    .map((r) => ({
      time: Number(r[0]) / (Number(r[0]) >= 1e15 ? 1e6 : 1000),
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
    }))
    .filter(
      (b) =>
        [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) &&
        b.open > 0 &&
        b.close > 0,
    );
  if (!result.length)
    throw new Error("Historical archive has no valid candles.");
  return result.sort((a, b) => a.time - b.time);
}
export function aggregate(candles: Candle[], interval: Interval): Candle[] {
  const duration = seconds(interval),
    result: Candle[] = [];
  let group: Candle[] = [];
  const flush = () => {
    if (!group.length) return;
    const time = Math.floor(group[0].time / duration) * duration;
    // Never create a higher-timeframe candle from an incomplete group.
    if (
      group.length === duration / 300 &&
      group[0].time === time &&
      group.every((c, i) => c.time === time + i * 300)
    )
      result.push({
        time,
        open: group[0].open,
        high: Math.max(...group.map((c) => c.high)),
        low: Math.min(...group.map((c) => c.low)),
        close: group[group.length - 1].close,
      });
  };
  for (const candle of candles) {
    if (
      group.length &&
      Math.floor(group[0].time / duration) !==
        Math.floor(candle.time / duration)
    ) {
      flush();
      group = [];
    }
    group.push(candle);
  }
  flush();
  return result;
}
async function localMarkets(): Promise<MarketCatalog | null> {
  if (!manifest)
    manifest = (async () => {
      try {
        const response = await fetch("/data/index.json");
        if (!response.ok) return null;
        const data = await response.json();
        const clean = (months: unknown) =>
          Array.isArray(months)
            ? [
                ...new Set(
                  months.filter(
                    (m): m is string =>
                      typeof m === "string" &&
                      /^20\d{2}-(0[1-9]|1[0-2])$/.test(m),
                  ),
                ),
              ].sort()
            : [];
        const catalog: MarketCatalog = {};
        for (const symbol of MARKET_SYMBOLS) {
          const months = clean(
            data.symbols?.[symbol]?.months ??
              (symbol === (data.symbol ?? "BTCUSDT") ? data.months : []),
          );
          if (months.length) catalog[symbol] = months;
        }
        return Object.keys(catalog).length ? catalog : null;
      } catch {
        return null;
      }
    })();
  return manifest;
}
async function localMonth(
  month: string,
  interval: Interval,
  symbol: MarketSymbol,
): Promise<Candle[]> {
  const key = `${symbol}-${month}-${interval}`;
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    const rows = aggregate(await rawMonth(month, symbol), interval);
    cache.set(key, rows);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    return rows;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
async function request(
  params: Record<string, string>,
  symbol: MarketSymbol,
): Promise<Raw[]> {
  try {
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?${new URLSearchParams({ symbol, ...params })}`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected response");
    return rows as Raw[];
  } catch (e) {
    throw new Error(
      `Binance futures data is unavailable (${e instanceof Error ? e.message : "connection error"}). For reliable local replay, run pnpm data:download and restart/rebuild the website. No API key is needed.`,
    );
  }
}
function convert(rows: Raw[], factor: number): Candle[] {
  return rows
    .filter((r) => r[6] < Date.now())
    .map((r) => ({
      time: r[0] / 1000,
      open: +r[1] * factor,
      high: +r[2] * factor,
      low: +r[3] * factor,
      close: +r[4] * factor,
    }))
    .filter((b) =>
      [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite),
    );
}
const normalize = (rows: Candle[], factor: number) =>
  rows.map((b) => ({
    time: b.time,
    open: b.open * factor,
    high: b.high * factor,
    low: b.low * factor,
    close: b.close * factor,
  }));
const monthOf = (time: number) =>
  new Date(time * 1000).toISOString().slice(0, 7);
export async function randomSession(
  interval: Interval,
  onProgress?: (message: string) => void,
  preferredSymbol?: MarketSymbol,
): Promise<MarketSession> {
  onProgress?.("Checking historical data…");
  const catalog = await localMarkets();
  const available = catalog
    ? MARKET_SYMBOLS.filter((symbol) => catalog[symbol]?.length)
    : [...MARKET_SYMBOLS];
  const symbol =
    preferredSymbol ?? available[Math.floor(Math.random() * available.length)];
  if (!available.includes(symbol))
    throw new Error(
      `No local history for ${symbol}. Run pnpm data:download and rebuild.`,
    );
  const months = catalog?.[symbol];
  if (months) {
    // Uniform random timestamp over available months, then reject if insufficient history.
    const duration = seconds(interval);
    const start =
      Math.max(EARLIEST, Date.parse(`${months[0]}-01T00:00:00Z`)) / 1000;
    onProgress?.("Loading historical archives…");
    const lastRows = await localMonth(
      months[months.length - 1],
      interval,
      symbol,
    );
    if (!lastRows.length)
      throw new Error(
        "The data pack does not contain complete candles for this interval.",
      );
    const end = lastRows[lastRows.length - 1].time;
    for (let attempt = 0; attempt < 30; attempt++) {
      const pivot =
        Math.floor(
          (start + Math.random() * (end - start - duration)) / duration,
        ) * duration;
      const month = monthOf(pivot);
      const index = months.indexOf(month);
      if (index < 0) continue;
      let rows = (await localMonth(month, interval, symbol)).filter(
        (c) => c.time <= pivot,
      );
      let previous = index - 1;
      let loaded = 1;
      while (rows.length < 1500 && previous >= 0) {
        const batch: string[] = [];
        const batchLimit = Math.max(
          1,
          Math.min(
            4,
            Math.ceil(
              (1500 - rows.length) /
                Math.max(1, Math.floor((28 * 86400) / duration)),
            ),
          ),
        );
        // Fetch consecutive history in bounded parallel batches, preserving gaps.
        while (batch.length < batchLimit && previous >= 0) {
          const expected = new Date(`${months[previous + 1]}-01T00:00:00Z`);
          expected.setUTCMonth(expected.getUTCMonth() - 1);
          if (months[previous] !== expected.toISOString().slice(0, 7)) break;
          batch.push(months[previous--]);
        }
        if (!batch.length) break;
        onProgress?.(
          `Preparing historical candles (${loaded + batch.length} archives)…`,
        );
        const history = await Promise.all(
          batch.map((month) => localMonth(month, interval, symbol)),
        );
        loaded += history.length;
        rows = [...history.reverse().flat(), ...rows];
        if (batch.length < batchLimit) break;
      }
      rows = rows.slice(-1500);
      if (rows.length < 500) continue;
      const factor = 100 / rows[rows.length - 1].close;
      const candles = normalize(rows, factor);
      return {
        symbol,
        candles,
        factor,
        cursor: candles[candles.length - 1].time,
        interval,
        source: "local",
        months,
        endTime: end,
      };
    }
    throw new Error(
      "Not enough contiguous history for 500 candles. Download more months with pnpm data:download or choose a shorter interval.",
    );
  }
  onProgress?.("Loading public market data…");
  const ms = seconds(interval) * 1000;
  const latest = Math.floor(Date.now() / ms) * ms - ms;
  for (let attempt = 0; attempt < 5; attempt++) {
    const pivot =
      Math.floor((EARLIEST + Math.random() * (latest - EARLIEST - ms)) / ms) *
      ms;
    const rows = await request(
      {
        interval,
        endTime: String(pivot + ms - 1),
        limit: "1500",
      },
      symbol,
    );
    if (rows.length < 500) continue;
    const factor = 100 / +rows[rows.length - 1][4];
    const candles = convert(rows, factor);
    if (candles.length < 500) continue;
    return {
      symbol,
      candles,
      factor,
      cursor: candles[candles.length - 1].time,
      interval,
      source: "api",
    };
  }
  throw new Error("Could not find 500 historical candles. Please repick.");
}
export async function futureCandles(
  session: MarketSession,
  cursor: number,
): Promise<Candle[]> {
  let candles: Candle[];
  const symbol = session.symbol ?? "BTCUSDT";
  if (session.source === "local") {
    const month = monthOf(cursor);
    const index = session.months!.indexOf(month);
    const current = (await localMonth(month, session.interval, symbol)).filter(
      (c) => c.time > cursor,
    );
    if (current.length) candles = normalize(current, session.factor);
    else if (index >= 0 && index < session.months!.length - 1) {
      const nextMonth = session.months![index + 1];
      const expected = new Date(`${month}-01T00:00:00Z`);
      expected.setUTCMonth(expected.getUTCMonth() + 1);
      if (expected.toISOString().slice(0, 7) !== nextMonth)
        throw new Error(
          "Historical data has a gap. Download the missing month before continuing.",
        );
      candles = normalize(
        await localMonth(nextMonth, session.interval, symbol),
        session.factor,
      );
    } else return [];
  } else {
    candles = convert(
      await request(
        {
          interval: session.interval,
          startTime: String((cursor + seconds(session.interval)) * 1000),
          limit: "1000",
        },
        symbol,
      ),
      session.factor,
    ).filter((c) => c.time > cursor);
  }
  candles = candles
    .sort((a, b) => a.time - b.time)
    .filter((c, i, a) => i === 0 || c.time !== a[i - 1].time);
  const duration = seconds(session.interval);
  if (
    candles.length &&
    (candles[0].time !== cursor + duration ||
      candles.some(
        (c, i) => i > 0 && c.time !== candles[i - 1].time + duration,
      ))
  )
    throw new Error(
      "Historical candles contain a gap. Replay paused to avoid inaccurate fills.",
    );
  return candles;
}
