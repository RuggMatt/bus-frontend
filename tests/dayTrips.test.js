import { describe, expect, it } from "vitest";
import { adjacentTrips, nearestByStart, sortByStart, tripsOnDate } from "../src/utils/dayTrips";

const trip = (trip_id, direction_id, service_id) => ({ trip_id, direction_id, service_id });

describe("tripsOnDate", () => {
  const trips = [trip("1", "0", "wk"), trip("2", "1", "wk"), trip("3", "0", "sat"), trip("1", "0", "wk")];

  it("keeps one direction's trips on the day's services, once each", () => {
    expect(tripsOnDate(trips, new Set(["wk"]), "0").map((t) => t.trip_id)).toEqual(["1"]);
    expect(tripsOnDate(trips, new Set(["wk", "sat"]), "0").map((t) => t.trip_id)).toEqual(["1", "3"]);
  });

  it("is empty when no service runs", () => {
    expect(tripsOnDate(trips, new Set(), "0")).toEqual([]);
  });
});

describe("sortByStart", () => {
  it("orders by time, with past-midnight starts last", () => {
    const starts = [
      { trip_id: "c", start: "24:10:00" },
      { trip_id: "a", start: "05:30:00" },
      { trip_id: "b", start: "17:05:00" },
    ];
    expect(sortByStart(["a", "b", "c"], starts).map((t) => t.trip_id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out trips with no start and ones that weren't asked for", () => {
    const starts = [{ trip_id: "a", start: "05:30:00" }, { trip_id: "x", start: "06:00:00" }];
    expect(sortByStart(["a", "b"], starts)).toEqual([{ trip_id: "a", start: "05:30:00" }]);
  });
});

describe("adjacentTrips", () => {
  const trips = [{ trip_id: "a", start: "05:00:00" }, { trip_id: "b", start: "06:00:00" }, { trip_id: "c", start: "07:00:00" }];

  it("finds the trips either side", () => {
    expect(adjacentTrips(trips, "b")).toEqual({ previous: trips[0], next: trips[2] });
  });

  it("has none past the ends of the day or for an unknown trip", () => {
    expect(adjacentTrips(trips, "a").previous).toBeNull();
    expect(adjacentTrips(trips, "c").next).toBeNull();
    expect(adjacentTrips(trips, "z")).toEqual({ previous: null, next: null });
  });
});

describe("nearestByStart", () => {
  const trips = [{ trip_id: "a", start: "05:00:00" }, { trip_id: "b", start: "06:00:00" }];

  it("picks the closest start, the earlier on a tie", () => {
    expect(nearestByStart(trips, "05:40:00")?.trip_id).toBe("b");
    expect(nearestByStart(trips, "05:30:00")?.trip_id).toBe("a");
    expect(nearestByStart(trips, "23:00:00")?.trip_id).toBe("b");
  });

  it("is null for an empty day", () => {
    expect(nearestByStart([], "05:00:00")).toBeNull();
  });
});
