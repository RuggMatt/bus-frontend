import { describe, expect, it } from "vitest";
import { rankSearchResults } from "../src/utils/mapSearch";

const routes = [
  { route_id: "008", route_long_name: "Abbottsfield - Downtown - University" },
  { route_id: "080", route_long_name: "Capilano - Downtown" },
  { route_id: "009", route_long_name: "Eaux Claires - Downtown" },
];
const stops = [
  { stop_id: "8001", stop_name: "Downtown Station" },
  { stop_id: "1987", stop_name: "109 Street & Kingsway" },
  { stop_id: "1000", stop_name: "Clareview Station", location_type: "1" },
];
const values = (query) => rankSearchResults(query, routes, stops).map((result) => result.value);

describe("rankSearchResults", () => {
  it("puts an exact route number first, then routes and stops starting with it", () => {
    expect(values("8")).toEqual(["route:008", "route:080", "stop:8001"]);
  });

  it("finds a stop by its number", () => {
    expect(values("1987")).toEqual(["stop:1987"]);
    expect(rankSearchResults("1987", routes, stops)[0]).toEqual({ value: "stop:1987", title: "109 Street & Kingsway", subtitle: "Stop 1987" });
  });

  it("finds stops and routes by name, leaving out stations", () => {
    expect(values("downtown")).toEqual(["stop:8001", "route:008", "route:009", "route:080"]);
    expect(values("clareview")).toEqual([]);
  });

  it("titles routes by number", () => {
    expect(rankSearchResults("80", routes, stops)[0]).toEqual({ value: "route:080", title: "Route 80", subtitle: "Capilano - Downtown" });
  });

  it("gives nothing for an empty query", () => {
    expect(values("  ")).toEqual([]);
  });
});
