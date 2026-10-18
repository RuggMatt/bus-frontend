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
