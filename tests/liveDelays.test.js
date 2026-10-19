import { describe, expect, it } from "vitest";
import { liveTripCounts, liveTrips } from "../src/utils/liveDelays";

/** @param {Partial<import("../src/api").Bus>} bus */
const bus = (bus) => ({ bus: 4699, lat: 53.5, long: -113.5, trip: 5002, route: "008", timestamp: 1000, bearing: 0, speed: 0, delay: 0, ...bus });

describe("liveTrips", () => {
  it("lists trips with a prediction, latest first", () => {
    const trips = liveTrips([
      bus({ bus: 1, trip: 1, delay: 60 }),
      bus({ bus: 2, trip: 2, delay: 600 }),
      bus({ bus: 3, trip: 3, delay: -200 }),
    ]);
    expect(trips.map((trip) => trip.trip)).toEqual(["2", "1", "3"]);
    expect(trips[0]).toEqual({ trip: "2", route: "008", bus: 2, delay: 600, minutes: 10 });
  });

  it("leaves out buses off a trip or without a prediction", () => {
    const trips = liveTrips([
      bus({ bus: 1, trip: 1, delay: null }),
      bus({ bus: 2, trip: /** @type {any} */ (null) }),
      bus({ bus: 3, trip: /** @type {any} */ ("") }),
      bus({ bus: 4, trip: 4, delay: undefined }),
      bus({ bus: 5, trip: 5, delay: 30 }),
    ]);
    expect(trips.map((trip) => trip.bus)).toEqual([5]);
  });

  it("keeps the bus that reported last when two are on one trip", () => {
    const trips = liveTrips([
      bus({ bus: 1, trip: 7, timestamp: 1000, delay: 60 }),
      bus({ bus: 2, trip: 7, timestamp: 1030, delay: 120 }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].bus).toBe(2);
  });

  it("is empty without a snapshot", () => {
    expect(liveTrips(undefined)).toEqual([]);
  });
});

describe("liveTripCounts", () => {
  it("counts trips as the chips colour them", () => {
    const trips = liveTrips([
      bus({ trip: 1, delay: 0 }),
      bus({ trip: 2, delay: 89 }),
      bus({ trip: 3, delay: 150 }),
      bus({ trip: 4, delay: 300 }),
      bus({ trip: 5, delay: -150 }),
    ]);
    expect(liveTripCounts(trips)).toEqual({ total: 5, onTime: 2, late: 2, veryLate: 1, early: 1 });
  });
});
