import { describe, expect, it } from "vitest";
import { formatReportAge, reportAgeLevel } from "../src/utils/reportAge";

// noon on Wednesday 2026-10-14 in Edmonton
const NOW = Date.parse("2026-10-14T18:00:00Z");
const ago = (seconds) => NOW / 1000 - seconds;

describe("formatReportAge", () => {
  it("counts seconds, then minutes and seconds", () => {
    expect(formatReportAge(ago(52), NOW)).toBe("52s ago");
    expect(formatReportAge(ago(4 * 60 + 12), NOW)).toBe("4m 12s ago");
  });

  it("drops to hours and minutes past an hour", () => {
    expect(formatReportAge(ago(3 * 3600 + 5 * 60 + 30), NOW)).toBe("3h 5m ago");
  });

  it("gives days past a day, and the date past a week", () => {
    expect(formatReportAge(ago(2 * 86400 + 3600), NOW)).toBe("2d ago");
    expect(formatReportAge(Date.parse("2026-10-03T18:00:00Z") / 1000, NOW)).toBe("Oct 3");
    expect(formatReportAge(Date.parse("2025-10-03T18:00:00Z") / 1000, NOW)).toBe("Oct 3, 2025");
  });

  it("doesn't go negative when the clocks disagree", () => {
    expect(formatReportAge(ago(-5), NOW)).toBe("0s ago");
  });
});

describe("reportAgeLevel", () => {
  it("calls positions stale past 5 minutes and old past an hour", () => {
    expect(reportAgeLevel(ago(60), NOW)).toBe("fresh");
    expect(reportAgeLevel(ago(6 * 60), NOW)).toBe("stale");
    expect(reportAgeLevel(ago(2 * 3600), NOW)).toBe("old");
  });
});
