import { describe, expect, it } from "vitest";
import { describePlatforms, mainHeadsigns, stationStops } from "../src/utils/stations";

const stops = [
  { stop_id: "19852", stop_code: "19852", location_type: "0", parent_station: "Q7000" },
  { stop_id: "E262", stop_code: "E262", location_type: "2", parent_station: "Q7000" },
  { stop_id: "19851", stop_code: "19851", location_type: "0", parent_station: "Q7000" },
  { stop_id: "1987", stop_code: "1987", location_type: "0" },
  { stop_id: "5000", stop_code: "5000", location_type: "0", parent_station: "Q1" },
];

const row = (stopId, routeId, headsign, trips, routeType = "0") => ({
  stop_id: stopId,
  route_id: routeId,
  agency_name: "Edmonton Transit Service",
  route_type: routeType,
  trip_headsign: headsign,
  trips: String(trips),
});

describe("stationStops", () => {
  it("lists a station's platforms by number, leaving out entrances", () => {
    expect(stationStops(stops[0], stops).map((stop) => stop.stop_id)).toEqual(["19851", "19852"]);
  });

  it("is empty without a station, or when the stop is its only one", () => {
    expect(stationStops(stops[3], stops)).toEqual([]);
    expect(stationStops(stops[4], stops)).toEqual([]);
  });
});

describe("mainHeadsigns", () => {
  it("keeps each route's busiest headsign at each stop", () => {
    const headsigns = mainHeadsigns([
      row("19852", "022R", "Health Sciences", 863),
      row("19852", "022R", "Century Park", 73),
      row("19852", "021R", "Century Park", 1282),
    ]);
    expect(headsigns.get("19852|Edmonton Transit Service|022R")).toBe("Health Sciences");
    expect(headsigns.get("19852|Edmonton Transit Service|021R")).toBe("Century Park");
  });
});

describe("describePlatforms", () => {
  it("says where each platform goes, busiest first, and whether it's LRT", () => {
    const rows = [
      row("19852", "022R", "Health Sciences", 863),
      row("19852", "021R", "Century Park", 1282),
      row("19851", "021R", "Clareview", 1300),
      row("19851", "022R", "Blatchford Gate", 900),
      row("2001", "008", "8 University", 50, "3"),
      row("2001", "002", "2 Clareview", 40, "3"),
    ];
    const platforms = describePlatforms([{ stop_id: "19851", stop_code: "19851" }, { stop_id: "19852" }, { stop_id: "2001" }], rows);
    expect(platforms).toEqual([
      { stop_id: "19851", stop_code: "19851", rail: true, headsigns: ["Clareview", "Blatchford Gate"], routeIds: ["021R", "022R"] },
      { stop_id: "19852", stop_code: "19852", rail: true, headsigns: ["Century Park", "Health Sciences"], routeIds: ["021R", "022R"] },
      { stop_id: "2001", stop_code: "2001", rail: false, headsigns: ["University", "Clareview"], routeIds: ["002", "008"] },
    ]);
  });
});
