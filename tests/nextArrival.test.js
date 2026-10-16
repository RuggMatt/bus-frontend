import { describe, expect, it } from "vitest";
import { describeNextArrival, nextArrivalByRoute, upcomingArrivals } from "../src/utils/nextArrival";

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

describe("describeNextArrival for trains", () => {
  it("names the vehicle", () => {
    expect(describeNextArrival({ time: "05:30:00", daysAhead: 1, seconds: 0 }, SATURDAY, "train")).toBe("Next train tomorrow at 5:30 AM");
    expect(describeNextArrival(null, SATURDAY, "train")).toBe("No trains scheduled in the next week");
  });
});

describe("upcomingArrivals", () => {
  /**
   * @param {string} tripId
   * @param {string} days MTWTFSS
   * @param {string} time
   * @param {string} [headsign]
   */
  const entry = (tripId, days, time, headsign = "Century Park") => ({
    trip_id: tripId,
    route_id: "021R",
    route_long_name: "Capital Line",
    agency_name: "Edmonton Transit Service",
    route_type: "0",
    trip_headsign: headsign,
    service_id: `DX-021R-Service-1-26-09-${days}`,
    arrival_time: time,
    stop_sequence: "5",
  });
  const NOON = 12 * 3600;

  it("keeps today's next few, soonest first, with minutes from now", () => {
    const entries = [
      entry("a", WEEKDAYS, "12:20:00"),
      entry("b", WEEKDAYS, "11:58:00"),
      entry("c", WEEKDAYS, "12:05:30", "Health Sciences"),
      entry("d", SATURDAYS, "12:10:00"),
      entry("e", WEEKDAYS, "12:00:00"),
      entry("f", WEEKDAYS, "12:30:00"),
      entry("g", WEEKDAYS, "12:40:00"),
    ];
    const arrivals = upcomingArrivals(entries, MONDAY, NOON + 20).get(key("021R"));
    expect(arrivals?.map((arrival) => [arrival.trip_id, arrival.minutes, arrival.headsign])).toEqual([
      ["e", 0, "Century Park"],
      ["c", 5, "Health Sciences"],
      ["a", 19, "Century Park"],
      ["f", 29, "Century Park"],
    ]);
  });

  it("keeps only the services the calendar runs today", () => {
    const entries = [
      entry("variant-1", WEEKDAYS, "12:05:00"),
      { ...entry("variant-3", WEEKDAYS, "12:05:00"), service_id: "DX-021R-Weekday-3-26-09-1111100" },
      { ...entry("special", WEEKDAYS, "12:07:00"), service_id: "DX-021R-Weekday-5-26-09-1111100" },
    ];
    const serviceDates = new Map([
      [entries[0].service_id, new Set([MONDAY])],
      ["DX-021R-Weekday-3-26-09-1111100", new Set(["2026-10-20"])],
      ["DX-021R-Weekday-5-26-09-1111100", new Set(["2026-09-30"])],
    ]);
    const arrivals = upcomingArrivals(entries, MONDAY, NOON, { serviceDates }).get(key("021R"));
    expect(arrivals?.map((arrival) => arrival.trip_id)).toEqual(["variant-1"]);
  });

  it("keeps a train once when several variants claim the day", () => {
    const entries = [
      entry("variant-1", WEEKDAYS, "12:05:00"),
      { ...entry("variant-3", WEEKDAYS, "12:05:00"), service_id: "DX-021R-Weekday-3-26-09-1111100" },
    ];
    expect(upcomingArrivals(entries, MONDAY, NOON).get(key("021R"))).toHaveLength(1);
  });

  it("counts yesterday's trips running past midnight", () => {
    // Saturday 12:30 AM, on Friday's service
    const arrivals = upcomingArrivals([entry("late", WEEKDAYS, "24:40:00")], SATURDAY, 30 * 60).get(key("021R"));
    expect(arrivals?.map((arrival) => [arrival.seconds, arrival.minutes])).toEqual([[40 * 60, 10]]);
  });
});

describe("upcomingArrivals by stop", () => {
  it("groups by whatever key it's given", () => {
    const base = {
      route_id: "021R",
      route_long_name: "Capital Line",
      agency_name: "Edmonton Transit Service",
      route_type: "0",
      trip_headsign: "Century Park",
      service_id: "DX-021R-Weekday-1-26-09-1111100",
      stop_sequence: "1",
    };
    const entries = [
      { ...base, trip_id: "a", stop_id: "1", arrival_time: "12:05:00" },
      { ...base, trip_id: "a", stop_id: "2", arrival_time: "12:08:00" },
      { ...base, trip_id: "b", stop_id: "1", arrival_time: "12:20:00" },
    ];
    const byStop = upcomingArrivals(entries, MONDAY, 12 * 3600, { keyOf: (entry) => entry.stop_id, limit: 3 });
    expect([...byStop].map(([stop, arrivals]) => [stop, arrivals.map((arrival) => arrival.minutes)])).toEqual([
      ["1", [5, 20]],
      ["2", [8]],
    ]);
  });
});
