import { distanceMetres } from "./geo";

// past this, no recorded position is close enough to say when the bus was at the stop
export const MAX_ESTIMATE_DISTANCE_METRES = 1000;

/**
 * When the bus was at a stop: the time of the recorded position nearest it, among
 * those from notBefore on
 * @param {{lat: number|string, lon: number|string}} stop
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @param {number} [notBefore] unix seconds
 * @returns {number|null} unix seconds, or null when nothing is within range
 */
export const estimateStopArrival = (stop, positions, notBefore = -Infinity) => {
  const stopPoint = /** @type {[number, number]} */ ([Number(stop.lat), Number(stop.lon)]);
  if (!stopPoint.every(Number.isFinite)) {
    return null;
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const position of positions) {
    if (position.timestamp < notBefore) {
      continue;
    }
    const point = /** @type {[number, number]} */ ([Number(position.lat), Number(position.long)]);
    if (!point.every(Number.isFinite)) {
      continue;
    }
    const distance = distanceMetres(stopPoint, point);
    if (distance < nearestDistance) {
      nearest = position;
      nearestDistance = distance;
    }
  }
  return nearest && nearestDistance <= MAX_ESTIMATE_DISTANCE_METRES ? nearest.timestamp : null;
};

/**
 * Estimates each stop in trip order, each no earlier than the one before it. On a loop
 * the last stops are near the first ones, and the nearest position can be from the
 * start of the trip.
 * @param {Array<{lat: number|string, lon: number|string} | null>} stops in trip order
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @returns {Array<number|null>} unix seconds per stop
 */
export const estimateStopArrivals = (stops, positions) => {
  let notBefore = -Infinity;
  return stops.map((stop) => {
    const estimate = stop ? estimateStopArrival(stop, positions, notBefore) : null;
    if (estimate !== null) {
      notBefore = estimate;
    }
    return estimate;
  });
};
