import { describe, expect, it } from "vitest";
import { scheduledSecondsNear, serviceRunsOnDay, weekdayOf } from "../src/utils/serviceTime";

describe("weekdayOf", () => {
  it("names the day of a date", () => {
    expect(weekdayOf("2026-10-14")).toBe("wednesday");
  });

  it("moves across weeks, months and back", () => {
    expect(weekdayOf("2026-10-14", 7)).toBe("wednesday");
    expect(weekdayOf("2026-10-31", 1)).toBe("sunday");
    expect(weekdayOf("2026-10-14", -1)).toBe("tuesday");
  });

  it("isn't thrown by a daylight saving change", () => {
    // clocks go back on 2026-11-01 in Edmonton
    expect(weekdayOf("2026-10-31", 2)).toBe("monday");
  });
});

describe("serviceRunsOnDay", () => {
  const weekday = "DX-008-Weekday-1-26-09-1111100";

  it("reads the day pattern at the end of the service id", () => {
    expect(serviceRunsOnDay(weekday, "monday")).toBe(true);
    expect(serviceRunsOnDay(weekday, "friday")).toBe(true);
    expect(serviceRunsOnDay(weekday, "saturday")).toBe(false);
    expect(serviceRunsOnDay("SU-902-Sunday-1-26-09-0000001", "sunday")).toBe(true);
  });

  it("assumes a service runs when its days can't be read", () => {
    expect(serviceRunsOnDay("X", "monday")).toBe(true);
  });
});

describe("scheduledSecondsNear", () => {
  it("keeps a daytime trip on today", () => {
    expect(scheduledSecondsNear("10:00:00", 9 * 3600)).toBe(10 * 3600);
  });

  it("puts a trip past 24:00 just after midnight on yesterday's service day", () => {
    // 24:40 on yesterday's service is 00:40 today
    expect(scheduledSecondsNear("24:40:00", 30 * 60)).toBe(40 * 60);
  });
});
