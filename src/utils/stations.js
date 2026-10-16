import { RAIL_ROUTE_TYPE, headsignWithoutRoute } from "./routes";

/**
 * @typedef {Object} Platform
 * @property {string} stop_id
 * @property {string} stop_code
 * @property {boolean} rail Every route here is LRT
 * @property {string[]} headsigns Where it goes, busiest first, without route numbers
 * @property {string[]} routeIds The routes stopping here, in route order
 */

/** @param {{location_type?: string}} stop */
const isBoardable = (stop) => !stop.location_type || stop.location_type === "0";

/**
 * The platforms or bays sharing a stop's station (its GTFS parent_station), the stop
 * included, by stop number. LRT stations have one platform per direction, and transit
 * centres one stop per bay. Empty when the stop has no station or is its only stop.
 * @template {{stop_id: string, stop_code?: string, location_type?: string, parent_station?: string}} S
 * @param {S} stop
 * @param {S[]} stops
 * @returns {S[]}
 */
export const stationStops = (stop, stops) => {
  if (!stop.parent_station) return [];
  const siblings = stops
    .filter((other) => other.parent_station === stop.parent_station && isBoardable(other))
    .sort((a, b) => String(a.stop_code || a.stop_id).localeCompare(String(b.stop_code || b.stop_id), undefined, { numeric: true }));
  return siblings.length > 1 ? siblings : [];
};

/**
 * Each route's busiest headsign at each stop, keyed `${stop_id}|${agency_name}|${route_id}`.
 * The usual direction of a route at a stop, for when no bus is on the way.
 * @param {import("../api").StopHeadsign[]} rows
 * @returns {Map<string, string>}
 */
export const mainHeadsigns = (rows) => {
  /** @type {Map<string, {headsign: string, trips: number}>} */
  const best = new Map();
  for (const row of rows) {
    const key = `${row.stop_id}|${row.agency_name}|${row.route_id}`;
    const trips = Number(row.trips);
    const current = best.get(key);
    if (row.trip_headsign && (!current || trips > current.trips)) best.set(key, { headsign: row.trip_headsign, trips });
  }
  return new Map([...best].map(([key, { headsign }]) => [key, headsign]));
};

/**
 * What a station's platforms serve, to tell them apart: names are the same for both
 * directions of an LRT station, so the headsigns say which way each goes.
 * @param {{stop_id: string, stop_code?: string}[]} stops
 * @param {import("../api").StopHeadsign[]} rows
 * @returns {Platform[]}
 */
export const describePlatforms = (stops, rows) =>
  stops.map((stop) => {
    const here = rows.filter((row) => row.stop_id === stop.stop_id);
    /** @type {Map<string, number>} */
    const trips = new Map();
    for (const row of here) {
      const headsign = headsignWithoutRoute(row.trip_headsign || "", row.route_id);
      if (headsign) trips.set(headsign, (trips.get(headsign) ?? 0) + Number(row.trips));
    }
    return {
      stop_id: stop.stop_id,
      stop_code: stop.stop_code || stop.stop_id,
      rail: here.length > 0 && here.every((row) => row.route_type === RAIL_ROUTE_TYPE),
      headsigns: [...trips].sort((a, b) => b[1] - a[1]).map(([headsign]) => headsign),
      routeIds: [...new Set(here.map((row) => row.route_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
  });
