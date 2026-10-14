import { describe, expect, it } from "vitest";
import { directionLabels, representativeTrips, routeNumber } from "../src/utils/routes";

const trip = (trip_id, direction_id, shape_id, trip_headsign = "") => ({ trip_id, direction_id, shape_id, trip_headsign });

describe("routeNumber", () => {
  it("drops the feed's zero padding", () => {
    expect(routeNumber("008")).toBe("8");
    expect(routeNumber("0")).toBe("0");
  });
});

describe("representativeTrips", () => {
  const trips = [
    trip("1", "0", "008-174-North"),
    trip("2", "1", "008-175-South"),
    trip("3", "0", "008-174-North"),
    trip("4", "0", "008-176-North"),
  ];

  it("picks the first trip of each shape in the direction", () => {
    expect(representativeTrips(trips, "0").map((t) => t.trip_id)).toEqual(["1", "4"]);
    expect(representativeTrips(trips, "1").map((t) => t.trip_id)).toEqual(["2"]);
  });

  it("is empty for a direction the route doesn't run", () => {
    expect(representativeTrips(trips, "2")).toEqual([]);
  });
});

describe("directionLabels", () => {
  it("uses each direction's most common headsign", () => {
    const labels = directionLabels([
      trip("1", "0", "a", "8 Abbottsfield"),
      trip("2", "0", "a", "8 Abbottsfield"),
      trip("3", "0", "a", "8 Coliseum"),
      trip("4", "1", "b", "8 University"),
    ]);
    expect(labels).toEqual({ 0: "8 Abbottsfield", 1: "8 University" });
  });

  it("falls back to the direction number without a headsign", () => {
    expect(directionLabels([trip("1", "1", "a")])).toEqual({ 1: "Direction 1" });
  });
});
