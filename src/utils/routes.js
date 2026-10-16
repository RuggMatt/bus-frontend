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

/**
 * A route's live buses grouped by where they're headed, for the routes list. Groups go
 * by direction then headsign, and buses by number. Buses whose trip isn't in the feed
 * come last, with a null headsign.
 * @template {{bus: string|number, trip: string|number}} B
 * @param {B[]} buses
 * @param {{trip_id: string, trip_headsign?: string, direction_id?: string}[]} summaries
 * @param {string} routeId
 * @returns {{headsign: string|null, buses: B[]}[]}
 */
export const busesByHeadsign = (buses, summaries, routeId) => {
  const tripsById = new Map(summaries.map((summary) => [String(summary.trip_id), summary]));
  /** @type {Map<string|null, {headsign: string|null, direction: string, buses: B[]}>} */
  const groups = new Map();
  for (const bus of buses) {
    const trip = tripsById.get(String(bus.trip));
    const headsign = trip?.trip_headsign ? headsignWithoutRoute(trip.trip_headsign, routeId) : null;
    if (!groups.has(headsign)) groups.set(headsign, { headsign, direction: trip?.direction_id ?? "", buses: [] });
    groups.get(headsign)?.buses.push(bus);
  }
  const busOrder = (/** @type {B} */ a, /** @type {B} */ b) =>
    String(a.bus).localeCompare(String(b.bus), undefined, { numeric: true });
  return [...groups.values()]
    .sort((a, b) =>
      (a.headsign === null ? 1 : 0) - (b.headsign === null ? 1 : 0) ||
      a.direction.localeCompare(b.direction) ||
      String(a.headsign).localeCompare(String(b.headsign)))
    .map(({ headsign, buses: groupBuses }) => ({ headsign, buses: groupBuses.sort(busOrder) }));
};

// GTFS route_type values, as the routes dataset describes them
const ROUTE_TYPE_LABELS = { 0: "LRT", 3: "Bus" };

/** @param {string} routeType */
export const routeTypeLabel = (routeType) => ROUTE_TYPE_LABELS[routeType] ?? "Other";

/**
 * @typedef {Object} RouteFilters
 * @property {string} [search] matched against the long name and route id
 * @property {string|null} [type] a GTFS route_type
 * @property {string|null} [agency] an agency_name
 * @property {boolean} [live] only routes with a bus on them now
 * @property {boolean} [disrupted] only routes with a service alert in effect
 */

/**
 * The routes list's search and filters. A route with no known agency is kept under any
 * agency until the agencies load.
 * @template {{route_id: string, route_long_name?: string, route_type?: string}} R
 * @param {R[]} routes
 * @param {RouteFilters} filters
 * @param {{agencies?: Map<string, string>, liveRoutes?: Set<string>, disruptedRoutes?: Set<string>}} context
 * @returns {R[]}
 */
export const filterRoutes = (routes, filters, { agencies, liveRoutes, disruptedRoutes } = {}) => {
  const term = (filters.search ?? "").trim().toLowerCase();
  return routes.filter((route) => {
    if (term && !(route.route_long_name ?? "").toLowerCase().includes(term) && !route.route_id.toLowerCase().includes(term)) return false;
    if (filters.type && route.route_type !== filters.type) return false;
    if (filters.agency && agencies?.size && agencies.get(route.route_id) !== filters.agency) return false;
    if (filters.live && !liveRoutes?.has(route.route_id)) return false;
    if (filters.disrupted && !disruptedRoutes?.has(route.route_id)) return false;
    return true;
  });
};

/**
 * Orders agencies with the local one first, then the regional ones by name.
 * @param {string} a
 * @param {string} b
 */
export const compareAgencies = (a, b) =>
  (b === LOCAL_AGENCY ? 1 : 0) - (a === LOCAL_AGENCY ? 1 : 0) || a.localeCompare(b);

/**
 * Splits routes by the agency running them, keeping each agency's routes in order.
 * Routes with no known agency come last, under a null agency.
 * @template {{route_id: string}} R
 * @param {R[]} routes
 * @param {Map<string, string>} agencyByRoute
 * @returns {{agency: string|null, routes: R[]}[]}
 */
export const groupRoutesByAgency = (routes, agencyByRoute) => {
  /** @type {Map<string|null, R[]>} */
  const groups = new Map();
  for (const route of routes) {
    const agency = agencyByRoute.get(route.route_id) ?? null;
    if (!groups.has(agency)) groups.set(agency, []);
    groups.get(agency)?.push(route);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : 0) - (b === null ? 1 : 0) || compareAgencies(a ?? "", b ?? ""))
    .map(([agency, agencyRoutes]) => ({ agency, routes: agencyRoutes }));
};
