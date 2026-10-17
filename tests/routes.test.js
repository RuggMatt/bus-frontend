import { describe, expect, it } from "vitest";
import { busesByHeadsign, compareAgencies, directionLabels, groupRoutesByAgency, filterRoutes, routeTypeLabel, headsignWithoutRoute, representativeTrips, routeNumber, stopsInOrder } from "../src/utils/routes";

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

describe("headsignWithoutRoute", () => {
  it("drops the route number the headsign starts with", () => {
    expect(headsignWithoutRoute("4 University", "004")).toBe("University");
    expect(headsignWithoutRoute("128 Northgate", "128")).toBe("Northgate");
  });

  it("keeps variants and headsigns without the number", () => {
    expect(headsignWithoutRoute("109A Castle Downs", "109")).toBe("109A Castle Downs");
    expect(headsignWithoutRoute("2-Owl Clareview", "002")).toBe("2-Owl Clareview");
    expect(headsignWithoutRoute("10 Leduc Express", "L10")).toBe("10 Leduc Express");
    expect(headsignWithoutRoute("Bethel", "411")).toBe("Bethel");
  });
});

describe("busesByHeadsign", () => {
  const summaries = [
    { trip_id: "1", trip_headsign: "8 Abbottsfield", direction_id: "1" },
    { trip_id: "2", trip_headsign: "8 University", direction_id: "0" },
    { trip_id: "3", trip_headsign: "8 Abbottsfield", direction_id: "1" },
  ];

  it("groups by headsign, by direction then name, with buses by number", () => {
    const buses = [
      { bus: "4710", trip: 1 },
      { bus: "812", trip: 3 },
      { bus: "4699", trip: 2 },
    ];
    expect(busesByHeadsign(buses, summaries, "008")).toEqual([
      { headsign: "University", buses: [{ bus: "4699", trip: 2 }] },
      { headsign: "Abbottsfield", buses: [{ bus: "812", trip: 3 }, { bus: "4710", trip: 1 }] },
    ]);
  });

  it("puts buses on unknown trips last", () => {
    const buses = [{ bus: "1", trip: 99 }, { bus: "2", trip: 2 }];
    expect(busesByHeadsign(buses, summaries, "008").map((group) => group.headsign)).toEqual(["University", null]);
  });
});

describe("filterRoutes", () => {
  const routes = [
    { route_id: "008", route_long_name: "Abbottsfield - Downtown - University", route_type: "3" },
    { route_id: "021R", route_long_name: "Capital Line", route_type: "0" },
    { route_id: "201", route_long_name: "St. Albert Exchange", route_type: "3" },
  ];
  const ids = (list) => list.map((route) => route.route_id);
  const agencies = new Map([["008", "Edmonton Transit Service"], ["021R", "Edmonton Transit Service"], ["201", "St. Albert Transit"]]);

  it("searches names, ids and route numbers", () => {
    expect(ids(filterRoutes(routes, { search: "capital" }))).toEqual(["021R"]);
    expect(ids(filterRoutes(routes, { search: "8" }))).toEqual(["008"]);
    expect(ids(filterRoutes(routes, { search: "" }))).toEqual(["008", "021R", "201"]);
  });

  it("filters by type and agency", () => {
    expect(ids(filterRoutes(routes, { type: "0" }))).toEqual(["021R"]);
    expect(ids(filterRoutes(routes, { type: "3", agency: "St. Albert Transit" }, { agencies }))).toEqual(["201"]);
  });

  it("ignores the agency until agencies load", () => {
    expect(ids(filterRoutes(routes, { agency: "St. Albert Transit" }, { agencies: new Map() }))).toHaveLength(3);
  });

  it("keeps live or disrupted routes", () => {
    const context = { liveRoutes: new Set(["008", "201"]), disruptedRoutes: new Set(["201"]) };
    expect(ids(filterRoutes(routes, { live: true }, context))).toEqual(["008", "201"]);
    expect(ids(filterRoutes(routes, { live: true, disrupted: true }, context))).toEqual(["201"]);
  });

  it("labels route types", () => {
    expect(routeTypeLabel("0")).toBe("LRT");
    expect(routeTypeLabel("3")).toBe("Bus");
  });
});

describe("groupRoutesByAgency", () => {
  it("puts the local agency first, then others by name, and unknown last", () => {
    const routes = [{ route_id: "008" }, { route_id: "201" }, { route_id: "401" }, { route_id: "009" }, { route_id: "X" }];
    const agencies = new Map([
      ["008", "Edmonton Transit Service"],
      ["009", "Edmonton Transit Service"],
      ["201", "St. Albert Transit"],
      ["401", "Strathcona County Transit"],
    ]);
    expect(groupRoutesByAgency(routes, agencies).map((group) => [group.agency, group.routes.map((route) => route.route_id)])).toEqual([
      ["Edmonton Transit Service", ["008", "009"]],
      ["St. Albert Transit", ["201"]],
      ["Strathcona County Transit", ["401"]],
      [null, ["X"]],
    ]);
  });

  it("orders agencies with the local one first", () => {
    expect(["Leduc Transit", "Edmonton Transit Service", "Beaumont Transit"].sort(compareAgencies))
      .toEqual(["Edmonton Transit Service", "Beaumont Transit", "Leduc Transit"]);
  });
});

describe("stopsInOrder", () => {
  const stopTime = (trip_id, stop_id, stop_sequence) => ({ trip_id, stop_id, stop_sequence });

  it("orders stops by their average stop_sequence across shapes", () => {
    // a short-turn shape skips stop B, so C is its second stop
    const stopTimes = [
      stopTime("1", "A", "1"), stopTime("1", "B", "2"), stopTime("1", "C", "3"), stopTime("1", "D", "4"),
      stopTime("2", "A", "1"), stopTime("2", "C", "2"),
    ];
    expect(stopsInOrder(stopTimes)).toEqual(["A", "B", "C", "D"]);
  });

  it("lists a stop passed twice once, where the trip first reaches it", () => {
    const loop = [stopTime("1", "A", 1), stopTime("1", "B", 2), stopTime("1", "C", 3), stopTime("1", "A", 4)];
    expect(stopsInOrder(loop)).toEqual(["A", "B", "C"]);
  });

  it("gives nothing without stop times", () => {
    expect(stopsInOrder([])).toEqual([]);
  });
});
