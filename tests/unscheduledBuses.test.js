import { describe, expect, it } from "vitest";
import { unscheduledEntries, unscheduledTripIds } from "../src/utils/unscheduledBuses";

const scheduled = (tripId, routeId, headsign, routeType = "3") => ({
  trip_id: tripId,
  route_id: routeId,
  route_long_name: `Route ${routeId}`,
  agency_name: "Edmonton Transit Service",
  route_type: routeType,
  trip_headsign: headsign,
  service_id: `DX-${routeId}-Weekday-6-26-12-1111100`,
  arrival_time: "20:50:00",
  stop_sequence: "12",
});

// the stop's schedule only has the next period's trips, none of the ones running today
const schedule = [
  scheduled("34220684", "008", "8 University"),
  scheduled("34220700", "008", "8 University"),
  scheduled("33561795", "021R", "Clareview", "0"),
];
const scheduleByTrip = new Map(schedule.map((entry) => [entry.trip_id, entry]));

describe("unscheduledTripIds", () => {
  it("is the trips of buses on the stop's bus routes that the schedule lacks", () => {
    const buses = [
      { bus: 1, trip: 32755357, route: "008" },
      { bus: 2, trip: 32755342, route: "008" },
      { bus: 3, trip: 34220684, route: "008" },
      { bus: 4, trip: 32000001, route: "001" },
      { bus: 5, trip: 32755357, route: "008" },
      { bus: 6, trip: 33000000, route: "021R" },
    ];
    expect(unscheduledTripIds(buses, scheduleByTrip, schedule)).toEqual(["32755342", "32755357"]);
  });
});

describe("unscheduledEntries", () => {
  it("borrows a scheduled trip's route details for the same headsign, without its time", () => {
    const entries = unscheduledEntries(
      [
        { trip_id: "32755357", route_id: "008", trip_headsign: "8 University" },
        { trip_id: "32755429", route_id: "008", trip_headsign: "8 Abbottsfield" },
      ],
      schedule,
    );
    expect([...entries.keys()]).toEqual(["32755357"]);
    expect(entries.get("32755357")).toMatchObject({
      trip_id: "32755357",
      route_id: "008",
      route_long_name: "Route 008",
      trip_headsign: "8 University",
      arrival_time: null,
    });
  });
});
