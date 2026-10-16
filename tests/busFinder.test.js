import { describe, expect, it } from "vitest";
import { finderRows } from "../src/utils/busFinder";
import { formatDistance } from "../src/utils/geo";

const bus = (id, lat, long, trip = "1") => ({ bus: id, lat, long, trip, timestamp: 0, bearing: 0, speed: 0 });
const trips = new Map([["1", { route_id: "008", trip_headsign: "8 Abbottsfield" }]]);

describe("finderRows", () => {
  it("puts the nearest bus first", () => {
    const rows = finderRows([bus(8001, 53.6, -113.5), bus(8002, 53.52, -113.5)], trips, [53.52, -113.5]);
    expect(rows.map((row) => row.bus.bus)).toEqual([8002, 8001]);
    expect(rows[0].distance).toBeCloseTo(0);
    expect(rows[1].distance).toBeGreaterThan(8000);
  });

  it("sorts by bus number without a location", () => {
    const rows = finderRows([bus(8010, 53.5, -113.5), bus(8002, 53.6, -113.5)], trips, null);
    expect(rows.map((row) => row.bus.bus)).toEqual([8002, 8010]);
    expect(rows[0].distance).toBeNull();
  });

  it("has no trip for a bus out of service or off the feed", () => {
    const rows = finderRows([bus(8001, 53.5, -113.5, ""), bus(8002, 53.5, -113.5, "99")], trips, null);
    expect(rows.map((row) => row.trip)).toEqual([null, null]);
  });

  it("finds the trip of a bus on one", () => {
    expect(finderRows([bus(8001, 53.5, -113.5)], trips, null)[0].trip?.route_id).toBe("008");
  });
});

describe("formatDistance", () => {
  it("rounds metres to tens under a kilometre", () => {
    expect(formatDistance(347)).toBe("350 m");
  });

  it("shows kilometres from 1 km", () => {
    expect(formatDistance(1234)).toBe("1.2 km");
  });
});
