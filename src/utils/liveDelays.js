// @ts-check
// the delays page's running-now section, from the predicted delays /bus/now gives each bus
import { predictedOffsetMinutes, scheduleStatus } from "./busStatus";

/**
 * @typedef {Object} LiveTrip
 * @property {string} trip
 * @property {string|null} route GTFS route id
 * @property {number|string} bus
 * @property {number} delay Predicted delay at the next stop, in seconds, positive when late
 * @property {number} minutes The delay rounded to the minute, like the map's pins
 */

/**
 * Every trip out now that has a predicted delay, latest first. A trip with two buses
 * on it keeps the one that reported last.
 * @param {import("../api").Bus[] | null | undefined} buses
 * @returns {LiveTrip[]}
 */
export const liveTrips = (buses) => {
  /** @type {Map<string, import("../api").Bus>} */
  const byTrip = new Map();
  for (const bus of buses ?? []) {
    const trip = String(bus.trip ?? "");
    // out of service, or no prediction
    if (!trip || predictedOffsetMinutes(bus) === null) continue;
    const seen = byTrip.get(trip);
    if (!seen || seen.timestamp < bus.timestamp) byTrip.set(trip, bus);
  }
  return [...byTrip.entries()]
    .map(([trip, bus]) => ({
      trip,
      route: bus.route ?? null,
      bus: bus.bus,
      delay: /** @type {number} */ (bus.delay),
      minutes: /** @type {number} */ (predictedOffsetMinutes(bus)),
    }))
    .sort((a, b) => b.delay - a.delay || a.trip.localeCompare(b.trip));
};

/**
 * How many trips are on time, late, 5+ min late and early, as the chips decide
 * @param {LiveTrip[]} trips
 * @returns {{total: number, onTime: number, late: number, veryLate: number, early: number}}
 */
export const liveTripCounts = (trips) => {
  const counts = { total: trips.length, onTime: 0, late: 0, veryLate: 0, early: 0 };
  for (const trip of trips) {
    const { color } = scheduleStatus(trip.minutes);
    if (color === "warning") counts.late++;
    else if (color === "info") counts.early++;
    else counts.onTime++;
    if (trip.minutes >= 5) counts.veryLate++;
  }
  return counts;
};
