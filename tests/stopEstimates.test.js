import { describe, expect, it } from "vitest";
import { estimateStopArrival, estimateStopArrivals } from "../src/utils/stopEstimates";

// ~111 m per 0.001° of latitude
const position = (lat, timestamp) => ({ lat, long: -113.5, timestamp });
const stop = (lat) => ({ lat, lon: -113.5 });

describe("estimateStopArrival", () => {
  it("takes the time of the nearest position", () => {
    const positions = [position(53.5, 100), position(53.501, 200), position(53.502, 300)];
    expect(estimateStopArrival(stop(53.5011), positions)).toBe(200);
  });

  it("gives nothing when no position is within 1 km", () => {
    expect(estimateStopArrival(stop(53.52), [position(53.5, 100)])).toBeNull();
  });

  it("skips positions before notBefore", () => {
    const positions = [position(53.5, 100), position(53.503, 400)];
    expect(estimateStopArrival(stop(53.5), positions, 200)).toBe(400);
  });
});

describe("estimateStopArrivals", () => {
  it("keeps a loop's last stops after the ones before them", () => {
    // out to 53.505 and back: the last stop is where the trip started
    const positions = [
      position(53.5, 100),
      position(53.5025, 200),
      position(53.505, 300),
      position(53.5025, 400),
      position(53.5001, 500),
    ];
    const stops = [stop(53.5), stop(53.505), stop(53.5024), stop(53.5)];
    expect(estimateStopArrivals(stops, positions)).toEqual([100, 300, 400, 500]);
  });

  it("carries the last estimate past stops without one", () => {
    const positions = [position(53.5, 100), position(53.505, 300), position(53.5, 500)];
    expect(estimateStopArrivals([stop(53.505), null, stop(53.6), stop(53.5)], positions)).toEqual([
      300,
      null,
      null,
      500,
    ]);
  });
});
