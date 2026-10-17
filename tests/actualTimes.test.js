import { describe, expect, it } from "vitest";
import { actualStopTime, delaysByTrip } from "../src/utils/actualTimes";

describe("delaysByTrip", () => {
  it("keys trips by id and stops by sequence", () => {
    const delays = delaysByTrip({
      route: "008",
      date: "2026-10-14",
      count: 1,
      trips: [{ trip: 32755477, stops: [[1, 30], [2, -150]] }],
    });
    expect(delays.get("32755477")?.get(2)).toBe(-150);
    expect(delays.get("32755477")?.get(3)).toBeUndefined();
  });

  it("is empty without data", () => {
    expect(delaysByTrip(undefined).size).toBe(0);
  });
});

describe("actualStopTime", () => {
  it("adds the delay to the scheduled time", () => {
    expect(actualStopTime("08:15:00", 130)).toEqual({ time: "08:17:10", status: { label: "2 min late", color: "warning" } });
  });

  it("rounds to the minute like the trip page", () => {
    expect(actualStopTime("08:15:00", 89).status.label).toBe("On time");
    expect(actualStopTime("08:15:00", -100).status).toEqual({ label: "2 min early", color: "info" });
  });

  it("keeps times past midnight on the service day", () => {
    expect(actualStopTime("24:58:00", 180).time).toBe("25:01:00");
  });
});
