"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  chartOrderChoices,
  orderDraft,
  type ChartOrderType,
} from "@/lib/order-ticket";
import type { Side } from "@/lib/engine";
type Props = {
  x: number;
  y: number;
  price: number;
  last: number;
  onChoose: (side: Side, type: ChartOrderType, price: number) => void;
  onClose: () => void;
};
export default function ChartOrderMenu({
  x,
  y,
  price,
  last,
  onChoose,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: x, top: y });
  const choices = chartOrderChoices(price, last);
  useLayoutEffect(() => {
    const node = ref.current,
      parent = node?.parentElement;
    if (!node || !parent) return;
    setPosition({
      left: Math.max(8, Math.min(x, parent.clientWidth - node.offsetWidth - 8)),
      top: Math.max(
        8,
        Math.min(y, parent.clientHeight - node.offsetHeight - 8),
      ),
    });
    node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    const cancel = () => close.current();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("wheel", cancel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("wheel", cancel);
    };
  }, []);
  return (
    <div
      ref={ref}
      className="chart-order-menu"
      style={position}
      role="menu"
      aria-label={`Prepare an order at ${price.toFixed(4)}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        const buttons = [
          ...(ref.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? []),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close.current();
        } else if (
          ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        } else if (event.key === "Tab") close.current();
      }}
    >
      <div className="chart-order-menu-heading">
        Prepare order <span>{price.toFixed(4)}</span>
      </div>
      {choices.map((choice) => {
        const buy = choice.side === "long",
          verb = buy ? "Buy" : "Sell";
        const draft = orderDraft(choice.side, choice.type, price);
        const suffix =
          choice.type === "limit"
            ? "limit"
            : choice.type === "stop"
              ? "stop"
              : `stop, ${draft.limit!.toFixed(4)} limit`;
        return (
          <button
            key={choice.type}
            type="button"
            role="menuitem"
            disabled={choice.disabled}
            aria-label={`Prepare ${verb.toLowerCase()} ${choice.type === "stop" ? "stop market" : choice.type} order`}
            title={
              choice.disabled
                ? "Choose a level above or below the current market for a stop entry."
                : undefined
            }
            onClick={() => {
              onChoose(choice.side, choice.type, price);
              close.current();
            }}
          >
            <span className={buy ? "positive" : "negative"} aria-hidden="true">
              {buy ? "↗" : "↘"}
            </span>
            <span>
              <strong>{verb}</strong> at {price.toFixed(4)} {suffix}
            </span>
          </button>
        );
      })}
      <p>Opens the ticket with SL and TP. Review before placing.</p>
    </div>
  );
}
