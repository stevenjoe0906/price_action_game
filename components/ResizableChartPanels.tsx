"use client";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export default function ResizableChartPanels({
  children,
  expanded,
}: {
  children: ReactNode;
  expanded: boolean;
}) {
  const panels = Children.toArray(children);
  const host = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    y: number;
    height: number;
    ratio: number | null;
  } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bounds, setBounds] = useState({ min: 0, max: 100, value: 70 });

  const geometry = () => {
    const node = host.current!,
      handle = divider.current!;
    const available = node.clientHeight - handle.offsetHeight;
    const rem =
      parseFloat(
        node.ownerDocument.defaultView!.getComputedStyle(node).fontSize,
      ) || 16;
    const scale = Math.min(1, available / (27 * rem));
    return {
      available,
      min: 20 * rem * scale,
      max: available - 7 * rem * scale,
    };
  };
  const resize = (height: number) => {
    const { available, min, max } = geometry();
    if (available <= 0) return;
    setRatio(Math.max(min, Math.min(max, height)) / available);
  };
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => {
      const { available, min, max } = geometry();
      if (available <= 0) return;
      setRatio((current) =>
        current === null
          ? null
          : Math.max(min / available, Math.min(max / available, current)),
      );
      setBounds({
        min: (min / available) * 100,
        max: (max / available) * 100,
        value:
          ((node.firstElementChild as HTMLElement).offsetHeight / available) *
          100,
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ratio, expanded]);
  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const cursor = body.style.cursor,
      selection = body.style.userSelect;
    body.style.cursor = "row-resize";
    body.style.userSelect = "none";
    const move = (event: PointerEvent) => {
      if (drag.current)
        resize(drag.current.height + event.clientY - drag.current.y);
    };
    const end = () => {
      drag.current = null;
      setDragging(false);
    };
    const cancel = () => {
      setRatio(drag.current?.ratio ?? null);
      end();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", key, true);
    return () => {
      body.style.cursor = cursor;
      body.style.userSelect = selection;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", key, true);
    };
  }, [dragging]);
  return (
    <div
      ref={host}
      className={`left-panel${dragging ? " is-resizing" : ""}`}
      role="region"
      aria-label="Chart and order activity"
      style={
        ratio === null
          ? undefined
          : {
              gridTemplateRows: `minmax(0, ${ratio}fr) 12px minmax(0, ${1 - ratio}fr)`,
            }
      }
    >
      {panels[0]}
      <div
        ref={divider}
        className="panel-divider"
        role="separator"
        tabIndex={expanded ? -1 : 0}
        aria-label="Resize chart and order activity"
        aria-orientation="horizontal"
        aria-valuemin={Math.round(bounds.min)}
        aria-valuemax={Math.round(bounds.max)}
        aria-valuenow={Math.round(ratio === null ? bounds.value : ratio * 100)}
        aria-valuetext={`${Math.round(ratio === null ? bounds.value : ratio * 100)}% chart height`}
        aria-disabled={expanded}
        title="Drag to resize · Up/Down to adjust · Double-click to reset"
        onPointerDown={(event) => {
          if (expanded || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = {
            y: event.clientY,
            height: (host.current!.firstElementChild as HTMLElement)
              .offsetHeight,
            ratio,
          };
          setDragging(true);
        }}
        onDoubleClick={() => {
          if (!expanded) setRatio(null);
        }}
        onKeyDown={(event) => {
          if (
            expanded ||
            !["ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Enter") {
            setRatio(null);
            return;
          }
          const { min, max } = geometry();
          const height = (host.current!.firstElementChild as HTMLElement)
            .offsetHeight;
          resize(
            event.key === "Home"
              ? min
              : event.key === "End"
                ? max
                : height +
                  (event.key === "ArrowUp" ? -1 : 1) *
                    (event.shiftKey ? 50 : 10),
          );
        }}
      />
      {panels[1]}
    </div>
  );
}
