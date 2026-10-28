// @ts-check
import { routeNumber } from "./routes";

const RESULT_COUNT = 20;

/**
 * @typedef {Object} SearchResult
 * @property {string} value `route:<route_id>` or `stop:<stop_id>`
 * @property {string} title
 * @property {string} subtitle
 */

/**
 * The main map's search: routes by number and stops by number or name, best matches first.
 * An exact route number comes first, then an exact stop number, then numbers starting with
 * the query (routes before stops, as there are far fewer), then names.
 * @param {string | null | undefined} query
 * @param {{route_id: string, route_short_name?: string, route_long_name?: string}[]} routes
 * @param {{stop_id: string, stop_code?: string, stop_name?: string, location_type?: string}[]} stops
 * @returns {SearchResult[]}
 */
export const rankSearchResults = (query, routes, stops) => {
  const text = (query || "").trim().toLowerCase();
  if (!text) return [];
  const words = text.split(/\s+/);
  /** @type {{result: SearchResult, rank: number, key: string}[]} */
  const ranked = [];
  for (const route of routes) {
    const number = (route.route_short_name || routeNumber(route.route_id)).toLowerCase();
    const name = (route.route_long_name || "").toLowerCase();
    let rank;
    if (number === text || routeNumber(route.route_id).toLowerCase() === text) rank = 0;
    else if (number.startsWith(text)) rank = 2;
    else if (words.every((word) => name.includes(word))) rank = 5;
    else continue;
    ranked.push({
      rank,
      key: number,
      result: { value: `route:${route.route_id}`, title: `Route ${routeNumber(route.route_id)}`, subtitle: route.route_long_name || "" },
    });
  }
  for (const stop of stops) {
    // platforms and stops only, not stations or entrances
    if (stop.location_type && stop.location_type !== "0") continue;
    // the number riders can read off the sign at the stop
    const code = (stop.stop_code || stop.stop_id).toLowerCase();
    const name = (stop.stop_name || "").toLowerCase();
    let rank;
    if (stop.stop_id.toLowerCase() === text || code === text) rank = 1;
    else if (code.startsWith(text)) rank = 3;
    else if (name.startsWith(text)) rank = 4;
    else if (words.every((word) => name.includes(word))) rank = 6;
    else continue;
    ranked.push({
      rank,
      key: code,
      result: { value: `stop:${stop.stop_id}`, title: stop.stop_name || `Stop ${code}`, subtitle: `Stop ${stop.stop_code || stop.stop_id}` },
    });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key, undefined, { numeric: true }))
    .slice(0, RESULT_COUNT)
    .map(({ result }) => result);
};
