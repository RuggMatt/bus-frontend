// route numbers are zero-padded in the feed, e.g. "002"
/** @param {string} routeId */
export const routeNumber = (routeId) => routeId.replace(/^0+(?=.)/, "");

/**
 * A headsign without the route number it starts with, e.g. "128 Northgate" → "Northgate",
 * for showing beside a route badge. Variants such as "109A" or "2-Owl" are kept, as the
 * badge doesn't say them.
 * @param {string} headsign
 * @param {string} routeId
 * @returns {string}
 */
export const headsignWithoutRoute = (headsign, routeId) => {
  const prefix = `${routeNumber(routeId)} `;
  return headsign.startsWith(prefix) && headsign.length > prefix.length ? headsign.slice(prefix.length) : headsign;
};

// regional buses share stops with ETS, so say whose bus it is
export const LOCAL_AGENCY = "Edmonton Transit Service";

/**
 * One trip for each route shape a direction runs, enough to find every stop and line
 * the direction uses without loading every trip's stop times.
 * @template {{trip_id: string, direction_id: string, shape_id: string}} T
 * @param {T[]} trips
 * @param {string} directionId
 * @returns {T[]}
 */
export const representativeTrips = (trips, directionId) => {
  /** @type {Map<string, T>} */
  const byShape = new Map();
  for (const trip of trips) {
    if (trip.direction_id === directionId && !byShape.has(trip.shape_id)) {
      byShape.set(trip.shape_id, trip);
    }
  }
  return [...byShape.values()];
};

/**
 * Labels each direction by its most common headsign.
 * @param {{direction_id: string, trip_headsign?: string}[]} trips
 * @returns {Record<string, string>}
 */
export const directionLabels = (trips) => {
  /** @type {Map<string, Map<string, number>>} */
  const counts = new Map();
  for (const trip of trips) {
    const bucket = counts.get(trip.direction_id) ?? new Map();
    const headsign = trip.trip_headsign || "";
    bucket.set(headsign, (bucket.get(headsign) ?? 0) + 1);
    counts.set(trip.direction_id, bucket);
  }
  /** @type {Record<string, string>} */
  const labels = {};
  counts.forEach((headsigns, direction) => {
    const top = [...headsigns.entries()].sort((a, b) => b[1] - a[1])[0];
    labels[direction] = top?.[0] || `Direction ${direction}`;
  });
  return labels;
};
