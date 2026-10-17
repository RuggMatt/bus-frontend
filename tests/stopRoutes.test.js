import { describe, expect, it } from "vitest";
import { compareStopRouteGroups, hasDelayStats, isActiveGroup } from "../src/utils/stopRoutes";
import { LOCAL_AGENCY } from "../src/utils/routes";

const group = (route_id, { buses = 0, upcoming = 0, rail = false, agency_name = LOCAL_AGENCY, route_long_name = route_id, upcomingLoading = false } = {}) => ({
  route_id,
  route_long_name,
  agency_name,
  rail,
  buses: Array.from({ length: buses }, () => ({})),
  upcoming: Array.from({ length: upcoming }, () => ({})),
  upcomingLoading,
});

const order = (groups) => [...groups].sort(compareStopRouteGroups).map((g) => `${g.agency_name === LOCAL_AGENCY ? "" : "R:"}${g.route_id}`);

describe("compareStopRouteGroups", () => {
  it("puts routes with a bus on the way first, then the rest, each by route number", () => {
    expect(order([
      group("120"),
      group("009", { buses: 1 }),
      group("004"),
      group("008", { buses: 3 }),
      group("010", { buses: 1 }),
      group("002"),
    ])).toEqual(["008", "009", "010", "002", "004", "120"]);
  });

  it("counts an LRT line with trains coming or still loading as active, first by name", () => {
    expect(order([
      group("009", { buses: 1 }),
      group("021R", { rail: true, upcoming: 2, route_long_name: "Valley Line" }),
      group("501", { rail: true, upcomingLoading: true, route_long_name: "Capital Line" }),
      group("004"),
    ])).toEqual(["501", "021R", "009", "004"]);
  });

  it("puts the local agency first when two share a route number", () => {
    expect(order([
      group("201", { agency_name: "St. Albert Transit" }),
      group("201"),
    ])).toEqual(["201", "R:201"]);
  });
});

describe("isActiveGroup", () => {
  it("is a live bus or a scheduled train", () => {
    expect(isActiveGroup(group("008"))).toBe(false);
    expect(isActiveGroup(group("008", { buses: 1 }))).toBe(true);
    expect(isActiveGroup(group("501", { rail: true, upcoming: 1 }))).toBe(true);
  });
});

describe("hasDelayStats", () => {
  it("is only Edmonton Transit buses", () => {
    expect(hasDelayStats(group("008"))).toBe(true);
    expect(hasDelayStats(group("501", { rail: true }))).toBe(false);
    expect(hasDelayStats(group("201", { agency_name: "St. Albert Transit" }))).toBe(false);
  });
});
