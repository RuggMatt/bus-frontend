// @ts-check
import { timeToSeconds } from "./serviceTime";

/**
 * @typedef {Object} DayTrip
 * @property {string} trip_id
 * @property {string} start HH:MM:SS, and can pass 24:00:00
 */

/**
 * The trips going one way on a day, once each.
 * @template {{trip_id: string, direction_id: string, service_id: string}} T
 * @param {T[]} trips The route's trips
 * @param {Set<string>} services The services running that day
 * @param {string} directionId
 * @returns {T[]}
 */
export const tripsOnDate = (trips, services, directionId) => {
  const seen = new Set();
  return trips.filter((trip) => {
    if (trip.direction_id !== directionId || !services.has(trip.service_id) || seen.has(trip.trip_id)) return false;
    seen.add(trip.trip_id);
    return true;
  });
};

/**
 * Trips with their start times, earliest first. Trips with no known start are left out.
 * @param {string[]} tripIds
 * @param {Array<{trip_id: string, start: string}>} starts
 * @returns {DayTrip[]}
 */
export const sortByStart = (tripIds, starts) => {
  const wanted = new Set(tripIds);
  /** @type {Map<string, string>} */
  const startOf = new Map();
  for (const { trip_id, start } of starts) {
    if (wanted.has(trip_id) && start) startOf.set(trip_id, start);
  }
  return [...startOf]
    .map(([trip_id, start]) => ({ trip_id, start }))
    .sort((a, b) => timeToSeconds(a.start) - timeToSeconds(b.start) || a.trip_id.localeCompare(b.trip_id));
};

/**
 * The trips either side of one.
 * @param {DayTrip[]} trips
 * @param {string} tripId
 * @returns {{previous: DayTrip | null, next: DayTrip | null}}
 */
export const adjacentTrips = (trips, tripId) => {
  const index = trips.findIndex((trip) => trip.trip_id === tripId);
  if (index === -1) return { previous: null, next: null };
  return { previous: trips[index - 1] ?? null, next: trips[index + 1] ?? null };
};

/**
 * The trip starting closest to a time, the earlier one on a tie.
 * @param {DayTrip[]} trips
 * @param {string} start HH:MM:SS
 * @returns {DayTrip | null}
 */
export const nearestByStart = (trips, start) => {
  const target = timeToSeconds(start);
  /** @type {DayTrip | null} */
  let best = null;
  let bestGap = Infinity;
  for (const trip of trips) {
    const gap = Math.abs(timeToSeconds(trip.start) - target);
    if (gap < bestGap) {
      best = trip;
      bestGap = gap;
    }
  }
  return best;
};
