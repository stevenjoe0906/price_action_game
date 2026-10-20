"use client";
import type { Position } from "@/lib/engine";

export default function PositionProtection({
  position,
  last,
  sl,
  tp,
  disabled,
  onSL,
  onTP,
  onAdd,
  onCancel,
  onApply,
}: {
  position: Position;
  last: number;
  sl: string;
  tp: string;
  disabled: boolean;
  onSL: (value: string) => void;
  onTP: (value: string) => void;
  onAdd: (kind: "sl" | "tp") => void;
  onCancel: (kind: "sl" | "tp") => void;
  onApply: (sl: number | null, tp: number | null) => void;
}) {
  const long = position.side === "long";
  const slPrice = sl.trim() ? Number(sl) : null;
  const tpPrice = tp.trim() ? Number(tp) : null;
  const error = (kind: "sl" | "tp", value: number | null) => {
    if (value === null) return "";
    if (!Number.isFinite(value) || value <= 0) return "Enter a positive price.";
    const below = kind === "sl" ? long : !long;
    return (below ? value >= last : value <= last)
      ? `${kind.toUpperCase()} must be ${below ? "below" : "above"} the current price (${last.toFixed(4)}) for a ${position.side} position.`
      : "";
  };
  const slError = error("sl", slPrice),
    tpError = error("tp", tpPrice);
  return (
    <div className="position-protection" aria-label="Position protection">
      <div className="protection-inputs">
        {(["sl", "tp"] as const).map((kind) => {
          const isSL = kind === "sl",
            message = isSL ? slError : tpError;
          const below = isSL ? long : !long;
          return (
            <label
              key={kind}
              className={`price-input ${isSL ? "red" : "green"}`}
            >
              <span>
                Position {kind.toUpperCase()}
                <small>
                  {below ? "Below" : "Above"} {last.toFixed(4)}
                </small>
              </span>
              <div>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="Not set"
                  aria-label={`Position ${kind.toUpperCase()}`}
                  aria-invalid={!!message}
                  aria-describedby={
                    message ? `position-${kind}-error` : undefined
                  }
                  disabled={disabled}
                  value={isSL ? sl : tp}
                  onChange={(event) => (isSL ? onSL : onTP)(event.target.value)}
                />
              </div>
              {message && (
                <small
                  className="protection-error"
                  role="alert"
                  id={`position-${kind}-error`}
                >
                  {message}
                </small>
              )}
            </label>
          );
        })}
      </div>
      <div className="protection-actions">
        {(["sl", "tp"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="secondary-button compact"
            disabled={disabled}
            onClick={() =>
              position[kind] === null ? onAdd(kind) : onCancel(kind)
            }
          >
            {position[kind] === null ? "Add" : "Cancel"} {kind.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="protection-note">
        Each active exit covers {position.qty.toFixed(3)} units. Add SL/TP to
        restore a default level, or enter a price and update. A blank field
        removes that exit.
      </p>
      <button
        type="button"
        className="secondary-button full compact"
        disabled={disabled || !!slError || !!tpError}
        onClick={() => {
          if (!slError && !tpError) onApply(slPrice, tpPrice);
        }}
      >
        Update protection
      </button>
    </div>
  );
}
