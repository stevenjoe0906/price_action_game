"use client";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import {
  drawingHistory,
  emptyDrawings,
  measure,
  moveDrawing,
  rayEnd,
  type Drawing,
  type DrawingColor,
  type DrawingKind,
  type DrawingPoint,
} from "@/lib/drawings";

type Props = {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  textScale: number;
  onInteract: () => void;
  expanded: boolean;
  onExpand: () => void;
  contextOpen?: boolean;
  onNavigationLock?: (locked: boolean) => void;
};
type Tool = "cursor" | DrawingKind;
type Edit = {
  original: Drawing;
  start: DrawingPoint;
  handle: "move" | "from" | "to";
  preview: Drawing;
};
const tools: { id: Tool; name: string; path: string }[] = [
  { id: "cursor", name: "Cursor / select", path: "m5 3 13 10-7 1-3 7Z" },
  {
    id: "trend",
    name: "Trendline",
    path: "M4 19 20 5M4 17v4m-2-2h4M20 3v4m-2-2h4",
  },
  { id: "ray", name: "Ray", path: "M4 18 20 6m-5 0h5v5M4 16v4m-2-2h4" },
  { id: "horizontal", name: "Horizontal line", path: "M2 12h20M6 10v4" },
  { id: "vertical", name: "Vertical line", path: "M12 2v20M10 6h4" },
  { id: "rectangle", name: "Rectangle", path: "M4 5h16v14H4Z" },
  {
    id: "measure",
    name: "Price range / percentage ruler",
    path: "M6 3v18m-3-3 3 3 3-3M3 6l3-3 3 3m4 0h8M13 18h8M17 6v12m-2-9h4m-4 3h4m-4 3h4",
  },
];
function Glyph({ path }: { path: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
export default function ChartDrawings({
  chart,
  series,
  textScale,
  onInteract,
  expanded,
  onExpand,
  contextOpen = false,
  onNavigationLock,
}: Props) {
  const [history, dispatch] = useReducer(drawingHistory, emptyDrawings);
  const [tool, setTool] = useState<Tool>("cursor");
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [color, setColor] = useState<DrawingColor>("blue");
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [dragging, setDragging] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const down = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const nextId = useRef(1);
  const live = useRef({ tool, selected, draft, edit, history });
  live.current = { tool, selected, draft, edit, history };
  const callbacks = useRef(onInteract);
  callbacks.current = onInteract;
  const size = chart?.paneSize() ?? { width: 0, height: 0 };
  const point = (event: ReactPointerEvent<SVGElement>): DrawingPoint | null => {
    if (!svg.current || !chart || !series) return null;
    const bounds = svg.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(size.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(size.height, event.clientY - bounds.top));
    const logical = chart.timeScale().coordinateToLogical(x),
      price = series.coordinateToPrice(y);
    return logical === null ||
      price === null ||
      !Number.isFinite(price) ||
      price <= 0
      ? null
      : { logical, price };
  };
  const screen = (p: DrawingPoint) => {
    const x = chart?.timeScale().logicalToCoordinate(p.logical as Logical),
      y = series?.priceToCoordinate(p.price);
    return x == null || y == null ? null : { x, y };
  };
  const cancel = () => {
    releasePointer();
    setDragging(false);
    setDraft(null);
    setEdit(null);
    down.current = null;
    setTool("cursor");
  };
  const releasePointer = () => {
    const pointer = down.current?.pointer;
    down.current = null;
    if (pointer !== undefined && svg.current?.hasPointerCapture?.(pointer))
      svg.current.releasePointerCapture(pointer);
  };
  useEffect(() => {
    const surface = svg.current?.parentElement;
    if (!surface || (tool === "cursor" && !selected && !edit)) return;
    // Set on the HTML ancestor before a touch starts, not only on SVG shapes.
    const previous = surface.style.touchAction;
    surface.style.touchAction = "none";
    return () => {
      surface.style.touchAction = previous;
    };
  }, [tool, selected, !!edit]);
  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousSelect = body.style.userSelect;
    body.style.overflow = "hidden";
    body.style.userSelect = "none";
    const preventScroll = (event: TouchEvent) => event.preventDefault();
    window.addEventListener("touchmove", preventScroll, { passive: false });
    return () => {
      body.style.overflow = previousOverflow;
      body.style.userSelect = previousSelect;
      window.removeEventListener("touchmove", preventScroll);
    };
  }, [dragging]);
  useEffect(() => {
    if (contextOpen) {
      cancel();
      setSelected(null);
    }
  }, [contextOpen]);
  const choose = (value: Tool) => {
    cancel();
    setTool(value);
    setHidden(false);
    if (value !== "cursor") {
      setSelected(null);
      onInteract();
    }
  };
  useEffect(() => {
    const locked = tool !== "cursor" || !!edit;
    if (onNavigationLock) {
      onNavigationLock(locked);
      return () => onNavigationLock(false);
    }
    chart?.applyOptions({ handleScroll: !locked, handleScale: !locked });
  }, [chart, tool, !!edit, onNavigationLock]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        document.querySelector('[role="dialog"]') ||
        (event.target instanceof HTMLElement &&
          (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName) ||
            event.target.isContentEditable))
      )
        return;
      const current = live.current;
      if (
        event.key === "Escape" &&
        (current.tool !== "cursor" ||
          current.draft ||
          current.edit ||
          current.selected)
      ) {
        event.preventDefault();
        cancel();
        setSelected(null);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        current.selected
      ) {
        event.preventDefault();
        dispatch({ type: "remove", id: current.selected });
        setSelected(null);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        cancel();
        setSelected(null);
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
    };
    const blur = () => {
      if (live.current.edit || live.current.draft) cancel();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    const surface = svg.current?.parentElement;
    const deselect = (event: PointerEvent) => {
      if (
        live.current.tool === "cursor" &&
        event.target instanceof Element &&
        event.target.closest(".chart-canvas")
      )
        setSelected(null);
    };
    surface?.addEventListener("pointerdown", deselect);
    return () => surface?.removeEventListener("pointerdown", deselect);
  }, []);
  const finish = (drawing: Drawing) => {
    releasePointer();
    setDragging(false);
    dispatch({ type: "add", drawing });
    setDraft(null);
    setTool("cursor");
    setSelected(drawing.id);
    down.current = null;
  };
  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || tool === "cursor" || down.current) return;
    const p = point(event);
    if (!p) return;
    event.preventDefault();
    event.stopPropagation();
    callbacks.current();
    if (draft) {
      finish({ ...draft, to: p });
      return;
    }
    const drawing: Drawing = {
      id: `drawing-${nextId.current++}`,
      kind: tool,
      from: p,
      to: p,
      color,
    };
    if (tool === "horizontal" || tool === "vertical") {
      finish(drawing);
      return;
    }
    down.current = {
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setDraft(drawing);
  };
  const editAt = (current: Edit, p: DrawingPoint): Drawing => {
    if (current.handle === "move")
      return moveDrawing(current.original, current.start, p);
    const original = current.original[current.handle];
    return {
      ...current.original,
      [current.handle]: {
        logical: original.logical + (p.logical - current.start.logical),
        price: original.price + (p.price - current.start.price),
      },
    };
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (down.current && event.pointerId !== down.current.pointer) return;
    if (down.current) event.preventDefault();
    const p = point(event);
    if (!p) return;
    if (edit) {
      const moved = editAt(edit, p);
      if (moved.from.price > 0 && moved.to.price > 0)
        setEdit({ ...edit, preview: moved });
    } else if (draft) setDraft({ ...draft, to: p });
  };
  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!down.current || event.pointerId !== down.current.pointer) return;
    const moved =
      Math.hypot(
        event.clientX - down.current.x,
        event.clientY - down.current.y,
      ) >= 4;
    releasePointer();
    down.current = null;
    setDragging(false);
    if (edit) {
      const p = point(event);
      const result = p ? editAt(edit, p) : edit.preview;
      if (moved && result.from.price > 0 && result.to.price > 0)
        dispatch({ type: "update", drawing: result });
      setEdit(null);
    } else if (draft && moved)
      finish({ ...draft, to: point(event) ?? draft.to });
  };
  const beginEdit = (
    event: ReactPointerEvent<SVGElement>,
    drawing: Drawing,
    handle: Edit["handle"],
  ) => {
    if (tool !== "cursor" || event.button !== 0 || down.current) return;
    const p = point(event);
    if (!p || !svg.current) return;
    if (
      handle !== "move" &&
      !["horizontal", "vertical"].includes(drawing.kind)
    ) {
      // Enlarged targets may overlap on short lines: choose the nearest endpoint.
      const a = screen(drawing.from),
        b = screen(drawing.to);
      const bounds = svg.current.getBoundingClientRect();
      const x = event.clientX - bounds.left,
        y = event.clientY - bounds.top;
      if (a && b)
        handle =
          Math.hypot(x - a.x, y - a.y) < Math.hypot(x - b.x, y - b.y)
            ? "from"
            : "to";
    }
    event.stopPropagation();
    event.preventDefault();
    callbacks.current();
    svg.current.setPointerCapture(event.pointerId);
    down.current = {
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerId,
    };
    setDragging(true);
    setSelected(drawing.id);
    setColor(drawing.color);
    setEdit({ original: drawing, start: p, preview: drawing, handle });
  };
  const all = [
    ...history.present.map((d) =>
      edit?.original.id === d.id ? edit.preview : d,
    ),
    ...(draft ? [draft] : []),
  ];
  const renderDrawing = (drawing: Drawing) => {
    const a = screen(drawing.from),
      b = screen(drawing.to);
    if (!a || !b) return null;
    const active = selected === drawing.id || draft?.id === drawing.id;
    const stroke = `var(--drawing-${drawing.color})`;
    const metric = measure(drawing.from, drawing.to);
    const positive = metric.change >= 0;
    const end =
      drawing.kind === "ray" ? rayEnd(a, b, size.width, size.height) : b;
    const from =
      drawing.kind === "horizontal"
        ? { x: 0, y: a.y }
        : drawing.kind === "vertical"
          ? { x: a.x, y: 0 }
          : a;
    const to =
      drawing.kind === "horizontal"
        ? { x: size.width, y: a.y }
        : drawing.kind === "vertical"
          ? { x: a.x, y: size.height }
          : end;
    const box = drawing.kind === "rectangle" || drawing.kind === "measure";
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y),
      width = Math.abs(b.x - a.x),
      height = Math.abs(b.y - a.y);
    const label = `${metric.percent >= 0 ? "+" : ""}${metric.percent.toFixed(2)}%  ·  ${metric.change >= 0 ? "+" : ""}${metric.change.toFixed(4)}  ·  ${metric.bars} bars`;
    const labelWidth = Math.min(
      size.width - 12,
      Math.max(130, label.length * 7.2 * textScale),
    );
    const labelX = Math.max(
      labelWidth / 2 + 4,
      Math.min(size.width - labelWidth / 2 - 4, (a.x + b.x) / 2),
    );
    const labelY = Math.max(
      18 * textScale,
      Math.min(size.height - 18 * textScale, y - 17 * textScale),
    );
    return (
      <g
        key={drawing.id}
        className={`drawing-shape ${active ? "selected" : ""}`}
        onPointerDown={(event) => beginEdit(event, drawing, "move")}
        style={{ color: stroke }}
      >
        {box ? (
          <>
            <rect
              x={x}
              y={y}
              width={Math.max(1, width)}
              height={Math.max(1, height)}
              fill={
                drawing.kind === "measure"
                  ? positive
                    ? "var(--green)"
                    : "var(--red)"
                  : stroke
              }
              fillOpacity=".08"
              stroke={stroke}
              strokeWidth={active ? 2 : 1.5}
              strokeDasharray={drawing.kind === "measure" ? "5 4" : undefined}
              pointerEvents="all"
            />
            <rect
              x={x}
              y={y}
              width={Math.max(1, width)}
              height={Math.max(1, height)}
              fill="none"
              stroke="transparent"
              strokeWidth="14"
              pointerEvents="stroke"
            />
          </>
        ) : (
          <>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={stroke}
              strokeWidth={active ? 2.5 : 1.5}
              pointerEvents="none"
            />
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="transparent"
              strokeWidth="14"
              pointerEvents="stroke"
            />
          </>
        )}
        {drawing.kind === "measure" && (
          <g transform={`translate(${labelX}, ${labelY})`}>
            <rect
              x={-labelWidth / 2}
              y={-13 * textScale}
              width={labelWidth}
              height={26 * textScale}
              rx="4"
              fill="var(--panel-raised)"
              stroke="var(--border-strong)"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill={positive ? "var(--green)" : "var(--red)"}
              fontSize={12 * textScale}
              fontFamily="monospace"
            >
              {label}
            </text>
          </g>
        )}
        {active &&
          !draft &&
          (
            [
              ["from", a],
              ...(["horizontal", "vertical"].includes(drawing.kind)
                ? []
                : [["to", b]]),
            ] as ["from" | "to", { x: number; y: number }][]
          ).map(([handle, p]) => (
            <g key={handle} className="drawing-endpoint">
              <circle
                cx={p.x}
                cy={p.y}
                r={Math.max(22, 12 * textScale)}
                fill="transparent"
                pointerEvents="all"
                className="drawing-handle"
                data-handle={handle}
                aria-label={`Resize ${handle === "from" ? "start" : "end"} of ${drawing.kind}`}
                onPointerDown={(event) => beginEdit(event, drawing, handle)}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={Math.max(6, 5 * textScale)}
                fill="var(--panel)"
                stroke={stroke}
                strokeWidth="2"
                pointerEvents="none"
              />
            </g>
          ))}
      </g>
    );
  };
  return (
    <>
      <div
        className="drawing-toolbar"
        role="toolbar"
        aria-label="Chart drawing tools"
      >
        {tools.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? "active" : ""}
            aria-pressed={tool === t.id}
            aria-label={t.name}
            title={t.name}
            onClick={() => choose(t.id)}
          >
            <Glyph path={t.path} />
          </button>
        ))}
        <div className="drawing-divider" />
        <button
          aria-label="Undo drawing"
          title="Undo drawing (Ctrl+Z)"
          disabled={!history.past.length}
          onClick={() => {
            cancel();
            setSelected(null);
            dispatch({ type: "undo" });
          }}
        >
          <Glyph path="M4 10h9a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5" />
        </button>
        <button
          aria-label="Redo drawing"
          title="Redo drawing (Ctrl+Shift+Z)"
          disabled={!history.future.length}
          onClick={() => {
            cancel();
            setSelected(null);
            dispatch({ type: "redo" });
          }}
        >
          <Glyph path="M20 10h-9a6 6 0 0 0 0 12m9-12-5-5m5 5-5 5" />
        </button>
        <button
          aria-label={hidden ? "Show drawings" : "Hide drawings"}
          title={hidden ? "Show drawings" : "Hide drawings"}
          aria-pressed={hidden}
          onClick={() => {
            cancel();
            setSelected(null);
            setHidden((v) => !v);
          }}
        >
          <Glyph
            path={
              hidden
                ? "m3 3 18 18M10 5h2c6 0 10 7 10 7s-2 3-5 5M6 6c-3 2-4 6-4 6s4 7 10 7h2"
                : "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0"
            }
          />
        </button>
        <button
          aria-label={selected ? "Delete selected drawing" : "Clear drawings"}
          title={
            selected
              ? "Delete selected drawing"
              : "Clear all drawings (undo available)"
          }
          disabled={!history.present.length}
          onClick={() => {
            cancel();
            dispatch(
              selected ? { type: "remove", id: selected } : { type: "clear" },
            );
            setSelected(null);
          }}
        >
          <Glyph path="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
        </button>
        <div className="drawing-divider" />
        <div className="drawing-colors" aria-label="Drawing color">
          {(["blue", "accent", "green", "red"] as DrawingColor[]).map(
            (value) => (
              <button
                key={value}
                aria-label={`${value} drawing color`}
                title={`${value} drawing color`}
                aria-pressed={color === value}
                style={{ background: `var(--drawing-${value})` }}
                onClick={() => {
                  setColor(value);
                  const drawing = history.present.find(
                    (d) => d.id === selected,
                  );
                  if (drawing)
                    dispatch({
                      type: "update",
                      drawing: { ...drawing, color: value },
                    });
                }}
              />
            ),
          )}
        </div>
        <div className="drawing-divider" />
        <button
          aria-label="Reset chart view"
          title="Reset chart view"
          onClick={() => {
            series?.priceScale().applyOptions({ autoScale: true });
            const data = series?.data();
            if (data?.length)
              chart?.timeScale().setVisibleLogicalRange({
                from: Math.max(0, data.length - 110),
                to: data.length + 7,
              });
          }}
        >
          <Glyph path="M3 10a9 9 0 1 1 2 8M3 3v7h7" />
        </button>
        <button
          aria-label={expanded ? "Restore chart" : "Expand chart"}
          title={expanded ? "Restore chart" : "Expand chart"}
          onClick={onExpand}
        >
          <Glyph
            path={
              expanded
                ? "M9 3v6H3m12-6v6h6M3 15h6v6m6 0v-6h6"
                : "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"
            }
          />
        </button>
      </div>
      <svg
        ref={svg}
        className={`drawing-overlay ${tool !== "cursor" ? "is-placing" : ""} ${selected || edit ? "is-editing" : ""}`}
        width={size.width}
        height={size.height}
        role="group"
        aria-label="Chart annotations"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(event) => {
          if (down.current?.pointer === event.pointerId) cancel();
        }}
        onLostPointerCapture={(event) => {
          if (down.current?.pointer === event.pointerId) cancel();
        }}
      >
        {!hidden &&
          [...all]
            .sort(
              (a, b) => Number(a.id === selected) - Number(b.id === selected),
            )
            .map(renderDrawing)}
      </svg>
      {tool !== "cursor" && (
        <div className="drawing-instruction" role="status">
          {tools.find((t) => t.id === tool)?.name}:{" "}
          {["horizontal", "vertical"].includes(tool)
            ? "click to place"
            : draft
              ? "click the endpoint"
              : "drag, or click two points"}{" "}
          <span>Esc to cancel</span>
        </div>
      )}
    </>
  );
}
