import { describe, expect, it } from "vitest";
import {
  formatTravelTime,
  parseTravelTime,
  runDateAt,
  shiftTravelTime,
  travelTimeNow,
} from "../src/utils/timeTravel";

// 2026-10-14 is a Wednesday
const TODAY = "2026-10-14";

// unix seconds at an Edmonton wall-clock time in October (MDT, UTC-6)
const mdt = (date, time) => Date.parse(`${date}T${time}-06:00`) / 1000;

describe("parseTravelTime", () => {
  it("reads a date and time", () => {
    expect(parseTravelTime("2026-10-14T08:30")).toEqual({ date: "2026-10-14", time: "08:30" });
  });

  it("rejects anything else", () => {
    expect(parseTravelTime(undefined)).toBeNull();
    expect(parseTravelTime("2026-10-14")).toBeNull();
    expect(parseTravelTime("2026-10-14T8:30")).toBeNull();
    expect(parseTravelTime("2026-02-30T08:30")).toBeNull();
    expect(parseTravelTime("2026-10-14T24:00")).toBeNull();
    expect(parseTravelTime("2026-10-14T08:30:00")).toBeNull();
  });
});

describe("travelTimeNow", () => {
  it("is the minute in Edmonton, whatever the viewer's zone", () => {
    expect(travelTimeNow(new Date("2026-10-14T14:30:59Z"))).toBe("2026-10-14T08:30");
    expect(travelTimeNow(new Date("2026-10-15T05:05:00Z"))).toBe("2026-10-14T23:05");
  });
});

describe("shiftTravelTime", () => {
  it("steps the wall clock, across days too", () => {
    expect(shiftTravelTime("2026-10-14T08:30", 5)).toBe("2026-10-14T08:35");
    expect(shiftTravelTime("2026-10-14T23:58", 5)).toBe("2026-10-15T00:03");
    expect(shiftTravelTime("2026-10-14T00:02", -5)).toBe("2026-10-13T23:57");
  });

  it("isn't thrown by a time change", () => {
    expect(shiftTravelTime("2026-11-01T01:58", 5)).toBe("2026-11-01T02:03");
  });
});

describe("formatTravelTime", () => {
  it("names the day like the day picker, then the time", () => {
    expect(formatTravelTime("2026-10-14T08:30", TODAY)).toBe("Today, 8:30 AM");
    expect(formatTravelTime("2026-10-13T12:05", TODAY)).toBe("Yesterday, 12:05 PM");
    expect(formatTravelTime("2026-10-07T00:00", TODAY)).toBe("Wed, Oct 7, 12:00 AM");
  });
});

describe("runDateAt", () => {
  it("is the day of the position for a daytime trip", () => {
    expect(runDateAt("08:00:00", mdt("2026-10-14", "08:20:00"))).toBe("2026-10-14");
  });

  it("is the day before for a run that started before midnight", () => {
    expect(runDateAt("23:50:00", mdt("2026-10-14", "00:20:00"))).toBe("2026-10-13");
  });

  it("is the day of the position for a trip scheduled past 24:00", () => {
    expect(runDateAt("24:30:00", mdt("2026-10-14", "00:40:00"))).toBe("2026-10-14");
  });
});
