import { describe, expect, it } from "vitest";
import { formatPeriodLabel, formatPeriodTitle, summarizeCounts, tripCountsRange } from "../src/utils/tripCounts";
import { formatDayLabel, mondayWeekStart } from "../src/utils/weeks";

// 2026-10-14 is a Wednesday
const TODAY = "2026-10-14";

describe("mondayWeekStart", () => {
  it("goes back to the monday", () => {
    expect(mondayWeekStart("2026-10-14")).toBe("2026-10-12");
    expect(mondayWeekStart("2026-10-12")).toBe("2026-10-12");
    expect(mondayWeekStart("2026-10-18")).toBe("2026-10-12");
    expect(mondayWeekStart("2026-01-01")).toBe("2025-12-29");
  });
});

describe("tripCountsRange", () => {
  it("covers the last 30 days", () => {
    expect(tripCountsRange("day", TODAY)).toEqual({ from: "2026-09-15", to: TODAY });
  });

  it("covers 12 monday weeks", () => {
    expect(tripCountsRange("week", TODAY)).toEqual({ from: "2026-07-27", to: TODAY });
  });

  it("covers 12 months, across a year", () => {
    expect(tripCountsRange("month", TODAY)).toEqual({ from: "2025-11-01", to: TODAY });
    expect(tripCountsRange("month", "2026-01-31")).toEqual({ from: "2025-02-01", to: "2026-01-31" });
  });

  it("starts no earlier than the first sighting", () => {
    expect(tripCountsRange("month", TODAY, "2026-08-20")).toEqual({ from: "2026-08-20", to: TODAY });
    expect(tripCountsRange("day", TODAY, "2026-01-01")).toEqual({ from: "2026-09-15", to: TODAY });
  });
});

describe("period labels", () => {
  it("labels axis ticks", () => {
    expect(formatPeriodLabel("2026-10-14", "day")).toBe("Oct 14");
    expect(formatPeriodLabel("2026-10-12", "week")).toBe("Oct 12");
    expect(formatPeriodLabel("2026-10-01", "month")).toBe("Oct 2026");
  });

  it("names periods in full", () => {
    expect(formatPeriodTitle("2026-10-14", "day")).toBe("Wed, Oct 14");
    expect(formatPeriodTitle("2026-10-12", "week")).toBe("Week of Oct 12");
    expect(formatPeriodTitle("2026-10-01", "month")).toBe("October 2026");
  });
});

describe("summarizeCounts", () => {
  const counts = [
    { period: "2026-08-01", trips: 70 },
    { period: "2026-09-01", trips: 250 },
    { period: "2026-10-01", trips: 150 },
  ];

  it("leaves the current period out of the average", () => {
    expect(summarizeCounts(counts)).toEqual({ total: 470, average: 160 });
  });

  it("leaves out a period the bus was first seen partway through", () => {
    expect(summarizeCounts(counts, "2026-08-16")).toEqual({ total: 470, average: 250 });
    expect(summarizeCounts(counts, "2026-08-01")).toEqual({ total: 470, average: 160 });
  });

  it("averages what's left when every period is partial", () => {
    expect(summarizeCounts([{ period: "2026-10-01", trips: 7 }])).toEqual({ total: 7, average: 7 });
    expect(summarizeCounts(counts.slice(1), "2026-09-10")).toEqual({ total: 400, average: 200 });
    expect(summarizeCounts([])).toEqual({ total: 0, average: 0 });
  });
});

describe("formatDayLabel", () => {
  it("names nearby days", () => {
    expect(formatDayLabel(TODAY, TODAY)).toBe("Today");
    expect(formatDayLabel("2026-10-13", TODAY)).toBe("Yesterday");
    expect(formatDayLabel("2026-10-15", TODAY)).toBe("Tomorrow");
  });

  it("dates other days, with the year when it differs", () => {
    expect(formatDayLabel("2026-10-22", TODAY)).toBe("Thu, Oct 22");
    expect(formatDayLabel("2025-12-31", TODAY)).toBe("Wed, Dec 31, 2025");
  });
});
