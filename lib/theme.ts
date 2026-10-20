export type Theme = "dark" | "light";
export const CHART_THEMES = {
  dark: {
    background: "#101619",
    text: "#91a0a6",
    grid: "#202a2f",
    border: "#344148",
    up: "#55c59a",
    down: "#e07676",
    crosshair: "#71838c",
    label: "#303e45",
    accent: "#c5db88",
    neutral: "#a4b2bd",
    currentPrice: "rgba(215, 226, 233, 0.28)",
  },
  light: {
    background: "#ffffff",
    text: "#536774",
    grid: "#e5ecef",
    border: "#ccd8de",
    up: "#168368",
    down: "#c74752",
    crosshair: "#80919b",
    label: "#536774",
    accent: "#52782c",
    neutral: "#526a7a",
    currentPrice: "rgba(80, 105, 120, 0.18)",
  },
} as const;
