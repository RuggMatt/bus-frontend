import { describe, expect, it } from "vitest";
import { bayName, describePlatforms, mainHeadsigns, sortBays, stationStops, stopPlaces } from "../src/utils/stations";

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

describe("stopPlaces", () => {
  const at = (stop, lat, lon) => ({ stop_name: `Stop ${stop.stop_id}`, stop_lat: String(lat), stop_lon: String(lon), ...stop });
  const all = [
    at({ stop_id: "Q7000", location_type: "1", stop_name: "Health Sciences Station" }, 53.52, -113.52),
    at({ stop_id: "19852", stop_code: "19852", location_type: "0", parent_station: "Q7000" }, 53.5201, -113.5201),
    at({ stop_id: "19851", stop_code: "19851", location_type: "0", parent_station: "Q7000" }, 53.5199, -113.5199),
    at({ stop_id: "E262", location_type: "2", parent_station: "Q7000" }, 53.52, -113.52),
    at({ stop_id: "Q2000", location_type: "1", stop_name: "Southgate Transit Centre" }, 53.48, -113.51),
    at({ stop_id: "2213", stop_code: "2213", location_type: "0", parent_station: "Q2000" }, 53.48, -113.51),
    at({ stop_id: "2211", stop_code: "2211", location_type: "0", parent_station: "Q2000" }, 53.48, -113.51),
    at({ stop_id: "9981", stop_code: "9981", location_type: "0", stop_name: "Muttart Stop" }, 53.53, -113.47),
    at({ stop_id: "1987", stop_code: "1987", location_type: "0" }, 53.5, -113.5),
    at({ stop_id: "5000", stop_code: "5000", location_type: "0", parent_station: "Q1" }, 53.4, -113.4),
  ];
  const places = stopPlaces(all, new Set(["19851", "19852", "9981"]));

  it("finds LRT stations and transit centres by what stops there", () => {
    expect(places.map(({ key, name, type }) => ({ key, name, type }))).toEqual([
      { key: "Q7000", name: "Health Sciences Station", type: "lrt" },
      { key: "Q2000", name: "Southgate Transit Centre", type: "transit-centre" },
      { key: "9981", name: "Muttart Stop", type: "lrt" },
    ]);
  });

  it("lists each place's platforms or bays by number, at the station", () => {
    expect(places[1].stops.map((stop) => stop.stop_id)).toEqual(["2211", "2213"]);
    expect(places[0].stops.map((stop) => stop.stop_id)).toEqual(["19851", "19852"]);
    expect([places[0].lat, places[0].lon]).toEqual([53.52, -113.52]);
  });
});

describe("bayName", () => {
  it("finds the bay in the stop's name", () => {
    expect(bayName({ stop_name: "Southgate Transit Centre Bay A" }, "Southgate Transit Centre")).toBe("Bay A");
    expect(bayName({ stop_name: "West Edmonton Mall Transit Centre - bay 12" })).toBe("Bay 12");
    expect(bayName({ stop_name: "Clareview Station Platform 2b" })).toBe("Platform 2B");
  });

  it("uses the feed's platform code", () => {
    expect(bayName({ stop_name: "Meadows Transit Centre", platform_code: "c" })).toBe("Bay C");
    expect(bayName({ stop_name: "Meadows Transit Centre", platform_code: "North Loop" })).toBe("North Loop");
  });

  it("takes what the name adds to the station's", () => {
    expect(bayName({ stop_name: "Millgate Transit Centre (Eastbound)" }, "Millgate Transit Centre")).toBe("Eastbound");
  });

  it("is null when only the stop number tells it apart", () => {
    expect(bayName({ stop_name: "Millgate Transit Centre" }, "Millgate Transit Centre")).toBeNull();
    expect(bayName({ stop_name: "Blatchford Gate Station" })).toBeNull();
    expect(bayName({ stop_name: "Jasper Gates Transit Centre" }, "Lewis Farms")).toBeNull();
  });
});

describe("sortBays", () => {
  it("puts named bays in order, then the rest by stop number", () => {
    const names = { 1: "Bay 10", 2: "Bay B", 3: null, 4: "Bay 2", 5: null };
    const bays = [
      { stop_id: "1", stop_code: "2001" },
      { stop_id: "2", stop_code: "2002" },
      { stop_id: "3", stop_code: "2210" },
      { stop_id: "4", stop_code: "2004" },
      { stop_id: "5", stop_code: "2009" },
    ];
    expect(sortBays(bays, (stop) => names[stop.stop_id]).map((stop) => stop.stop_id)).toEqual(["4", "1", "2", "5", "3"]);
  });
});
