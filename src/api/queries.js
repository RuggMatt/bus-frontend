// @ts-check
import { getBusStopTimes, getTrip, getTripSummaries } from "./index";

// Queries several pages share, so they warm each other's cache. Use these rather than
// spelling the key out, so the key, request and staleTime always match (see SPEC.md's
// "Query keys shared across pages"). Add page-specific options, like `enabled`, on top.

/**
 * A trip with its shape (`getTrip`).
 * @param {string | number | null | undefined} tripId
 */
export const tripShapeQuery = (tripId) => ({
  queryKey: ["trip-shape", tripId],
  queryFn: () => getTrip(/** @type {string | number} */ (tripId)),
  staleTime: Infinity,
});

/**
 * A trip's scheduled stop times (`getBusStopTimes`).
 * @param {string | number | null | undefined} tripId
 */
export const tripStopTimesQuery = (tripId) => ({
  queryKey: ["trip-stop-times", tripId],
  queryFn: () => getBusStopTimes(/** @type {string | number} */ (tripId)),
  staleTime: Infinity,
});

/**
 * The route, headsign and direction of several trips (`getTripSummaries`).
 * @param {string[]} tripIds
 */
export const tripSummariesQuery = (tripIds) => ({
  queryKey: ["trip-summaries", tripIds],
  queryFn: () => getTripSummaries(tripIds),
  staleTime: Infinity,
});
