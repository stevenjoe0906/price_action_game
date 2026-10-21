import type { IChartApi } from "lightweight-charts";

export function createChartNavigation(getChart: () => IChartApi | null) {
  const locks = new Set<"drawing" | "order" | "inspection">();
  return {
    lock(kind: "drawing" | "order" | "inspection", enabled: boolean) {
      if (enabled) locks.add(kind);
      else locks.delete(kind);
      getChart()?.applyOptions({
        handleScroll: !locks.size,
        handleScale: !locks.size,
      });
    },
    beginPan() {
      // Manual scaling is required by Lightweight Charts for vertical dragging.
      if (!locks.size)
        getChart()?.priceScale("right").applyOptions({ autoScale: false });
    },
  };
}
