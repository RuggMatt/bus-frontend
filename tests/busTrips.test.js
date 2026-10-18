import { describe, expect, it } from "vitest";
import { busTripNeighbours } from "../src/utils/busTrips";

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
