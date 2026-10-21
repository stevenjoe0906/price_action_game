"use client";
import { useEffect, useState } from "react";

export function useTouchLayout() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(any-pointer: coarse)");
    const update = () =>
      setTouch(!!media?.matches || window.navigator.maxTouchPoints > 0);
    update();
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  return touch;
}
