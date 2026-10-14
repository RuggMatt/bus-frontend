import { describe, expect, it } from "vitest";
import { addDays, formatShortDate, formatWeekLabel, isDateString, weekRange, weekStart } from "../src/utils/weeks";

// 2026-10-14 is a Wednesday
const TODAY = "2026-10-14";

describe("weekStart", () => {
  it("goes back to the sunday", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-11");
    expect(weekStart("2026-10-11")).toBe("2026-10-11");
    expect(weekStart("2026-10-17")).toBe("2026-10-11");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStart("2026-10-02")).toBe("2026-09-27");
    expect(weekStart("2026-01-01")).toBe("2025-12-28");
  });
});

describe("addDays and weekRange", () => {
  it("shifts by whole days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-08", -7)).toBe("2026-03-01");
  });

  it("covers sunday to saturday", () => {
    expect(weekRange("2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
  });
});

describe("isDateString", () => {
  it("accepts only real dates", () => {
    expect(isDateString("2026-10-14")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-1-4")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });
});

describe("formatWeekLabel", () => {
  it("names this week and last week", () => {
    expect(formatWeekLabel("2026-10-11", TODAY)).toBe("This week");
    expect(formatWeekLabel("2026-10-04", TODAY)).toBe("Last week");
  });

  it("gives the days of older weeks", () => {
    expect(formatWeekLabel("2026-08-09", TODAY)).toBe("Aug 9 – 15");
    expect(formatWeekLabel("2026-09-27", "2026-11-01")).toBe("Sep 27 – Oct 3");
  });

  it("includes the years for weeks touching another year", () => {
    expect(formatWeekLabel("2025-12-28", TODAY)).toBe("Dec 28, 2025 – Jan 3, 2026");
    expect(formatWeekLabel("2025-10-12", TODAY)).toBe("Oct 12, 2025 – Oct 18, 2025");
  });
});

describe("formatShortDate", () => {
  it("gives the month and day", () => {
    expect(formatShortDate("2026-10-04")).toBe("Oct 4");
  });
});
