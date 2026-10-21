import { test } from "node:test";
import assert from "node:assert/strict";
import { chartTimeTick, chartTime } from "../lib/chart-display";

test("UTC axis ticks use short times and day/month/year boundaries while crosshair keeps context", async () => {
  const { TickMarkType } = await import("lightweight-charts");
  const stamp = Date.UTC(2024, 10, 19, 13, 5, 9) / 1000;
  assert.equal(chartTimeTick(stamp, TickMarkType.Time), "13:05");
  assert.equal(chartTimeTick(stamp, TickMarkType.TimeWithSeconds), "13:05:09");
  assert.equal(chartTimeTick(stamp, TickMarkType.DayOfMonth), "19");
  assert.equal(chartTimeTick(stamp, TickMarkType.Month), "Nov");
  assert.equal(chartTimeTick(stamp, TickMarkType.Year), "2024");
  assert.equal(chartTime(stamp), "2024-11-19 13:05 UTC");
  assert.equal(
    chartTimeTick(Date.UTC(2025, 0, 1) / 1000, TickMarkType.Year),
    "2025",
  );
});
