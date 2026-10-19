// @ts-check

/**
 * @typedef {Object} BusTrip
 * @property {number|string|null} trip Empty or null while the bus wasn't on a trip
 * @property {number} start First position, Unix epoch seconds
 * @property {number} end Last position, Unix epoch seconds
 */

/**
 * The trips a bus ran either side of one of its runs, so it can be followed through the day.
 * Out-of-service stretches are skipped. The run is the bus's stretch on `tripId` that overlaps
 * `runStart` to `runEnd`, or the one starting nearest to `runStart` if none does.
 * @template {BusTrip} T
 * @param {T[]} trips The bus's trips, in any order
 * @param {string} tripId
 * @param {number} runStart Epoch seconds
 * @param {number} runEnd Epoch seconds
 * @returns {{previous: T | null, next: T | null}}
 */
export const busTripNeighbours = (trips, tripId, runStart, runEnd) => {
  const inService = trips
    .filter((trip) => trip.trip !== null && trip.trip !== "")
    .sort((a, b) => a.start - b.start);
  const runs = inService
    .map((trip, index) => ({ trip, index }))
    .filter(({ trip }) => String(trip.trip) === tripId);
  const overlapping = runs.find(({ trip }) => trip.start <= runEnd && trip.end >= runStart);
  const nearest = overlapping ?? runs.reduce(
    (best, run) => (!best || Math.abs(run.trip.start - runStart) < Math.abs(best.trip.start - runStart) ? run : best),
    /** @type {{trip: T, index: number} | undefined} */ (undefined),
  );
  if (!nearest) return { previous: null, next: null };
  return { previous: inService[nearest.index - 1] ?? null, next: inService[nearest.index + 1] ?? null };
};

// a run's first position and its first scheduled stop are this close at most, in seconds.
// The same trip id runs a day apart, so this only has to tell days apart
const RUN_MATCH_SECONDS = 6 * 3600;

/**
 * Finds each of a bus's runs in the nightly trip delays, so a row can say how late it ran.
 * A trip id repeats every service day, and a run past midnight belongs to the day before,
 * so a run is matched to the delay of its trip whose first scheduled time is nearest its
 * start, within RUN_MATCH_SECONDS.
 * @template {{trip: number|string, firstScheduled: number}} D
 * @param {BusTrip[]} trips
 * @param {D[]} delays
 * @returns {Map<BusTrip, D>} Only the runs that have one
 */
export const matchTripDelays = (trips, delays) => {
  /** @type {Map<string, D[]>} */
  const byTrip = new Map();
  for (const delay of delays) {
    const key = String(delay.trip);
    byTrip.set(key, [...(byTrip.get(key) ?? []), delay]);
  }
  /** @type {Map<BusTrip, D>} */
  const matched = new Map();
  for (const trip of trips) {
    if (trip.trip === null || trip.trip === "") continue;
    let best = null;
    for (const delay of byTrip.get(String(trip.trip)) ?? []) {
      const gap = Math.abs(delay.firstScheduled - trip.start);
      if (gap <= RUN_MATCH_SECONDS && (!best || gap < Math.abs(best.firstScheduled - trip.start))) best = delay;
    }
    if (best) matched.set(trip, best);
  }
  return matched;
};
