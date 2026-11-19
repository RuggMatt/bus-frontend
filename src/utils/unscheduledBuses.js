// @ts-check
import { RAIL_ROUTE_TYPE } from "./routes";

/**
 * A live bus's trip can be missing from a stop's schedule though its route serves the
 * stop: the open data's stop times have at times held only another schedule period's
 * services (in November 2026, each route's next one), so none of the trips running
 * today had any. Such a bus still counts for the stop when its route and headsign are
 * ones the stop's schedule has, through that entry's route details.
 *
 * @typedef {Omit<import("../api").StopScheduleEntry, "arrival_time"> & {arrival_time: string | null}} StopTripEntry
 *   arrival_time is null when the trip's own time here isn't known
 */

/** @param {string | null | undefined} routeId @param {string | null | undefined} headsign */
const headsignKey = (routeId, headsign) => `${routeId}|${headsign}`;

/**
 * The trips of live buses missing from a stop's schedule whose routes serve the stop,
 * to look up their headsigns.
 * @param {import("../api").Bus[]} buses
 * @param {Map<string, import("../api").StopScheduleEntry>} scheduleByTrip
 * @param {import("../api").StopScheduleEntry[]} schedule
 * @returns {string[]} Sorted, so they make a stable query key
 */
export const unscheduledTripIds = (buses, scheduleByTrip, schedule) => {
  const routes = new Set(schedule.filter((entry) => entry.route_type !== RAIL_ROUTE_TYPE).map((entry) => entry.route_id));
  const ids = buses
    .filter((bus) => bus.trip && bus.route && routes.has(bus.route) && !scheduleByTrip.has(String(bus.trip)))
    .map((bus) => String(bus.trip));
  return [...new Set(ids)].sort();
};

/**
 * Stop entries for those trips, by trip id, from a scheduled trip at the stop with the
 * same route and headsign, but with no time of their own.
 * @param {Array<{trip_id: string, route_id: string, trip_headsign: string}>} summaries The trips' routes and headsigns
 * @param {import("../api").StopScheduleEntry[]} schedule
 * @returns {Map<string, StopTripEntry>}
 */
export const unscheduledEntries = (summaries, schedule) => {
  /** @type {Map<string, import("../api").StopScheduleEntry>} */
  const byHeadsign = new Map();
  for (const entry of schedule) {
    if (entry.route_type === RAIL_ROUTE_TYPE) continue;
    const key = headsignKey(entry.route_id, entry.trip_headsign);
    if (!byHeadsign.has(key)) byHeadsign.set(key, entry);
  }
  /** @type {Map<string, StopTripEntry>} */
  const entries = new Map();
  for (const trip of summaries) {
    const entry = byHeadsign.get(headsignKey(trip.route_id, trip.trip_headsign));
    if (entry) entries.set(String(trip.trip_id), { ...entry, trip_id: String(trip.trip_id), arrival_time: null });
  }
  return entries;
};
