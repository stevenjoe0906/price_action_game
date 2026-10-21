"use client";
import dynamic from "next/dynamic";
import { averageRatio, formatRatio, profitLossRatio } from "@/lib/trade-ratio";
import SummaryExport from "./SummaryExport";
import { chartPrice } from "@/lib/chart-display";
import ResizableChartPanels from "./ResizableChartPanels";
import { useTouchLayout } from "@/lib/use-touch-layout";
import PositionProtection from "./PositionProtection";
import { createReplayTimer } from "@/lib/replay-timer";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  advance,
  cancelOrder,
  closePosition,
  createGame,
  equity,
  finishTurn,
  INITIAL_BALANCE,
  liquidationPrice,
  margin,
  modifyProtection,
  restoreProtection,
  nextTurn,
  slip,
  submitOrder,
  unrealized,
  type Candle,
  type Game,
  type OrderType,
  type Side,
} from "@/lib/engine";
import {
  futureCandles,
  INTERVALS,
  randomSession,
  seconds,
  type Interval,
  type MarketSession,
} from "@/lib/market";
import {
  defaults,
  DISPLAY_SIZES,
  type DisplaySize,
  loadSettings,
  loadSummaries,
  saveSettings,
  saveSummary,
  summarize,
  type Settings,
  type Summary,
} from "@/lib/storage";
import {
  orderDraft,
  orderTypeLabel,
  ORDER_TYPES,
  DEFAULT_ORDER_TYPE,
  type ChartOrderType,
} from "@/lib/order-ticket";
import { CHART_THEMES, type Theme } from "@/lib/theme";
import { workingChartLines, type ChartLine } from "@/lib/chart-lines";
const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Preparing chart…</div>,
});
const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const price = (n: number) => n.toFixed(4);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const tone = (n: number) => (n >= 0 ? "positive" : "negative");
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    next: (
      <>
        <path d="m5 5 10 7-10 7ZM19 5v14" />
      </>
    ),
    settings: (
      <>
        <path d="m10 3-.7 3-2 .9L4.7 6 3 9l2.2 2v2L3 15l1.7 3 2.6-.9 2 .9.7 3h4l.7-3 2-.9 2.6.9 1.7-3-2.2-2v-2L21 9l-1.7-3-2.6.9-2-.9L14 3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    chart: (
      <>
        <path d="M4 4v16h16M8 14l4-5 4 3 4-7" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    book: (
      <>
        <path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v15" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V3m0 1c5-3 9 4 15 0v10c-6 4-10-3-15 0" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.chart}
    </svg>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          'button, input, select, [tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function TradingGame() {
  const [game, setGame] = useState<Game | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [candles, setCandles] = useState<Candle[]>([]);
  const [session, setSession] = useState<MarketSession | null>(null);
  const sessionRef = useRef<MarketSession | null>(null);
  const buffer = useRef<Candle[]>([]);
  const turnFillStart = useRef(0);
  const [loading, setLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState("Finding your first chart…");
  const locked = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const touchLayout = useTouchLayout();
  const [activityVisible, setActivityVisible] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ticket, setTicket] = useState(false);
  const [side, setSide] = useState<Side>("long");
  const [orderType, setOrderType] = useState<OrderType>(DEFAULT_ORDER_TYPE);
  const [entry, setEntry] = useState("100");
  const [limitPrice, setLimitPrice] = useState("100.0001");
  const [sl, setSl] = useState("99.5");
  const [tp, setTp] = useState("101");
  const [leverage, setLeverage] = useState(10);
  const [positionSL, setPositionSL] = useState("");
  const [positionTP, setPositionTP] = useState("");
  const [modal, setModal] = useState<
    "settings" | "history" | "rules" | "chart-help" | "restart" | null
  >(null);
  const [saved, setSaved] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState<Settings>(defaults);
  const summarySaved = useRef(false);
  const hold = useRef<ReturnType<typeof createReplayTimer> | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const commit = useCallback((g: Game) => {
    if (g.status !== "active" && sessionRef.current) {
      const market = sessionRef.current;
      g = {
        ...g,
        turns: g.turns.map((turn) =>
          turn.number === g.turn
            ? { ...turn, factor: market.factor, interval: market.interval }
            : turn,
        ),
      };
    }
    gameRef.current = g;
    setGame(g);
    if (g.notice) setToast(g.notice);
  }, []);
  useEffect(() => {
    setSettings(loadSettings());
    setSaved(loadSummaries());
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * DISPLAY_SIZES[settings.displaySize]}px`;
  }, [settings.displaySize]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", CHART_THEMES[settings.theme].background);
  }, [settings.theme]);
  useEffect(() => {
    if (!chartExpanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented)
        setChartExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [chartExpanded]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    setPositionSL(
      game?.position?.sl != null ? String(+game.position.sl.toFixed(6)) : "",
    );
  }, [game?.position?.sl]);
  useEffect(() => {
    setPositionTP(
      game?.position?.tp ? String(+game.position.tp.toFixed(6)) : "",
    );
  }, [game?.position?.tp]);
  useEffect(() => {
    if (game?.status === "finished" && !summarySaved.current) {
      summarySaved.current = true;
      const summary = summarize(game);
      setSelected(summary);
      setModal("history");
      try {
        setSaved(saveSummary(summary));
      } catch {
        setToast(
          "Game completed, but browser storage is unavailable. This summary will be lost on refresh.",
        );
        setSaved((previous) => [summary, ...previous].slice(0, 10));
      }
    }
  }, [game]);
  useEffect(() => {
    if (modal) {
      setPlaying(false);
      hold.current?.stop();
      hold.current = null;
    }
  }, [modal]);
  const loadTurn = async (mode: "new" | "next" | "repick" | "restart") => {
    if (locked.current) return;
    if (
      mode === "repick" &&
      (gameRef.current?.traded || gameRef.current?.status !== "active")
    )
      return;
    if (mode === "next" && gameRef.current?.status !== "turn-ended") return;
    locked.current = true;
    setLoading(true);
    setPlaying(false);
    setError("");
    try {
      const s = await randomSession(
        settingsRef.current.interval,
        setLoadMessage,
      );
      const last = s.candles[s.candles.length - 1];
      let g: Game;
      if (mode === "next" && gameRef.current)
        g = nextTurn(gameRef.current, last.close, last.time);
      else if (mode === "repick" && gameRef.current)
        g = {
          ...gameRef.current,
          last: last.close,
          time: last.time,
          bars: 0,
          notice: "",
        };
      else {
        if (mode === "restart" && gameRef.current && !summarySaved.current) {
          const ended = finishTurn(gameRef.current);
          const market = sessionRef.current;
          if (market)
            ended.turns = ended.turns.map((turn) =>
              turn.number === ended.turn
                ? { ...turn, factor: market.factor, interval: market.interval }
                : turn,
            );
          const archive = { ...summarize(ended), restarted: true };
          try {
            setSaved(saveSummary(archive));
          } catch {
            // Preserve the current game when durable storage cannot be written.
            throw new Error(
              "Could not save the trade record. Restart canceled; free browser storage and try again.",
            );
          }
        }
        g = createGame(last.close, last.time);
        summarySaved.current = false;
      }
      sessionRef.current = s;
      setSession(s);
      buffer.current = [];
      turnFillStart.current = g.fills.length;
      setCandles(s.candles);
      commit(g);
      setTicket(false);
      setOrderType(DEFAULT_ORDER_TYPE);
      setEntry("100");
      setSl("99.5");
      setTp("101");
      setSide("long");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load market data.");
    } finally {
      locked.current = false;
      setLoading(false);
    }
  };
  const step = useCallback(async () => {
    if (
      locked.current ||
      gameRef.current?.status !== "active" ||
      !sessionRef.current
    )
      return;
    locked.current = true;
    try {
      if (!buffer.current.length) {
        setLoading(true);
        setLoadMessage("Loading next candles…");
        buffer.current = await futureCandles(
          sessionRef.current,
          gameRef.current.time,
        );
        if (!buffer.current.length) {
          commit(finishTurn(gameRef.current));
          setPlaying(false);
          setTicket(false);
          setToast(
            sessionRef.current.source === "local"
              ? "End of downloaded history reached. This turn is complete."
              : "Latest closed candle reached. This turn is complete.",
          );
          return;
        }
      }
      const candle = buffer.current.shift()!;
      let next = advance(gameRef.current!, candle);
      const duration = seconds(sessionRef.current.interval);
      const end =
        sessionRef.current.endTime ??
        Math.floor(Date.now() / (duration * 1000)) * duration - duration;
      if (next.status === "active" && candle.time >= end) {
        next = finishTurn(next);
        setToast(
          sessionRef.current.source === "local"
            ? "End of downloaded history reached. This turn is complete."
            : "Latest closed candle reached. This turn is complete.",
        );
      }
      commit(next);
      setCandles((c) => [...c, candle]);
      if (next.status !== "active") {
        setPlaying(false);
        setTicket(false);
      }
    } catch (e) {
      setPlaying(false);
      setError(e instanceof Error ? e.message : "Could not advance replay.");
    } finally {
      locked.current = false;
      setLoading(false);
    }
  }, [commit]);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stopHold = useCallback(() => {
    hold.current?.stop();
    hold.current = null;
  }, []);
  const beginHold = useCallback(() => {
    if (hold.current?.running) return;
    setPlaying(false);
    hold.current = createReplayTimer(
      () => void stepRef.current(),
      speedRef.current,
    );
    hold.current.start(true);
  }, []);
  useEffect(() => {
    if (!playing || game?.status !== "active") return;
    const timer = createReplayTimer(() => void stepRef.current(), speed);
    timer.start();
    return timer.stop;
  }, [playing, speed, game?.status]);
  useEffect(() => {
    hold.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        modal ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
            e.target.tagName,
          ) ||
            e.target.isContentEditable))
      )
        return;
      if (gameRef.current?.status !== "active") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) {
          stopHold();
          setPlaying((p) => !p);
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!e.repeat) beginHold();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") stopHold();
    };
    const blur = () => {
      stopHold();
      setPlaying(false);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("pointerup", stopHold);
    window.addEventListener("pointercancel", stopHold);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopHold();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("pointerup", stopHold);
      window.removeEventListener("pointercancel", stopHold);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [beginHold, stopHold, modal]);
  const safe = (action: (g: Game) => Game) => {
    try {
      if (gameRef.current) {
        commit(action(gameRef.current));
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    }
  };
  const finish = () => {
    if (locked.current) return;
    stopHold();
    setPlaying(false);
    safe(finishTurn);
    setTicket(false);
  };
  const changeSide = (s: Side) => {
    setSide(s);
    if (orderType === "stop-limit")
      setLimitPrice((+entry + (s === "long" ? 0.0001 : -0.0001)).toFixed(6));
    const p =
      orderType === "market" ? (gameRef.current?.last ?? 100) : +entry || 100;
    setSl((p * (s === "long" ? 0.995 : 1.005)).toFixed(4));
    setTp((p * (s === "long" ? 1.01 : 0.99)).toFixed(4));
  };
  const cancelTicket = () => {
    setTicket(false);
    setSide("long");
    setOrderType(DEFAULT_ORDER_TYPE);
    setLeverage(10);
    const current = gameRef.current?.last ?? 100;
    setEntry(String(current));
    setLimitPrice((current + 0.0001).toFixed(6));
    setSl((current * 0.995).toFixed(6));
    setTp((current * 1.01).toFixed(6));
    setError("");
  };
  const onCancelLine = (id: string) => {
    if (locked.current || gameRef.current?.status !== "active") return;
    if (id === "draft-entry") {
      cancelTicket();
      return;
    }
    if (id.startsWith("order-")) {
      const orderId = Number(id.split("-")[1]);
      safe((g) => cancelOrder(g, orderId));
    } else if (id === "position-sl" || id === "position-tp") {
      safe((g) =>
        modifyProtection(
          g,
          id === "position-sl" ? null : g.position!.sl,
          id === "position-tp" ? null : g.position!.tp,
        ),
      );
    }
  };
  const addPositionProtection = (kind: "sl" | "tp") => {
    if (locked.current || gameRef.current?.status !== "active") return;
    safe((g) => restoreProtection(g, kind));
  };
  const startTicket = () => {
    setTicket(true);
    changeType(orderType);
  };
  const prepareChartOrder = (
    direction: Side,
    type: ChartOrderType,
    clicked: number,
  ) => {
    if (locked.current || gameRef.current?.status !== "active") return;
    const draft = orderDraft(direction, type, clicked);
    setPlaying(false);
    stopHold();
    setError("");
    setTicket(true);
    setSide(direction);
    setOrderType(type);
    setEntry(String(draft.entry));
    setSl(String(draft.sl));
    setTp(String(draft.tp));
    if (draft.limit !== undefined) setLimitPrice(String(draft.limit));
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>(".order-panel input:not(:disabled)")
        ?.focus(),
    );
  };
  const updateEntry = (value: string) => {
    if (orderType === "stop-limit" && +value > 0 && +entry > 0)
      setLimitPrice((current) =>
        String(+(+current + +value - +entry).toFixed(6)),
      );
    setEntry(value);
  };
  const changeType = (type: OrderType) => {
    setOrderType(type);
    const p = gameRef.current?.last ?? 100;
    const e =
      p *
      (type === "market"
        ? 1
        : type === "limit"
          ? side === "long"
            ? 0.999
            : 1.001
          : side === "long"
            ? 1.001
            : 0.999);
    setEntry(e.toFixed(4));
    setLimitPrice((e + (side === "long" ? 0.0001 : -0.0001)).toFixed(6));
    setSl((e * (side === "long" ? 0.995 : 1.005)).toFixed(4));
    setTp((e * (side === "long" ? 1.01 : 0.99)).toFixed(4));
  };
  const placeOrder = () => {
    if (locked.current) return;
    try {
      if (!gameRef.current) return;
      const next = submitOrder(gameRef.current, {
        side,
        type: orderType,
        entry: +entry,
        limit: orderType === "stop-limit" ? +limitPrice : undefined,
        sl: +sl,
        tp: tp.trim() ? +tp : null,
        leverage,
        risk: settings.risk,
      });
      commit(next);
      cancelTicket();
      setError("");
      setToast(
        orderType === "market"
          ? "Market order filled."
          : `${orderTypeLabel(orderType)} order placed.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order rejected.");
    }
  };
  const onLinePreview = (id: string, p: number) => {
    if (id === "draft-entry") updateEntry(String(p));
    else if (id === "draft-sl") setSl(String(p));
    else if (id === "draft-tp") setTp(String(p));
    else if (id === "position-sl") setPositionSL(String(p));
    else if (id === "position-tp") setPositionTP(String(p));
  };
  const onLine = (id: string, p: number) => {
    if (id.startsWith("draft-")) {
      onLinePreview(id, p);
      return;
    }
    const current = gameRef.current;
    if (!current?.position) return;
    try {
      commit(
        modifyProtection(
          current,
          id === "position-sl" ? p : current.position.sl,
          id === "position-tp" ? p : current.position.tp,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update protection.");
    } finally {
      // Invalid drops restore both the line and its input; previews never mutate the engine.
      const position = gameRef.current?.position;
      setPositionSL(
        position?.sl != null ? String(+position.sl.toFixed(6)) : "",
      );
      setPositionTP(position?.tp ? String(+position.tp.toFixed(6)) : "");
    }
  };
  const lines = useMemo<ChartLine[]>(() => {
    const palette = CHART_THEMES[settings.theme];
    const result = workingChartLines(game, palette);
    if (ticket && game?.status === "active") {
      result.push(
        {
          id: "draft-entry",
          title:
            orderType === "stop" || orderType === "stop-limit"
              ? "TRIGGER"
              : "ENTRY",
          price: orderType === "market" ? game.last : +entry,
          color: palette.accent,
          draggable: orderType !== "market",
          cancelLabel: "Cancel order ticket",
        },
        {
          id: "draft-sl",
          title: "ORDER SL",
          price: +sl,
          color: palette.down,
          draggable: true,
        },
      );
      if (tp.trim())
        result.push({
          id: "draft-tp",
          title: "ORDER TP",
          price: +tp,
          color: palette.up,
          draggable: true,
        });
    }
    return result;
  }, [
    settings.theme,
    game,
    game?.last,
    game?.status,
    ticket,
    orderType,
    entry,
    sl,
    tp,
  ]);
  const balance = game?.balance ?? INITIAL_BALANCE;
  const upnl = game ? unrealized(game) : 0;
  const closed = game?.trades ?? [];
  const wins = closed.filter((t) => t.net > 0).length;
  const last = candles[candles.length - 1];
  const active = game?.status === "active";
  const revealSymbol = !!game && game.status !== "active";
  const plannedEntry =
    orderType === "market"
      ? slip(game?.last ?? 100, side)
      : orderType === "stop-limit"
        ? +limitPrice
        : +entry;
  const stopDistance = Math.abs(plannedEntry - +sl);
  const qty =
    stopDistance > 0 && Number.isFinite(stopDistance)
      ? (balance * settings.risk) / 100 / stopDistance
      : 0;
  const riskAmount = (balance * settings.risk) / 100;
  const openSettings = () => {
    setDraft(settings);
    setModal("settings");
  };
  return (
    <main className={`app-shell ${game ? "has-session" : ""}`}>
      <header className="topbar">
        <a href="/" className="brand" aria-label="Price Action home">
          <span className="brand-symbol">
            <Icon name="chart" size={22} />
          </span>
          <span>
            price<span className="brand-light">action</span>
          </span>
        </a>
        <div className="header-actions">
          <button className="text-button" onClick={() => setModal("rules")}>
            <Icon name="book" />
            <span>How to play</span>
          </button>
          <button
            className="history-button"
            onClick={() => {
              setSelected(null);
              setModal("history");
            }}
          >
            <Icon name="history" />
            <span>Statistics</span>
            {saved.length > 0 && <b>{saved.length}</b>}
          </button>
          <button
            className="icon-button"
            onClick={openSettings}
            aria-label="Settings"
          >
            <Icon name="settings" />
          </button>
          <button
            className="theme-switch icon-button"
            aria-label={`Switch to ${settings.theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${settings.theme === "dark" ? "light" : "dark"} mode`}
            onClick={() => {
              const updated = {
                ...settings,
                theme: (settings.theme === "dark" ? "light" : "dark") as Theme,
              };
              setSettings(updated);
              try {
                saveSettings(updated);
              } catch {
                setToast("Theme changed, but browser storage is unavailable.");
              }
            }}
          >
            <Icon name={settings.theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <Icon name="info" />
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className={`workspace ${chartExpanded ? "is-wide" : ""}`}>
        <ResizableChartPanels
          expanded={false}
          touchLayout={touchLayout}
          activityVisible={activityVisible}
        >
          <section className="chart-panel panel">
            <div className="chart-heading">
              <div className="instrument">
                <span
                  className={`bitcoin ${!revealSymbol ? "hidden-symbol" : ""}`}
                >
                  {!revealSymbol ? <Icon name="shield" size={20} /> : "₿"}
                </span>
                <div>
                  <strong>
                    {!revealSymbol ? (
                      <>Hidden market</>
                    ) : (
                      <>
                        BTC <span>/ USDT</span>
                      </>
                    )}
                  </strong>
                  <small>PERPETUAL · HISTORICAL REPLAY</small>
                </div>
                <button
                  className="blind-badge icon-button"
                  aria-label="About blind mode"
                  onClick={(event) => event.currentTarget.focus()}
                  aria-describedby="blind-mode-help"
                >
                  <Icon name="help" size={18} />
                  <span className="tooltip" id="blind-mode-help" role="tooltip">
                    {revealSymbol
                      ? "Turn complete. Real prices and UTC dates are now visible."
                      : "Prices are normalized to 100 and dates are hidden during play. Real prices and UTC dates are revealed after the turn."}
                  </span>
                </button>
                <span className="interval-badge">
                  {session?.interval ?? settings.interval}
                </span>
              </div>
              <div className="chart-heading-actions">
                <button
                  className="chart-width-button"
                  aria-label={
                    chartExpanded ? "Restore layout" : "Expand chart width"
                  }
                  title={
                    chartExpanded ? "Restore layout" : "Expand chart width"
                  }
                  aria-pressed={chartExpanded}
                  onClick={() => setChartExpanded((v) => !v)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path
                      d={
                        chartExpanded
                          ? "M9 3v6H3m12-6v6h6M3 15h6v6m6 0v-6h6"
                          : "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"
                      }
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="ohlc-bar">
              {last ? (
                <>
                  <span>
                    O{" "}
                    <b>
                      {chartPrice(
                        last.open,
                        revealSymbol ? session?.factor : null,
                      )}
                    </b>
                  </span>
                  <span>
                    H{" "}
                    <b>
                      {chartPrice(
                        last.high,
                        revealSymbol ? session?.factor : null,
                      )}
                    </b>
                  </span>
                  <span>
                    L{" "}
                    <b>
                      {chartPrice(
                        last.low,
                        revealSymbol ? session?.factor : null,
                      )}
                    </b>
                  </span>
                  <span>
                    C{" "}
                    <b className={tone(last.close - last.open)}>
                      {chartPrice(
                        last.close,
                        revealSymbol ? session?.factor : null,
                      )}
                    </b>
                  </span>
                  <span className="bar-count">
                    {game?.bars ?? 0} candles revealed
                  </span>
                </>
              ) : (
                <>
                  <span>Awaiting chart</span>
                  <span>Free historical market data</span>
                  <span className="bar-count">No future data shown</span>
                </>
              )}
            </div>
            {candles.length ? (
              <PriceChart
                key={session?.cursor}
                candles={candles}
                revealFactor={revealSymbol ? session?.factor : null}
                lines={lines}
                fills={
                  game?.fills
                    .slice(turnFillStart.current)
                    .filter(
                      (f) =>
                        f.time >= candles[0].time &&
                        f.time <= (last?.time ?? 0),
                    ) ?? []
                }
                anchor={session?.candles.length ?? 0}
                onAddProtection={addPositionProtection}
                onCancelLine={onCancelLine}
                onLine={onLine}
                onLinePreview={onLinePreview}
                onDragStart={() => {
                  setPlaying(false);
                  stopHold();
                }}
                textScale={DISPLAY_SIZES[settings.displaySize]}
                theme={settings.theme}
                canTrade={active && !loading}
                onPrepareOrder={prepareChartOrder}
              />
            ) : (
              <div className="empty-chart">
                <div className="empty-illustration">
                  <svg viewBox="0 0 220 100" fill="none" aria-hidden="true">
                    <path
                      d="M0 76h220M0 35h220"
                      stroke="#283232"
                      strokeDasharray="4 5"
                    />
                    {[
                      [30, 45, 70],
                      [60, 31, 60],
                      [90, 42, 68],
                      [120, 24, 54],
                      [150, 15, 42],
                      [180, 21, 45],
                    ].map(([x, y, end], i) => (
                      <g
                        key={x}
                        stroke={i === 2 || i === 5 ? "#a16a6a" : "#82b991"}
                      >
                        <path d={`M${x} ${y - 11}v${end - y + 22}`} />
                        <rect
                          x={x - 6}
                          y={y}
                          width="12"
                          height={end - y}
                          rx="1"
                          fill={i === 2 || i === 5 ? "#34292a" : "#253b30"}
                        />
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="eyebrow">LESS NOISE. MORE INSTINCT.</div>
                <h2>Your next session starts here.</h2>
                <p>
                  A random moment in market history.
                  <br />
                  No dates. No familiar prices. Just price action.
                </p>
                <button
                  className="primary-button large"
                  disabled={loading}
                  onClick={() => void loadTurn("new")}
                >
                  {loading ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="play" />
                  )}{" "}
                  {loading ? loadMessage : "Start a new game"}
                  {!loading && <Icon name="arrow" />}
                </button>
                <div className="empty-notes">
                  <span>$10,000 starting balance</span>
                  <span>20 turns</span>
                  <span>100% simulated</span>
                </div>
              </div>
            )}
            {loading && candles.length > 0 && (
              <div className="loading-overlay">
                <span className="spinner" /> {loadMessage}
              </div>
            )}
            <div className="replay-toolbar">
              <div className="playback-buttons">
                <button
                  className={`play-button ${playing ? "is-playing" : ""}`}
                  disabled={!active || loading}
                  onClick={() => {
                    stopHold();
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? "Pause replay" : "Play replay"}
                >
                  <Icon name={playing ? "pause" : "play"} />
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  className="next-button"
                  disabled={!active || loading}
                  onPointerDown={(e) => {
                    if (e.button === 0) beginHold();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) void step();
                  }}
                  onPointerLeave={stopHold}
                >
                  <Icon name="next" />
                  <span>Next</span>
                  <kbd>→</kbd>
                </button>
                <select
                  aria-label="Replay speed"
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  {[1, 2, 5, 10, 20].map((s) => (
                    <option key={s} value={s}>
                      {s}× speed
                    </option>
                  ))}
                </select>

                <button
                  className="next-button repick"
                  disabled={!active || !!game?.traded || loading}
                  title={
                    game?.traded
                      ? "Repick is locked after your first submitted order."
                      : "Find another chart without using a turn"
                  }
                  onClick={() => void loadTurn("repick")}
                >
                  <Icon name="refresh" size={15} />
                  Repick
                </button>
                <button
                  className="icon-button chart-help-button"
                  aria-label="Chart help"
                  title="Chart help"
                  onClick={() => setModal("chart-help")}
                >
                  <Icon name="help" />
                </button>
              </div>
              {touchLayout && (
                <button
                  className="pane-switch"
                  aria-label={
                    activityVisible ? "Show chart" : "Show orders and activity"
                  }
                  aria-pressed={activityVisible}
                  onClick={() => {
                    stopHold();
                    setPlaying(false);
                    setChartExpanded(false);
                    setActivityVisible((visible) => !visible);
                  }}
                >
                  <Icon name={activityVisible ? "chart" : "history"} />
                  {activityVisible ? "Chart" : "Orders & activity"}
                </button>
              )}
            </div>
          </section>
          <section className="panel activity-panel">
            <div className="activity-heading">
              <div>
                <h2>Orders & activity</h2>
                <span className="small-badge">
                  {game?.orders.length ?? 0} PENDING
                </span>
              </div>
              <span className="muted">
                {game?.traded
                  ? "Repick locked for this turn"
                  : "Your decisions, recorded."}
              </span>
            </div>
            <div className="activity-content">
              {game?.orders.map((o) => (
                <div className="pending-row" key={o.id}>
                  <span className={`position-badge ${o.side}`}>
                    {o.side.toUpperCase()}
                  </span>
                  <strong>
                    {orderTypeLabel(o.type)}
                    {o.type === "stop-limit" && o.triggered
                      ? " · Triggered"
                      : ""}
                  </strong>
                  <span>
                    {o.type === "stop-limit" ? "Trigger" : "Entry"}{" "}
                    <b>{price(o.entry)}</b>
                  </span>
                  {o.type === "stop-limit" && (
                    <span>
                      Limit <b>{price(o.limit!)}</b>
                    </span>
                  )}
                  <span>
                    SL <b>{price(o.sl)}</b>
                  </span>
                  <span>
                    TP <b>{o.tp ? price(o.tp) : "—"}</b>
                  </span>
                  <span>{o.qty.toFixed(3)} units</span>
                  <button
                    className="text-button negative"
                    disabled={loading}
                    onClick={() => safe((g) => cancelOrder(g, o.id))}
                  >
                    Cancel
                  </button>
                </div>
              ))}
              {game?.fills.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Side</th>
                        <th>Price</th>
                        <th>Size (units)</th>
                        <th>Fee (USDT)</th>
                        <th>Sequence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.fills
                        .slice(-50)
                        .reverse()
                        .map((f, i) => (
                          <tr key={`${f.time}-${i}`}>
                            <td>{f.action}</td>
                            <td
                              className={
                                f.side === "long" ? "positive" : "negative"
                              }
                            >
                              {f.side === "long" ? "Buy" : "Sell"}
                            </td>
                            <td>{price(f.price)}</td>
                            <td>{f.qty.toFixed(3)}</td>
                            <td>{money(f.fee)}</td>
                            <td className="muted">#{game.fills.length - i}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !game?.orders.length && (
                  <div className="activity-empty">
                    <Icon name="history" size={20} />
                    <span>Your orders and fills will appear here.</span>
                  </div>
                )
              )}
            </div>
          </section>
        </ResizableChartPanels>
        <aside className="trading-sidebar" aria-label="Order manager">
          <section className="panel order-panel">
            <div className="panel-title">
              <h2>Order ticket</h2>
              <div className="ticket-title-actions">
                <span className="small-badge">CROSS</span>
                {ticket && active && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Cancel order ticket"
                    title="Cancel order ticket"
                    onClick={cancelTicket}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            {!ticket || !active ? (
              <div className="ticket-empty">
                <div className="ticket-icon">
                  <Icon name="chart" size={27} />
                </div>
                <h3>
                  {game?.status === "turn-ended"
                    ? "A moment to reflect."
                    : game?.status === "finished"
                      ? "Practice becomes progress."
                      : "Wait for your setup."}
                </h3>
                <p>
                  {game?.status === "turn-ended"
                    ? "Your position is closed. Start the next turn when you’re ready."
                    : game?.status === "finished"
                      ? "Review your game, then come back with a fresh perspective."
                      : "Read the context, find your entry, and define your risk."}
                  {(!game || active) && (
                    <>
                      {" "}
                      <button
                        className="text-button inline-settings"
                        onClick={openSettings}
                      >
                        Settings
                      </button>
                    </>
                  )}
                </p>
                <button
                  className="secondary-button full"
                  disabled={!active || loading}
                  onClick={startTicket}
                >
                  Start trading <Icon name="arrow" size={16} />
                </button>
              </div>
            ) : (
              <>
                <div
                  className="order-tabs"
                  role="tablist"
                  aria-label="Order type"
                >
                  {ORDER_TYPES.map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={orderType === t}
                      className={orderType === t ? "active" : ""}
                      onClick={() => changeType(t)}
                    >
                      {orderTypeLabel(t)}
                    </button>
                  ))}
                </div>
                <div className="side-toggle">
                  <button
                    className={side === "long" ? "selected long" : ""}
                    onClick={() => changeSide("long")}
                  >
                    ↗ Buy / Long
                  </button>
                  <button
                    className={side === "short" ? "selected short" : ""}
                    onClick={() => changeSide("short")}
                  >
                    ↘ Sell / Short
                  </button>
                </div>
                <div className="leverage-row">
                  <span>Leverage</span>
                  <div>
                    {[2, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        className={leverage === n ? "active" : ""}
                        onClick={() => setLeverage(n)}
                      >
                        {n}×
                      </button>
                    ))}
                  </div>
                </div>
                <PriceInput
                  label={
                    orderType === "stop" || orderType === "stop-limit"
                      ? "Trigger price"
                      : "Entry price"
                  }
                  value={orderType === "market" ? price(game!.last) : entry}
                  set={updateEntry}
                  disabled={orderType === "market"}
                  hint={orderType === "market" ? "Market" : "Normalized"}
                />
                {orderType === "stop-limit" && (
                  <PriceInput
                    label="Limit price"
                    value={limitPrice}
                    set={setLimitPrice}
                    hint="After trigger"
                  />
                )}
                <div className="protection-inputs">
                  <PriceInput
                    label="Stop loss"
                    value={sl}
                    set={setSl}
                    hint="Required"
                    accent="red"
                  />
                  <PriceInput
                    label="Take profit"
                    value={tp}
                    set={setTp}
                    hint="Optional"
                    accent="green"
                  />
                </div>
                <div className="risk-box">
                  <div>
                    <span>Risk per trade</span>
                    <strong>
                      {settings.risk}% <small>/ ${money(riskAmount)}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Position size</span>
                    <strong>
                      {qty > 0 && qty < 1e12 ? qty.toFixed(3) : "—"}{" "}
                      <small>units</small>
                    </strong>
                  </div>
                  <div>
                    <span>Est. margin</span>
                    <strong>${money((qty * plannedEntry) / leverage)}</strong>
                  </div>
                  <div title="Planned gross profit : loss, before fees and exit slippage">
                    <span>Est. TP/SL ratio</span>
                    <strong>
                      {formatRatio(
                        profitLossRatio(
                          side,
                          plannedEntry,
                          +sl,
                          tp.trim() ? +tp : null,
                        ),
                      )}
                    </strong>
                  </div>
                </div>
                <button
                  className={`submit-order ${side}`}
                  disabled={loading}
                  onClick={placeOrder}
                >
                  {orderType === "market" ? "Open" : "Place"} {side}{" "}
                  {orderType !== "market" ? "order" : "position"}
                  <Icon name="arrow" size={17} />
                </button>
                <p className="ticket-footnote">
                  Drag the chart lines to fine-tune your entry and protection.
                </p>
              </>
            )}
          </section>
          <section className="panel position-panel">
            <div className="panel-title">
              <h2>Open position</h2>
              {game?.position ? (
                <span className={`position-badge ${game.position.side}`}>
                  {game.position.side.toUpperCase()} {game.position.leverage}×
                </span>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            {game?.position ? (
              <>
                <div className={`position-pnl ${tone(upnl)}`}>
                  {signed(upnl)}
                  <small>Unrealized P&L · USDT</small>
                </div>
                <div className="position-grid">
                  <Detail
                    label="Average entry"
                    value={price(game.position.entry)}
                  />
                  <Detail label="Last price" value={price(game.last)} />
                  <Detail
                    label="Size"
                    value={`${game.position.qty.toFixed(3)} units`}
                  />
                  <Detail
                    label="Liquidation"
                    value={price(liquidationPrice(game) ?? 0)}
                  />
                  <Detail
                    label="Used margin"
                    value={`$${money(margin(game))}`}
                  />
                  <Detail label="Equity" value={`$${money(equity(game))}`} />
                </div>
                <div className="close-fractions">
                  <span>Close</span>
                  {[0.25, 0.5, 0.75, 1].map((f) => (
                    <button
                      key={f}
                      disabled={!active || loading}
                      onClick={() => safe((g) => closePosition(g, f))}
                    >
                      {f * 100}%
                    </button>
                  ))}
                </div>
                <PositionProtection
                  position={game.position}
                  last={game.last}
                  sl={positionSL}
                  tp={positionTP}
                  disabled={!active || loading}
                  onSL={setPositionSL}
                  onTP={setPositionTP}
                  onAdd={addPositionProtection}
                  onCancel={(kind) => onCancelLine(`position-${kind}`)}
                  onApply={(nextSL, nextTP) =>
                    safe((g) => modifyProtection(g, nextSL, nextTP))
                  }
                />
              </>
            ) : (
              <div className="no-position">
                <span className="empty-dash">—</span>
                <p>No open position</p>
                <small>Your next opportunity is on the chart.</small>
              </div>
            )}
          </section>
          <section className="panel turn-status">
            <div className="panel-title">
              <h2>This turn</h2>
              <span className="muted">
                {game ? String(game.turn).padStart(2, "0") : "—"} / 20
              </span>
            </div>
            <Detail
              label="Realized P&L"
              value={signed(game ? balance - game.baseline : 0)}
              className={tone(game ? balance - game.baseline : 0)}
            />
            <Detail
              label="Unrealized P&L"
              value={signed(upnl)}
              className={tone(upnl)}
            />
            <Detail
              label="Fees paid"
              value={`$${money(game ? game.fees - game.feeBaseline : 0)}`}
            />
            <Detail
              label="Avg. TP/SL ratio"
              value={formatRatio(
                averageRatio([
                  ...closed.slice(game?.tradeBaseline ?? 0),
                  ...(game?.position ? [game.position] : []),
                ]),
              )}
            />
            <div className="turn-actions">
              {game?.status === "turn-ended" ? (
                <button
                  className="primary-button"
                  disabled={loading}
                  onClick={() => void loadTurn("next")}
                >
                  Next turn <Icon name="arrow" size={16} />
                </button>
              ) : game?.status === "finished" ? (
                <button
                  className="primary-button"
                  disabled={loading}
                  onClick={() => void loadTurn("new")}
                >
                  New game <Icon name="arrow" size={16} />
                </button>
              ) : (
                <button
                  className="finish-button"
                  disabled={!active || loading}
                  onClick={finish}
                >
                  <Icon name="flag" size={15} />
                  Finish turn
                </button>
              )}
            </div>
          </section>
          <section className="panel game-status" aria-label="Game statistics">
            <div className="panel-title">
              <h2>This game</h2>
              <GameProgress game={game} />
            </div>
            <Detail
              label="Status"
              value={
                !game
                  ? "Not started"
                  : game.status === "active"
                    ? "In progress"
                    : game.status === "turn-ended"
                      ? "Turn complete"
                      : "Complete"
              }
            />
            <Detail label="Balance" value={`$${money(balance)}`} />
            <Detail
              label="PnL"
              value={signed(balance - INITIAL_BALANCE)}
              className={tone(balance - INITIAL_BALANCE)}
            />
            <Detail label="uPnL" value={signed(upnl)} className={tone(upnl)} />
            <Detail
              label="Win rate"
              value={
                closed.length
                  ? `${((wins / closed.length) * 100).toFixed(1)}%`
                  : "—"
              }
            />
            <Detail label="Trades" value={String(closed.length)} />
            <Detail label="Fees" value={`$${money(game?.fees ?? 0)}`} />
            <Detail
              label="Avg. TP/SL ratio"
              value={formatRatio(
                averageRatio([
                  ...closed,
                  ...(game?.position ? [game.position] : []),
                ]),
              )}
            />
            <button
              className="secondary-button full restart-game"
              disabled={!game || loading}
              onClick={() => setModal("restart")}
            >
              <Icon name="refresh" size={16} />
              Restart game
            </button>
          </section>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {modal === "restart" && (
        <Modal title="Restart game?" close={() => setModal(null)}>
          <p>
            Your open position will close at the last visible price and pending
            orders will be canceled. This game’s trades will be saved in
            Statistics. A new game starts at $10,000.
          </p>
          <div className="restart-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              Keep playing
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setModal(null);
                stopHold();
                void loadTurn("restart");
              }}
            >
              Save record & restart
            </button>
          </div>
        </Modal>
      )}
      {modal === "chart-help" && (
        <Modal title="Chart help" close={() => setModal(null)}>
          <div className="chart-help-content">
            <p>
              On touch screens, tap the chart to inspect a price and bar. Drag
              to move the crosshair without panning; tap again to resume chart
              panning. On a computer, the crosshair follows the mouse.
            </p>
            <p>
              {game?.status === "turn-ended"
                ? "Turn complete · no more candles revealed"
                : game?.status === "finished"
                  ? "Game complete"
                  : session?.source === "local"
                    ? "Local history · Binance Futures"
                    : "Historical data · Binance Futures"}
            </p>
            <p>
              <kbd>Space</kbd> plays or pauses replay. Hold <kbd>→</kbd> or Next
              to advance at the selected speed.
            </p>
            <p>
              Repick chooses another chart without using a turn. It locks after
              your first submitted order.
            </p>
            <p>
              Finish turn cancels pending orders and closes your position at the
              last displayed candle without revealing future candles.
            </p>
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
            >
              Charts by TradingView ↗
            </a>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Your practice, your rules."
          subtitle="Settings are saved on this browser."
          close={() => setModal(null)}
        >
          <div className="settings-balance">
            <span>Starting balance</span>
            <strong>
              $10,000 <small>USDT</small>
            </strong>
            <p>Resets with every new game. Carries across all 20 turns.</p>
          </div>
          <div className="settings-execution">
            <span>Execution model</span>
            <p>Simulated execution · 0.01% market slippage · No funding</p>
          </div>
          <label className="field-label">
            Risk per trade <span>% of account balance</span>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.1"
              value={draft.risk}
              onChange={(e) =>
                setDraft((d) => ({ ...d, risk: +e.target.value }))
              }
            />
          </label>
          <p className="input-help">
            Position size = balance × risk % ÷ stop distance. Fees and slippage
            are additional.
          </p>
          <label className="field-label">
            Candle interval <span>Applies on the next chart</span>
            <select
              value={draft.interval}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  interval: e.target.value as Interval,
                }))
              }
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {
                    {
                      "5m": "5 minutes",
                      "15m": "15 minutes",
                      "30m": "30 minutes",
                      "1h": "1 hour",
                      "4h": "4 hours",
                      "1d": "1 day",
                    }[i]
                  }
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Appearance <span>Chart and interface</span>
            <select
              value={draft.theme}
              onChange={(event) =>
                setDraft((d) => ({ ...d, theme: event.target.value as Theme }))
              }
            >
              <option value="dark">Dark mode</option>
              <option value="light">Light mode</option>
            </select>
          </label>
          <label className="field-label">
            Display size <span>Text, controls, and chart labels</span>
            <select
              value={draft.displaySize}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  displaySize: event.target.value as DisplaySize,
                }))
              }
            >
              <option value="half">Half size (-50%)</option>
              <option value="small">Small (-30%)</option>
              <option value="compact">Compact (-15%)</option>
              <option value="comfortable">Comfortable (default)</option>
              <option value="large">Large (+15%)</option>
              <option value="extra-large">Extra large (+30%)</option>
              <option value="huge">Huge (+50%)</option>
            </select>
          </label>
          <button
            className="primary-button full"
            onClick={() => {
              if (
                !Number.isFinite(draft.risk) ||
                draft.risk <= 0 ||
                draft.risk > 100
              ) {
                setToast("Risk must be greater than 0 and no more than 100%.");
                return;
              }
              setSettings(draft);
              try {
                saveSettings(draft);
              } catch {
                setToast(
                  "Settings apply now, but browser storage is unavailable.",
                );
              }
              setModal(null);
            }}
          >
            Save settings <Icon name="check" size={17} />
          </button>
          <p className="modal-note">
            Active games are not saved. Refreshing starts a fresh session.
          </p>
        </Modal>
      )}
      {modal === "history" && (
        <Modal
          title={
            selected
              ? selected.id === "current"
                ? "Your game, so far."
                : selected.liquidated
                  ? "A lesson to take forward."
                  : "Every session tells a story."
              : "Your practice journal."
          }
          subtitle={
            selected
              ? "Game summary · net results include all trading fees"
              : "Your last 10 completed or restarted games, saved on this browser."
          }
          close={() => setModal(null)}
          wide
        >
          {!selected && game && game.status !== "finished" && (
            <button
              className="secondary-button full current-summary"
              onClick={() => setSelected({ ...summarize(game), id: "current" })}
            >
              View current game{" "}
              <span>
                Turn {game.turn} / 20 <Icon name="arrow" size={15} />
              </span>
            </button>
          )}
          {selected ? (
            <SummaryView summary={selected} back={() => setSelected(null)} />
          ) : saved.length ? (
            <div className="history-list">
              {saved.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)}>
                  <span>
                    <strong>
                      {new Date(s.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </strong>
                    <small>
                      {s.turns.length} turns · {s.trades.length} trades
                      {s.liquidated
                        ? " · Liquidated"
                        : s.restarted
                          ? " · Restarted"
                          : ""}
                    </small>
                  </span>
                  <strong className={tone(s.net)}>
                    {signed(s.net)} <Icon name="arrow" size={16} />
                  </strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              <Icon name="history" size={38} />
              <h3>Your story starts with one game.</h3>
              <p>Complete 20 turns to save your first summary.</p>
            </div>
          )}
        </Modal>
      )}
      {modal === "rules" && (
        <Modal
          title="Train the decision. Not the hindsight."
          subtitle="Twenty turns. A new perspective each time."
          close={() => setModal(null)}
          wide
        >
          <div className="rules-grid">
            <article>
              <span>01</span>
              <h3>Read the context</h3>
              <p>
                Start with 500–1,500 real{" "}
                {revealSymbol ? "BTCUSDT perpetual" : "market"} candles. Prices
                are scaled so the initial close is 100. Dates stay hidden.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Define your risk</h3>
              <p>
                Choose a market, limit, stop-market, or stop-limit entry. A stop
                loss is required for entry sizing; take profit is optional. Size
                is calculated automatically from your balance and risk. Once
                filled, position SL and TP can be canceled, re-added, or edited.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Let it unfold</h3>
              <p>
                Play or hold Next / the right arrow at the selected 1×–20×
                speed. Each new candle executes orders before the next one is
                shown.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Reflect, then repeat</h3>
              <p>
                Finish a turn at any time: pending orders cancel and the
                position closes at the visible close with slippage. Complete 20
                turns to finish the game. Liquidation ends it early.
              </p>
            </article>
          </div>
          <div className="execution-rules">
            <h3>Execution rules</h3>
            <p>
              SL is evaluated before TP when both are touched. Gaps fill stops
              at the worse opening price; limits can receive a better opening
              price. A newly filled entry uses the full candle’s range for
              conservative protection checks. Opposite orders reduce or reverse
              your position. Adding to a position applies the newest SL, TP, and
              leverage to the combined position.
            </p>
            <p>
              Market and stop fills have 0.01% adverse slippage. Every fill pays
              0.05%. Pending orders reserve margin. Cross-margin liquidation
              uses a fixed 0.5% maintenance rate and candle prices, without
              funding or mark-price feeds. Quantities are normalized units, not
              literal units of the underlying asset. Trade statistics count
              fully closed position cycles; partial closes belong to the same
              trade.
            </p>
            <p>
              Repick is permanently locked for the turn after an order is
              successfully submitted. No fixed replay length. Reaching the
              latest closed candle finishes the turn. Settings and completed
              games are local; active games disappear on refresh. Direct market
              data needs an internet connection. Installed historical archives
              can be replayed offline.
            </p>
          </div>
          <button
            className="primary-button full"
            onClick={() => setModal(null)}
          >
            Back to the chart <Icon name="arrow" size={17} />
          </button>
        </Modal>
      )}
    </main>
  );
}
function Detail({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}
function PriceInput({
  label,
  hint,
  value,
  set,
  disabled = false,
  accent = "",
}: {
  label: string;
  hint?: string;
  value: string;
  set: (value: string) => void;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <label className={`price-input ${accent}`}>
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <div>
        <input
          aria-label={label}
          type="number"
          min="0.000001"
          step="any"
          placeholder="—"
          value={value}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
        />
        <span>{disabled ? "≈" : ""}</span>
      </div>
    </label>
  );
}
function SummaryView({
  summary: s,
  back,
}: {
  summary: Summary;
  back: () => void;
}) {
  const wins = s.trades.filter((t) => t.net > 0).length;
  const profits = s.trades.reduce((a, t) => a + Math.max(t.net, 0), 0),
    losses = s.trades.reduce((a, t) => a + Math.max(-t.net, 0), 0);
  const values = [INITIAL_BALANCE, ...s.turns.map((t) => t.balance)];
  const low = Math.min(...values),
    high = Math.max(...values);
  const span = high - low || 1;
  let peak = INITIAL_BALANCE,
    drawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    drawdown = Math.max(drawdown, ((peak - value) / peak) * 100);
  }
  const path = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${20 + (i / Math.max(1, values.length - 1)) * 640},${140 - ((v - low) / span) * 115}`,
    )
    .join(" ");
  return (
    <>
      <SummaryExport summary={s} />
      <div className="summary-top">
        <div>
          <span>
            {s.id === "current" ? "CURRENT BALANCE" : "FINAL BALANCE"}
          </span>
          <h3>${money(s.balance)}</h3>
        </div>
        <div className={tone(s.net)}>
          <strong>{signed(s.net)}</strong>
          <span>{signed((s.net / INITIAL_BALANCE) * 100)}% return</span>
        </div>
      </div>
      {s.id === "current" && (
        <p className="input-help">
          Realized results so far. Open-position P&L is shown on the dashboard;
          the balance plot includes completed turns.
        </p>
      )}
      <div className="summary-metrics">
        <Detail
          label="Win rate"
          value={
            s.trades.length
              ? `${((wins / s.trades.length) * 100).toFixed(1)}%`
              : "—"
          }
        />
        <Detail label="Closed trades" value={String(s.trades.length)} />
        <Detail
          label="Profit factor"
          value={losses ? (profits / losses).toFixed(2) : profits ? "∞" : "—"}
        />
        <Detail
          label="Avg. TP/SL ratio"
          value={formatRatio(averageRatio(s.trades))}
        />
        <Detail label="Total fees" value={`$${money(s.fees)}`} />
        <Detail label="Turn-end drawdown" value={`${drawdown.toFixed(2)}%`} />
        <Detail label="Turns" value={`${s.turns.length} / 20`} />
      </div>
      <div className="equity-chart">
        <span>BALANCE BY COMPLETED TURN</span>
        <svg
          viewBox="0 0 680 165"
          role="img"
          aria-label="Account balance at each completed turn"
        >
          <path
            d="M20 25h640M20 82h640M20 140h640"
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <path
            d={`${path} L660 155 L20 155 Z`}
            fill={s.net >= 0 ? "var(--green)" : "var(--red)"}
            fillOpacity=".08"
          />
          <path
            d={path}
            fill="none"
            stroke={s.net >= 0 ? "var(--green)" : "var(--red)"}
            strokeWidth="2.5"
          />
        </svg>
        <div>
          <span>START · $10,000</span>
          <span>
            TURN {s.turns.length} · ${money(values[values.length - 1])}
          </span>
        </div>
      </div>
      <div className="table-scroll summary-table">
        <table>
          <thead>
            <tr>
              <th>Turn</th>
              <th>Trades</th>
              <th>Candles</th>
              <th>Fees</th>
              <th>Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {s.turns.map((t) => (
              <tr key={t.number}>
                <td>{String(t.number).padStart(2, "0")}</td>
                <td>{t.trades}</td>
                <td>{t.bars}</td>
                <td>${money(t.fees)}</td>
                <td className={tone(t.net)}>{signed(t.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.trades.length > 0 && (
        <details className="summary-trades">
          <summary>Review {s.trades.length} closed trades</summary>
          <div className="table-scroll summary-table">
            <table>
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Final exit</th>
                  <th>Planned TP/SL</th>
                  <th>Net P&L</th>
                  <th>Exit reason</th>
                </tr>
              </thead>
              <tbody>
                {s.trades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.side}</td>
                    <td>{price(t.entry)}</td>
                    <td>{price(t.exit)}</td>
                    <td>{formatRatio(t.plannedRatio)}</td>
                    <td className={tone(t.net)}>{signed(t.net)}</td>
                    <td>{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <button className="secondary-button full" onClick={back}>
        All completed games <Icon name="history" size={16} />
      </button>
    </>
  );
}

function GameProgress({ game }: { game: Game | null }) {
  return (
    <div className="game-progress" aria-label="Current turn">
      <strong>
        {game ? String(game.turn).padStart(2, "0") : "—"} <span>/ 20</span>
      </strong>
    </div>
  );
}
