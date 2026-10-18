import { describe, expect, it } from "vitest";
import { binColor, binLabel, formatDelay, histogramBars, onTimeShare, summarizeDelays, typicalStatus } from "../src/utils/delayStats";

describe("histogramBars", () => {
  it("fills the minutes nobody fell in", () => {
    expect(histogramBars([{ minutes: 0, count: 2 }, { minutes: 3, count: 1 }])).toEqual([
      { minutes: -1, count: 0 },
      { minutes: 0, count: 2 },
      { minutes: 1, count: 0 },
      { minutes: 2, count: 0 },
      { minutes: 3, count: 1 },
    ]);
  });

  it("keeps the on-time band when every bus was late", () => {
    expect(histogramBars([{ minutes: 5, count: 1 }]).map((bar) => bar.minutes)).toEqual([-1, 0, 1, 2, 3, 4, 5]);
  });

  it("is empty without times", () => {
    expect(histogramBars([])).toEqual([]);
  });
});

describe("binLabel", () => {
  it("names the minute up to the next", () => {
    expect(binLabel(-3)).toBe("2–3 min early");
    expect(binLabel(-1)).toBe("Under 1 min early");
    expect(binLabel(0)).toBe("Under 1 min late");
    expect(binLabel(4)).toBe("4–5 min late");
  });

  it("says the end bins hold everything past them", () => {
    expect(binLabel(-10)).toBe("9+ min early");
    expect(binLabel(30)).toBe("30+ min late");
  });
});

describe("binColor", () => {
  it("matches the status chips", () => {
    expect(binColor(-2)).toBe("info");
    expect(binColor(-1)).toBe("success");
    expect(binColor(1)).toBe("success");
    expect(binColor(2)).toBe("warning");
  });
});

describe("onTimeShare", () => {
  it("counts a minute early to under two late", () => {
    expect(onTimeShare([{ minutes: -2, count: 1 }, { minutes: -1, count: 1 }, { minutes: 1, count: 1 }, { minutes: 2, count: 1 }])).toBe(0.5);
  });

  it("is null without times", () => {
    expect(onTimeShare([])).toBeNull();
  });
});

describe("typicalStatus", () => {
  it("rounds the mean to the minute", () => {
    expect(typicalStatus(130).label).toBe("2 min late");
    expect(typicalStatus(80).label).toBe("On time");
    expect(typicalStatus(-170).label).toBe("3 min early");
  });
});

describe("formatDelay", () => {
  it("gives minutes and seconds", () => {
    expect(formatDelay(100)).toBe("1 min 40 s late");
    expect(formatDelay(-35)).toBe("35 s early");
    expect(formatDelay(120)).toBe("2 min late");
    expect(formatDelay(0.2)).toBe("On time");
  });
});

describe("summarizeDelays", () => {
  it("counts stops like the per-stop chips and averages the delays", () => {
    expect(summarizeDelays([0, 60, 150, null, -150, 400])).toEqual({
      count: 5, onTime: 2, late: 2, early: 1, mean: 92, worst: 400,
    });
  });

  it("is null without any times", () => {
    expect(summarizeDelays([null, null])).toBeNull();
    expect(summarizeDelays([])).toBeNull();
  });
});
