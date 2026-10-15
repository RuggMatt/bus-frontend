import { describe, expect, it } from "vitest";
import { formatClockTime, formatClockTimeWithSeconds, formatTripDuration, formatTripTimes, tripDayLabel } from "../src/utils/tripTimes";

// noon on Wednesday 2026-10-14 in Edmonton (UTC-6)
const NOW = Date.parse("2026-10-14T18:00:00Z");
const at = (iso) => Date.parse(iso) / 1000;

describe("formatClockTime", () => {
  it("gives Edmonton time whatever the viewer's zone", () => {
    expect(formatClockTime(at("2026-10-14T13:32:00Z"))).toBe("7:32 AM");
    expect(formatClockTime(at("2026-10-15T05:05:00Z"))).toBe("11:05 PM");
  });
});

describe("formatClockTimeWithSeconds", () => {
  it("gives Edmonton time to the second", () => {
    expect(formatClockTimeWithSeconds(at("2026-10-14T18:44:05Z"))).toBe("12:44:05 PM");
  });
});

describe("tripDayLabel", () => {
  it("names today and yesterday by Edmonton's midnight", () => {
    expect(tripDayLabel(at("2026-10-14T06:30:00Z"), NOW)).toBe("Today");
    // 11:30 PM on Tuesday in Edmonton, though already Wednesday in UTC
    expect(tripDayLabel(at("2026-10-14T05:30:00Z"), NOW)).toBe("Yesterday");
  });

  it("names older days by weekday and date", () => {
    expect(tripDayLabel(at("2026-10-12T18:00:00Z"), NOW)).toBe("Monday, Oct 12");
  });
});

describe("formatTripTimes", () => {
  it("gives the range a trip was seen over", () => {
    expect(formatTripTimes(at("2026-10-14T13:32:00Z"), at("2026-10-14T14:15:00Z"))).toBe("7:32 AM – 8:15 AM");
  });

  it("ends at now while the trip is running", () => {
    expect(formatTripTimes(at("2026-10-14T17:40:00Z"), at("2026-10-14T18:00:00Z"), { ongoing: true })).toBe(
      "11:40 AM – now",
    );
  });

  it("gives one time for a trip seen once", () => {
    expect(formatTripTimes(at("2026-10-14T13:32:00Z"), at("2026-10-14T13:32:20Z"))).toBe("7:32 AM");
  });
});

describe("formatTripDuration", () => {
  it("gives minutes, then hours and minutes", () => {
    expect(formatTripDuration(0, 20)).toBe("Under a minute");
    expect(formatTripDuration(0, 43 * 60)).toBe("43 min");
    expect(formatTripDuration(0, 65 * 60)).toBe("1 h 5 min");
    expect(formatTripDuration(0, 120 * 60)).toBe("2 h");
  });
});
