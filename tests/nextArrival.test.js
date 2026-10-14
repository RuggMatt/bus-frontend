import { describe, expect, it } from "vitest";
import { describeNextArrival, nextArrivalByRoute } from "../src/utils/nextArrival";

const SATURDAY = "2026-10-17";
const MONDAY = "2026-10-19";
const WEDNESDAY = "2026-10-14";

const WEEKDAYS = "1111100";
const SATURDAYS = "0000010";
const SUNDAYS = "0000001";
const WEDNESDAYS = "0010000";

/**
 * @param {string} routeId
 * @param {string} days MTWTFSS
 * @param {string} nextTime
 */
const row = (routeId, days, nextTime) => ({
  route_id: routeId,
  agency_name: "Edmonton Transit Service",
  service_id: `DX-${routeId}-Service-1-26-09-${days}`,
  next_time: nextTime,
});

const key = (routeId) => `Edmonton Transit Service|${routeId}`;

describe("nextArrivalByRoute", () => {
  it("finds Monday's first bus for a weekday-only route on a Saturday morning", () => {
    const rows = {
      // the weekday service still has trips after now, but they don't run on Saturdays
      today: [row("008", WEEKDAYS, "09:15:00")],
      firstOfDay: [row("008", WEEKDAYS, "05:15:00")],
    };
    expect(nextArrivalByRoute(rows, SATURDAY).get(key("008"))).toMatchObject({
      time: "05:15:00",
      daysAhead: 2,
    });
  });

  it("looks most of a week ahead for a Sunday-only route", () => {
    const rows = { firstOfDay: [row("902", SUNDAYS, "06:18:00")] };
    expect(nextArrivalByRoute(rows, MONDAY).get(key("902"))).toMatchObject({ daysAhead: 6 });
  });

  it("reaches next week for a route that has finished on its only day", () => {
    const rows = { today: [], firstOfDay: [row("750", WEDNESDAYS, "07:00:00")] };
    expect(nextArrivalByRoute(rows, WEDNESDAY).get(key("750"))).toMatchObject({
      time: "07:00:00",
      daysAhead: 7,
    });
  });

  it("counts yesterday's trips running past midnight as today", () => {
    const rows = {
      // Friday's service, still running at 00:30 on Saturday
      afterMidnight: [row("004", WEEKDAYS, "24:40:00")],
      firstOfDay: [row("004", SATURDAYS, "06:00:00")],
    };
    expect(nextArrivalByRoute(rows, SATURDAY).get(key("004"))).toMatchObject({
      time: "24:40:00",
      daysAhead: 0,
    });
  });

  it("ignores late trips from yesterday when that service didn't run yesterday", () => {
    const rows = {
      // Monday early morning: Sunday had no weekday service, so the next bus is Monday's first
      today: [row("004", WEEKDAYS, "05:30:00")],
      afterMidnight: [row("004", WEEKDAYS, "24:40:00")],
      firstOfDay: [row("004", WEEKDAYS, "05:30:00")],
    };
    expect(nextArrivalByRoute(rows, MONDAY).get(key("004"))).toMatchObject({
      time: "05:30:00",
      daysAhead: 0,
    });
  });

  it("picks the earliest of today's service patterns", () => {
    const rows = {
      today: [row("001", WEEKDAYS, "10:20:00"), row("001", WEEKDAYS, "10:05:00"), row("001", SATURDAYS, "10:00:00")],
    };
    expect(nextArrivalByRoute(rows, WEDNESDAY).get(key("001"))).toMatchObject({
      time: "10:05:00",
      daysAhead: 0,
    });
  });

  it("prefers a later time today over an earlier one on a later day", () => {
    const rows = {
      today: [row("002", WEEKDAYS, "23:50:00")],
      firstOfDay: [row("002", WEEKDAYS, "05:00:00")],
    };
    expect(nextArrivalByRoute(rows, WEDNESDAY).get(key("002"))).toMatchObject({ daysAhead: 0 });
  });

  it("leaves out routes with nothing in the coming week", () => {
    const rows = { firstOfDay: [row("999", "0000000", "08:00:00")] };
    expect(nextArrivalByRoute(rows, WEDNESDAY).has(key("999"))).toBe(false);
  });

  it("orders arrivals by when they happen", () => {
    const rows = {
      today: [row("001", WEEKDAYS, "22:00:00")],
      firstOfDay: [row("002", SATURDAYS, "06:00:00"), row("003", WEEKDAYS, "05:00:00")],
    };
    const arrivals = nextArrivalByRoute(rows, WEDNESDAY);
    const seconds = ["001", "003", "002"].map((routeId) => arrivals.get(key(routeId)).seconds);
    expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
  });
});

describe("describeNextArrival", () => {
  it.each([
    [{ time: "06:12:00", daysAhead: 0 }, "Next bus at 6:12 AM"],
    [{ time: "24:40:00", daysAhead: 0 }, "Next bus at 12:40 AM"],
    [{ time: "05:42:00", daysAhead: 1 }, "Next bus tomorrow at 5:42 AM"],
    [{ time: "05:15:00", daysAhead: 2 }, "Next bus Monday at 5:15 AM"],
    [{ time: "13:00:00", daysAhead: 7 }, "Next bus next Saturday at 1:00 PM"],
    [null, "No buses scheduled in the next week"],
  ])("describes %o", (arrival, expected) => {
    expect(describeNextArrival(arrival && { ...arrival, seconds: 0 }, SATURDAY)).toBe(expected);
  });
});
