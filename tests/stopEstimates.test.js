import { describe, expect, it } from "vitest";
import { estimateStopArrivals } from "../src/utils/stopEstimates";

// ~111 m per 0.001° of latitude
const LON = -113.5;
const position = (lat, timestamp, long = LON) => ({ lat, long, timestamp });
const stop = (lat, lon = LON) => ({ lat, lon });
// a straight route north from 53.5 to 53.51, about 1.1 km
const straight = [
  [53.5, LON],
  [53.51, LON],
];

describe("estimateStopArrivals", () => {
  it("gives nothing for a stop the bus hasn't passed, however close it is", () => {
    // the bus is 10 m short of the stop at 53.505
    const positions = [position(53.5, 100), position(53.50491, 200)];
    expect(estimateStopArrivals([stop(53.505)], positions, straight)).toEqual([null]);
  });

  it("works out the time between the positions either side of the stop", () => {
    // 53.5 → 53.506 in 60 s; the stop plus 25 m is about 5/6 of the way
    const positions = [position(53.5, 100), position(53.506, 160)];
    const [estimate] = estimateStopArrivals([stop(53.505)], positions, straight);
    expect(estimate).toBeGreaterThan(150);
    expect(estimate).toBeLessThan(156);
  });

  it("takes the positions in time order, whatever order they come in", () => {
    const positions = [position(53.506, 160), position(53.5, 100)];
    const [estimate] = estimateStopArrivals([stop(53.505)], positions, straight);
    expect(estimate).toBeGreaterThan(150);
  });

  it("counts the first stop once the bus leaves it, not while it waits there", () => {
    const positions = [
      position(53.5, 100),
      position(53.50005, 130),
      position(53.49998, 160),
      position(53.5009, 190),
    ];
    const [estimate] = estimateStopArrivals([stop(53.5)], positions, straight);
    expect(estimate).toBeGreaterThan(160);
  });

  it("counts the last stop once the bus reaches the end of the route", () => {
    const positions = [position(53.505, 100), position(53.5099, 160)];
    const [estimate] = estimateStopArrivals([stop(53.51)], positions, straight);
    expect(estimate).not.toBeNull();
  });

  it("gives nothing for stops passed before the bus was first recorded", () => {
    const positions = [position(53.508, 100), position(53.509, 130)];
    expect(estimateStopArrivals([stop(53.5)], positions, straight)).toEqual([null]);
  });

  it("ignores positions far off the route", () => {
    // a fix 1 km east, level with the stop
    const positions = [position(53.5, 100), position(53.506, 130, LON + 0.015), position(53.5045, 160)];
    expect(estimateStopArrivals([stop(53.505)], positions, straight)).toEqual([null]);
  });

  it("doesn't count the far side of a loop until the bus gets there", () => {
    // out east along 53.5, north, and back west along 53.5003, about 33 m away
    const loop = [
      [53.5, -113.52],
      [53.5, -113.5],
      [53.5003, -113.5],
      [53.5003, -113.52],
    ];
    const outbound = stop(53.5, -113.51);
    const inbound = stop(53.5003, -113.51);
    // the bus has just passed the outbound stop
    const positions = [position(53.5, 100, -113.52), position(53.5, 200, -113.5095)];
    const midway = estimateStopArrivals([outbound, inbound], positions, loop);
    expect(midway[0]).not.toBeNull();
    expect(midway[1]).toBeNull();
    // and later passes the inbound one
    const later = [...positions, position(53.5, 300, -113.5), position(53.5003, 400, -113.5105)];
    const done = estimateStopArrivals([outbound, inbound], later, loop);
    expect(done[0]).toBe(midway[0]);
    expect(done[1]).toBeGreaterThan(300);
  });

  it("places a loop's last stop at the end, not where the trip started", () => {
    // out to 53.505 and back down the same line
    const outAndBack = [
      [53.5, LON],
      [53.505, LON],
      [53.5, LON],
    ];
    const positions = [position(53.5, 100), position(53.505, 200), position(53.5025, 250)];
    // halfway back: the first stop has gone by, the last one (the same spot) hasn't
    const stops = [stop(53.5), stop(53.505), stop(53.5)];
    expect(estimateStopArrivals(stops, positions, outAndBack)).toEqual([
      expect.any(Number),
      expect.any(Number),
      null,
    ]);
    const back = [...positions, position(53.50001, 300)];
    const [first, , last] = estimateStopArrivals(stops, back, outAndBack);
    expect(first).toBeLessThan(200);
    expect(last).toBeGreaterThan(250);
  });

  it("gives nothing without a route shape or for stops without a place", () => {
    const positions = [position(53.5, 100), position(53.51, 200)];
    expect(estimateStopArrivals([stop(53.505)], positions, [])).toEqual([null]);
    expect(estimateStopArrivals([null], positions, straight)).toEqual([null]);
  });
});
