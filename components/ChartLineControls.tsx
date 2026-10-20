"use client";
import type { LinePreview } from "@/lib/line-drag";
import type { ChartLine } from "@/lib/chart-lines";

export default function ChartLineControls({
  line,
  preview,
  toCoordinate,
  paneHeight,
  axisWidth,
  onCancel,
  onAdd,
}: {
  line: ChartLine;
  preview: LinePreview | null;
  toCoordinate: (price: number) => number | null | undefined;
  paneHeight: number;
  axisWidth: number;
  onCancel: () => void;
  onAdd: (kind: "sl" | "tp") => void;
}) {
  const livePrice = preview?.id === line.id ? preview.price : line.price;
  const y = toCoordinate(livePrice);
  if (y == null || !Number.isFinite(y) || y < 12 || y > paneHeight - 12)
    return null;
  return (
    <div
      className="chart-line-controls"
      role="group"
      aria-label={line.title}
      style={{ top: y, right: axisWidth + 8, color: line.color }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="chart-control-label" title={line.title}>
        {line.title}
      </span>
      {line.addProtection?.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`chart-add-protection ${kind}`}
          aria-label={`Add position ${kind === "sl" ? "stop loss" : "take profit"}`}
          title={`Add ${kind.toUpperCase()} at a default price, then drag or edit to adjust`}
          onClick={(event) => {
            event.stopPropagation();
            onAdd(kind);
          }}
        >
          {kind.toUpperCase()}
        </button>
      ))}
      {line.cancelLabel && (
        <button
          type="button"
          className="chart-line-cancel"
          aria-label={line.cancelLabel}
          title={line.cancelLabel}
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
