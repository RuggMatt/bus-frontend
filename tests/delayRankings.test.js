import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatMonthLabel,
  formatPeriodLabel,
  initialPeriodStart,
  periodPhrase,
  periodRange,
  periodStart,
  pickOption,
  rangeDays,
  rankingChip,
  rankingDetails,
  switchedPeriodStart,
} from "../src/utils/delayRankings";

// 2026-10-14 is a Wednesday
const today = "2026-10-14";

describe("periods", () => {
  it("starts a period on the day, its Sunday or the first of its month", () => {
    expect(periodStart("day", "2026-10-14")).toBe("2026-10-14");
    expect(periodStart("week", "2026-10-14")).toBe("2026-10-11");
    expect(periodStart("month", "2026-10-14")).toBe("2026-10-01");
  });

  it("covers a whole week or month", () => {
    expect(periodRange("day", "2026-10-14", today)).toEqual({ from: "2026-10-14", to: "2026-10-14" });
    expect(periodRange("week", "2026-10-11", today)).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(periodRange("month", "2026-02-01", today)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("month", "2026-12-01", today)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(rangeDays(periodRange("month", "2026-10-01", today))).toBe(31);
  });

  it("rolls the last 7 or 30 days up to yesterday without a start", () => {
    expect(periodRange("week", "", today)).toEqual({ from: "2026-10-07", to: "2026-10-13" });
    expect(periodRange("month", "", today)).toEqual({ from: "2026-09-14", to: "2026-10-13" });
    expect(rangeDays(periodRange("month", "", today))).toBe(30);
  });

  it("switches a week or month to the last 7 or 30 days, and a day to no later than yesterday", () => {
    // this month runs past today, and its week would be in the future
    const thisMonth = periodRange("month", "2026-10-01", today);
    expect(switchedPeriodStart("week", thisMonth, today)).toBe("");
    expect(switchedPeriodStart("day", thisMonth, today)).toBe("2026-10-13");
    expect(switchedPeriodStart("day", periodRange("week", "2026-09-27", today), today)).toBe("2026-10-03");
  });

  it("steps months across years", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("opens yesterday unless the URL has an earlier day", () => {
    expect(initialPeriodStart("day", undefined, today)).toBe("2026-10-13");
    expect(initialPeriodStart("day", today, today)).toBe("2026-10-13");
    expect(initialPeriodStart("day", "2026-02-30", today)).toBe("2026-10-13");
    expect(initialPeriodStart("week", "2026-10-01", today)).toBe("2026-09-27");
    expect(initialPeriodStart("week", undefined, today)).toBe("");
    expect(initialPeriodStart("month", "2026-10-20", today)).toBe("");
    expect(initialPeriodStart("month", "2026-09-15", today)).toBe("2026-09-01");
  });

  it("names periods", () => {
    expect(formatMonthLabel("2026-10-01", today)).toBe("This month");
    expect(formatMonthLabel("2026-09-01", today)).toBe("Last month");
    expect(formatMonthLabel("2026-08-01", today)).toBe("August 2026");
    expect(formatPeriodLabel("month", "", today)).toBe("Last 30 days");
    expect(periodPhrase(formatPeriodLabel("week", "", today))).toBe("last 7 days");
    expect(formatPeriodLabel("day", "2026-10-13", today)).toBe("Yesterday");
    expect(periodPhrase(formatPeriodLabel("week", "2026-10-11", today))).toBe("this week");
    expect(periodPhrase(formatPeriodLabel("day", "2026-10-12", today))).toBe("Mon, Oct 12");
  });

  it("falls back for unknown URL values", () => {
    expect(pickOption(["day", "week"], "week", "day")).toBe("week");
    expect(pickOption(["day", "week"], "year", "day")).toBe("day");
  });
});

describe("ranking labels", () => {
  const counts = { stops: 40, mean: 412.5, max: 960, onTime: 4, late: 19 };

  it("labels the measure being ranked by", () => {
    expect(rankingChip("mean", counts)).toEqual({ label: "7 min late on average", color: "warning" });
    expect(rankingChip("max", counts)).toEqual({ label: "Worst 16 min late", color: "warning" });
    expect(rankingChip("late", counts)).toEqual({ label: "48% 5+ min late", color: "warning" });
    expect(rankingChip("mean", { ...counts, mean: 30 }).label).toBe("On time on average");
  });

  it("gives the other measures alongside", () => {
    expect(rankingDetails("mean", counts)).toBe("worst 16 min late · 10% on time");
    expect(rankingDetails("max", counts)).toBe("avg 6 min 53 s late · 10% on time");
    expect(rankingDetails("late", counts)).toBe("avg 6 min 53 s late · worst 16 min late");
  });
});
