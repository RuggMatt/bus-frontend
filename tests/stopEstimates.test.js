import { describe, expect, it } from "vitest";
import { NEIGHBOUR_SECONDS, estimateStopArrivals } from "../src/utils/stopEstimates";

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

describe("estimateStopArrivals with the bus's positions either side of the run", () => {
  const stops = [stop(53.501), stop(53.505), stop(53.509)];
  // the same road back south, as the bus's next trip
  const southward = [
    [53.51, LON],
    [53.5, LON],
  ];

  it("fills in the last stops after the bus switched to its next trip early", () => {
    // the run stops reporting halfway, when the bus takes its next trip's id
    const positions = [position(53.5, 100), position(53.503, 130), position(53.5055, 160)];
    expect(estimateStopArrivals(stops, positions, straight)[2]).toBeNull();
    // it drives on to the end, then turns back down the same road
    const after = [position(53.507, 190), position(53.5099, 220), position(53.508, 280), position(53.505, 310)];
    const [first, second, last] = estimateStopArrivals(stops, positions, straight, { after });
    expect(first).toBeLessThan(130);
    expect(second).toBeGreaterThan(130);
    expect(second).toBeLessThan(160);
    expect(last).toBeGreaterThan(190);
    expect(last).toBeLessThan(220);
  });

  it("doesn't change the stops the run gave a time", () => {
    const positions = [position(53.5, 100), position(53.503, 130), position(53.5055, 160)];
    const alone = estimateStopArrivals(stops, positions, straight);
    const after = [position(53.5099, 190)];
    expect(estimateStopArrivals(stops, positions, straight, { after }).slice(0, 2)).toEqual(alone.slice(0, 2));
  });

  it("only looks so far past the end of the run", () => {
    const positions = [position(53.5, 100), position(53.5055, 160)];
    const after = [position(53.507, 160 + NEIGHBOUR_SECONDS + 30), position(53.5099, 160 + NEIGHBOUR_SECONDS + 60)];
    expect(estimateStopArrivals(stops, positions, straight, { after })[2]).toBeNull();
  });

  it("starts a run that began on the last trip's road from when the bus reached the first stop", () => {
    // the next trip's id comes on while the bus is still heading north to the end of its
    // last trip, along the road this trip goes back down
    const positions = [
      position(53.507, 100),
      position(53.509, 130),
      position(53.50995, 160),
      position(53.51, 220),
      position(53.508, 280),
      position(53.5045, 340),
      position(53.5005, 400),
    ];
    const southStops = [stop(53.51), stop(53.506), stop(53.501)];
    const [first, second, last] = estimateStopArrivals(southStops, positions, southward);
    expect(first).toBeGreaterThan(220);
    expect(first).toBeLessThan(280);
    expect(second).toBeGreaterThan(280);
    expect(second).toBeLessThan(340);
    expect(last).toBeGreaterThan(340);
  });

  it("fills in the first stops when the bus kept its last trip's id for them", () => {
    // the run is only recorded from halfway; before that the bus left the first stop
    // still showing its last trip
    const before = [position(53.501, 40), position(53.501, 70), position(53.5025, 100)];
    const positions = [position(53.504, 130), position(53.51, 190)];
    expect(estimateStopArrivals(stops, positions, straight)[0]).toBeNull();
    const [first, second, last] = estimateStopArrivals(stops, positions, straight, { before });
    expect(first).toBeGreaterThan(70);
    expect(first).toBeLessThan(100);
    expect(second).toBeGreaterThan(130);
    expect(last).toBeGreaterThan(130);
  });

  it("doesn't fill in the first stops from positions that never reached the first stop", () => {
    // coming up the road from further away, as on a trip that didn't start here
    const before = [position(53.5025, 100)];
    const positions = [position(53.504, 130), position(53.51, 190)];
    expect(estimateStopArrivals(stops, positions, straight, { before })[0]).toBeNull();
  });
});

