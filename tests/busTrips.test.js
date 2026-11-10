import { describe, expect, it } from "vitest";
import { busTripNeighbours, matchTripDelays, nextBlockTrips } from "../src/utils/busTrips";

// newest first, as the backend gives them
const trips = [
  { trip: 103, start: 5000, end: 5900 },
  { trip: null, start: 4000, end: 4800 },
  { trip: 102, start: 3000, end: 3900 },
  { trip: "", start: 2500, end: 2900 },
  { trip: 101, start: 1000, end: 1900 },
  { trip: 102, start: 100, end: 900 },
];

describe("busTripNeighbours", () => {
  it("gives the bus's in-service trips either side of the run", () => {
    const { previous, next } = busTripNeighbours(trips, "102", 3010, 3890);
    expect(previous?.trip).toBe(101);
    expect(next?.trip).toBe(103);
  });

  it("tells apart two runs of the same trip by their times", () => {
    const { previous, next } = busTripNeighbours(trips, "102", 150, 850);
    expect(previous).toBeNull();
    expect(next?.trip).toBe(101);
  });

  it("falls back to the run starting nearest when none overlaps", () => {
    expect(busTripNeighbours(trips, "103", 6500, 7000).previous?.trip).toBe(102);
  });

  it("has nothing either side when the trip isn't among the bus's", () => {
    expect(busTripNeighbours(trips, "999", 3000, 3900)).toEqual({ previous: null, next: null });
    expect(busTripNeighbours([], "102", 3000, 3900)).toEqual({ previous: null, next: null });
  });
});

describe("matchTripDelays", () => {
  const day = 86400;
  const run = (trip, start) => ({ trip, start, end: start + 1800 });
  const delay = (trip, firstScheduled, mean) => ({ trip, firstScheduled, mean });

  it("matches each run to its own day's delay", () => {
    const runs = [run(101, day + 100), run(101, 100), run(null, 50)];
    const matched = matchTripDelays(runs, [delay("101", 0, 60), delay(101, day, 120)]);
    expect(matched.get(runs[0])?.mean).toBe(120);
    expect(matched.get(runs[1])?.mean).toBe(60);
    expect(matched.has(runs[2])).toBe(false);
  });

  it("leaves out runs with no delay near them, like today's", () => {
    const runs = [run(101, 2 * day), run(102, 0)];
    expect(matchTripDelays(runs, [delay(101, 0, 60)]).size).toBe(0);
  });
});

describe("nextBlockTrips", () => {
  const block = [
    { trip_id: "5003", route_id: "008" },
    { trip_id: "6001", route_id: "008" },
    { trip_id: "5001", route_id: "008" },
    { trip_id: "5002", route_id: "008" },
    { trip_id: "7001", route_id: "009" },
  ];
  const starts = [
    { trip_id: "5001", start: "08:00:00" },
    { trip_id: "5002", start: "09:00:00" },
    { trip_id: "5003", start: "10:00:00" },
    { trip_id: "6001", start: "11:00:00" },
    { trip_id: "7001", start: "24:15:00" },
  ];

  it("lists the rest of the block in the order it starts, past midnight last", () => {
    expect(nextBlockTrips(block, starts, "5002")).toEqual([
      { trip_id: "5003", route_id: "008", start: "10:00:00" },
      { trip_id: "6001", route_id: "008", start: "11:00:00" },
      { trip_id: "7001", route_id: "009", start: "24:15:00" },
    ]);
    expect(nextBlockTrips(block, starts, 5002, 1).map((trip) => trip.trip_id)).toEqual(["5003"]);
  });

  it("has none after the block's last trip, or for a trip that isn't in it", () => {
    expect(nextBlockTrips(block, starts, "7001")).toEqual([]);
    expect(nextBlockTrips(block, starts, "9999")).toEqual([]);
    expect(nextBlockTrips(block, [], "5002")).toEqual([]);
  });

  it("leaves out trips without a start time", () => {
    expect(nextBlockTrips(block, starts.slice(0, 3), "5001").map((trip) => trip.trip_id)).toEqual(["5002", "5003"]);
  });
});
