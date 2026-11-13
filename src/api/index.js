import { edmontonNow } from "../utils/serviceTime";
import { addDays } from "../utils/weeks";
import { RAIL_ROUTE_TYPE } from "../utils/routes";

const API_URL = import.meta.env.VITE_APP_API_URL;
const SODA_URL = "https://data.edmonton.ca/resource";

/**
 * Fetches JSON, throwing an error with the response's `status` when it isn't ok.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<any>}
 */
const fetchJson = async (url, headers = {}) => {
  const result = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
};

/**
 * Fetches a path from the backend.
 * @param {string} path
 * @returns {Promise<any>}
 */
const getJson = (path) => fetchJson(`${API_URL}${path}`);

/**
 * Fetches rows from a City of Edmonton open data (SODA) dataset.
 * @param {string} dataset The dataset id, like "ctwr-tvrd"
 * @param {URLSearchParams | Record<string, string>} [params]
 * @returns {Promise<any>}
 */
const soda = (dataset, params) => {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return fetchJson(`${SODA_URL}/${dataset}.json${query}`, {
    "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
  });
};

/**
 * Like `soda`, but a response that isn't ok gives `fallback` instead of an error.
 * @template T
 * @param {T} fallback
 * @param {string} dataset
 * @param {URLSearchParams | Record<string, string>} [params]
 * @returns {Promise<any | T>}
 */
const sodaOr = (fallback, dataset, params) =>
  soda(dataset, params).catch((error) => {
    if (error.status === undefined) throw error;
    return fallback;
  });

/**
 * A SoQL string literal, with single quotes escaped to prevent SoQL injection.
 * @param {string | number} value
 * @returns {string}
 */
const soqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * A SoQL list of string literals, for `IN (...)`.
 * @param {Array<string | number>} values
 * @returns {string}
 */
const soqlList = (values) => values.map(soqlString).join(",");

/**
 * The SoQL condition limiting the stop schedule view (`4fvt-p2se`) to the feed active
 * today, in Edmonton.
 * @returns {string}
 */
const activeFeed = () => {
  const today = edmontonNow().dateString;
  return `feed_start_date <= '${today}' AND feed_end_date >= '${today}'`;
};

/**
 * @param {[string, string][]} timeRanges Pairs of HH:MM:SS bounds on the arrival time
 * @returns {string} A SoQL condition matching any of them
 */
const arrivalBetween = (timeRanges) =>
  timeRanges.map(([from, to]) => `arrival_time between '${from}' and '${to}'`).join(" OR ");

const STOP_SCHEDULE = "4fvt-p2se";
const TRIPS = "ctwr-tvrd";
const STOP_TIMES = "greh-g7ac";

/**
 * @typedef {Object} ElectricBusHourlyStat
 * @property {string} hour ISO8601 hour string (e.g., "2025-11-24T12:00:00Z")
 * @property {number} unique_bus_count Number of unique electric buses for the hour
 */

/**
 *
 * @returns {Promise<Bus[]>}
 */
export const getAllBuses = () => getJson(`/bus/now`);

/**
 * Fetches each bus's position within a minute either side of an Edmonton time, for the
 * main map's time travel. Like /bus/now, without the predicted `delay`
 * @param {string} date YYYY-MM-DD
 * @param {string} time HH:MM
 * @returns {Promise<Bus[]>}
 */
export const getBusesAt = (date, time) => getJson(`/bus/${date}/${time}/1`);

/**
 * Fetches hourly electric bus stats from the backend API
 * @returns {Promise<ElectricBusHourlyStat[]>}
 */
export const getElectricBusStatsHourly = () => getJson(`/bus/stats/electric/hourly`);

/**
 * @typedef {Object} Bus
 * @property {number|string} bus The bus id, or the number that uniquely identifies the physical bus
 * @property {number} lat
 * @property {number} long
 * @property {number} trip
 * @property {number} timestamp UNix epoch timestamp in seconds
 * @property {number} bearing
 * @property {number} speed
 * @property {string|null} [route] GTFS route id of the trip, from the realtime feed
 * @property {string|null} [route_id] The same as route, assigned by useBuses
 * @property {number|null} [delay] /bus/now only: the agency's predicted delay at the trip's
 *   next stop, in seconds, positive when late. Null when unknown
 */

/**
 *
 * @returns {Promise<Bus[]>}
 */
export const getElectricBuses = () => getJson(`/bus/electric`);

/**
 * @typedef {Object} ElectricBusDailyStat
 * @property {string} day ISO8601 day string (e.g., "2025-11-24T00:00:00Z")
 * @property {number} unique_bus_count Number of unique electric buses for the day
 */

/**
 * Fetches daily electric bus stats from the backend API
 * @returns {Promise<ElectricBusDailyStat[]>}
 */
export const getElectricBusStatsDaily = () => getJson(`/bus/stats/electric/daily`);

/**
 * Fetches the list of active hydrogen buses
 * @returns {Promise<Bus[]>}
 */
export const getHydrogenBuses = () => getJson(`/bus/hydrogen`);

/**
 * Fetches recent trip data for a given tripId
 * @param {string|number} tripId The trip ID to fetch data for
 * @returns {Promise<Bus[]>} Promise resolving to an array of Bus objects
 *
 * @example
 *   getRecentTripData(123).then(buses => { ... })
 */
export const getRecentTripData = (tripId) => getJson(`/bus/trips/${tripId}`);

/**
 * @typedef {Object} BusInfo
 * @property {number|string} bus
 * @property {Bus} latest The bus's most recent recorded position
 * @property {number} firstSeen Unix epoch seconds
 * @property {number} lastSeen Unix epoch seconds
 * @property {boolean} active Whether the bus has reported in the last 2 minutes
 */

/**
 * Fetches a single bus, with its most recent position. A bus that has never been
 * seen throws an error with status 404.
 * @param {string|number} busId
 * @returns {Promise<BusInfo>}
 */
export const getBus = (busId) => getJson(`/bus/${encodeURIComponent(busId)}`);

/**
 * @typedef {Object} TripSummary
 * @property {number|string|null} trip Empty or null while the bus wasn't on a trip
 * @property {number} start First position on the trip, Unix epoch seconds
 * @property {number} end Last position on the trip, Unix epoch seconds
 * @property {number} points
 * @property {number|null} avgSpeed m/s
 * @property {number|null} maxSpeed m/s
 */

/**
 * Fetches the trips a bus has run, newest first, either in the last `hours` or on the
 * Edmonton days `from` to `to`. A trip is split when the bus goes 30 minutes without
 * reporting, and shows once per day it was run.
 * @param {string|number} busId
 * @param {{hours?: number, limit?: number, from?: string, to?: string}} [options] hours back, up to 168,
 *   or a YYYY-MM-DD range of at most 7 days, inclusive. A range defaults to 1000 trips
 * @returns {Promise<TripSummary[]>}
 */
export const getBusRecentTrips = (busId, { hours = 168, limit, from, to } = {}) => {
  const params = from && to
    ? new URLSearchParams({ from, to })
    : new URLSearchParams({ hours: String(hours), limit: String(limit ?? 50) });
  if (from && to && limit) params.set("limit", String(limit));
  return getJson(`/bus/${encodeURIComponent(busId)}/recent-trips?${params}`);
};

/**
 * @typedef {Object} TripCount
 * @property {string} period YYYY-MM-DD, the first day of the period in Edmonton
 * @property {number} start Start of the period, Unix epoch seconds
 * @property {number} trips Trips the bus started in the period
 */

/**
 * Fetches how many trips a bus started per day, week (Monday to Sunday) or month,
 * oldest first, with every period in the range listed. For weeks and months the
 * backend moves `from` back to the start of its period.
 * @param {string|number} busId
 * @param {{by?: 'day'|'week'|'month', from?: string, to?: string}} [options] YYYY-MM-DD Edmonton days,
 *   at most 366 days apart
 * @returns {Promise<TripCount[]>}
 */
export const getBusTripCounts = (busId, { by = "day", from, to } = {}) => {
  const params = new URLSearchParams({ by });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return getJson(`/bus/${encodeURIComponent(busId)}/trip-counts?${params}`);
};

/**
 * @typedef {Object} TripRun
 * @property {number|string} trip
 * @property {string} date YYYY-MM-DD, the Edmonton day the run started
 * @property {number} start First position, Unix epoch seconds
 * @property {number} end Last position, Unix epoch seconds. Can be on the next day
 * @property {number} points
 * @property {Array<number|string>} buses Every bus that reported on the run, usually one
 * @property {number|null} avgSpeed m/s
 * @property {number|null} maxSpeed m/s
 * @property {Bus[]} positions Oldest first
 * @property {RunNeighbour[]} [before] The bus's positions in the 15 minutes before the run,
 *   on any trip, oldest first. Missing from a backend from before they were added
 * @property {RunNeighbour[]} [after] And in the 15 minutes after it. A bus can take its next
 *   trip's id a few stops early, so these time the stops it had left
 */

/**
 * A position just outside a run, with only what the stop estimates need
 * @typedef {Object} RunNeighbour
 * @property {number|string} bus
 * @property {number|string|null} trip
 * @property {number} lat
 * @property {number} long
 * @property {number} timestamp Unix epoch seconds
 */

/**
 * Fetches the run of a trip that started on an Edmonton day. A day with no run
 * throws an error with status 404.
 * @param {string|number} tripId
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<TripRun>}
 */
export const getTripRun = (tripId, date) => getJson(`/bus/trips/${encodeURIComponent(tripId)}/${date}`);

/**
 * How late buses were at a stop over a week, worked out nightly from the recorded
 * positions. A delay is the time the bus was 25 m past the stop minus its scheduled
 * arrival, in seconds.
 * @typedef {Object} DelayStats
 * @property {string} from YYYY-MM-DD, the first Edmonton service day covered
 * @property {string} to YYYY-MM-DD, the last, inclusive
 * @property {number} count Times a bus went by
 * @property {number|null} mean Seconds, null without any times
 * @property {number|null} min Seconds
 * @property {number|null} max Seconds
 * @property {Array<{minutes: number, count: number}>} histogram By whole minutes rounded
 *   down (-30 s is in -1), only the minutes with times, earliest first. -10 holds
 *   anything earlier and 30 anything later
 */

/**
 * One trip at one of its stops over the last 7 days up to yesterday: a stop at a time
 * of day.
 * @param {string|number} tripId
 * @param {string|number} seq The stop's stop_sequence in the trip
 * @returns {Promise<DelayStats & {trip: number|string, seq: number, stop: string|null, route: string|null}>}
 */
export const getTripStopStats = (tripId, seq) =>
  getJson(`/stop-times/stats/trips/${encodeURIComponent(tripId)}/${encodeURIComponent(seq)}`);

/**
 * Every trip of a route at a stop over the last 7 days up to yesterday.
 * @param {string} routeId GTFS route id ("008")
 * @param {string} stopId
 * @param {string|number|null} [seq] Only the visits at this stop_sequence, for a stop
 *   the route passes more than once
 * @returns {Promise<DelayStats & {route: string, stop: string, seq: number|null, trips: number}>}
 */
export const getRouteStopStats = (routeId, stopId, seq = null) => {
  const params = seq === null ? "" : `?${new URLSearchParams({ seq: String(seq) })}`;
  return getJson(
    `/stop-times/stats/routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}${params}`,
  );
};

/**
 * When buses went by the stops of every trip of a route on a service day, worked out
 * nightly, so today has none yet.
 * @param {string} routeId GTFS route id ("008")
 * @param {string} date YYYY-MM-DD, the GTFS service day
 * @returns {Promise<import('../utils/actualTimes').RouteStopTimes>}
 */
export const getRouteStopTimes = (routeId, date) =>
  getJson(`/stop-times/routes/${encodeURIComponent(routeId)}/${date}`);

/**
 * Every trip of a route at each stop it was seen at, over the last 7 days up to
 * yesterday, in one request. A stop the route passes twice counts both visits.
 * @param {string} routeId GTFS route id ("008")
 * @returns {Promise<{route: string, from: string, to: string,
 *   stops: Array<Omit<DelayStats, 'from'|'to'> & {stop: string, trips: number}>}>}
 */
export const getRouteStopsStats = (routeId) =>
  getJson(`/stop-times/stats/routes/${encodeURIComponent(routeId)}/stops`);

/**
 * How late a trip, route or bus was over a range of service days, from the nightly
 * stop times. Delays are in seconds, positive when late.
 * @typedef {Object} DelayCounts
 * @property {number} stops Stop times counted
 * @property {number|null} mean Average delay
 * @property {number} max Worst delay
 * @property {number} onTime Stop times from a minute early to under 2 minutes late
 * @property {number} late Stop times 5 or more minutes late
 */

/**
 * @typedef {DelayCounts & {trip: number|string, date: string, route: string|null,
 *   bus: number|string|null, firstScheduled: number, maxStop: string|null, last: number}} TripDelay
 * One run of a trip: `date` is its service day, `bus` the one seen at most stops,
 * `firstScheduled` the scheduled time (epoch s) at the first stop it was seen at,
 * `maxStop` where it was latest and `last` its delay at the last stop seen
 */

/**
 * @typedef {DelayCounts & {trips: number, lateTrips: number,
 *   worst: {trip: number|string, date: string, route?: string|null}}} GroupDelay
 * Every trip of a route or bus: `lateTrips` were 5+ minutes late somewhere, `worst` had
 * the worst delay
 */

/**
 * @typedef {Object} DelayRanking
 * @property {string} from YYYY-MM-DD
 * @property {string} to YYYY-MM-DD, inclusive
 * @property {number} days How many days of the range have been worked out
 * @property {'mean'|'max'|'late'} sort
 * @property {TripDelay[]} [trips]
 * @property {Array<GroupDelay & {route: string}>} [routes]
 * @property {Array<GroupDelay & {bus: number|string}>} [buses]
 */

/**
 * The latest trips, routes or buses over up to 31 service days, worst first.
 * @param {'trip'|'route'|'bus'} by
 * @param {{from: string, to: string, sort: 'mean'|'max'|'late', route?: string|null, bus?: string|null, limit?: number}} options
 *   `route` only ranks one route's trips, and `bus` one bus's (the bus seen at most of a run's stops)
 * @returns {Promise<DelayRanking>}
 */
export const getDelayRanking = (by, { from, to, sort, route = null, bus = null, limit = 50 }) => {
  const params = new URLSearchParams({ from, to, sort, limit: String(limit) });
  if (by === "trip" && route) params.set("route", route);
  if (by === "trip" && bus) params.set("bus", bus);
  const path = { trip: "trips", route: "routes", bus: "buses" }[by];
  return getJson(`/stop-times/delays/${path}?${params}`);
};

/**
 * @typedef {Object} RouteTrip
 * @property {number} trip
 * @property {boolean} happened Always true, only trips that reported positions are listed
 * @property {number} start First position, Unix epoch seconds
 * @property {number} end Last position, Unix epoch seconds
 * @property {number} points
 * @property {Array<number|string>} buses Every bus that reported on the trip, usually one
 */

/**
 * @typedef {Object} RouteTrips
 * @property {string} route
 * @property {string} date YYYY-MM-DD
 * @property {number} count
 * @property {RouteTrip[]} trips Oldest first
 */

/**
 * Fetches the recorded trips of a route that started on an Edmonton day.
 * @param {string} routeId GTFS route id, like "008"
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<RouteTrips>}
 */
export const getRouteTrips = (routeId, date) => getJson(`/routes/${encodeURIComponent(routeId)}/trips/${date}`);

/**
 * Fetches hourly hydrogen bus stats from the backend API
 * @returns {Promise<ElectricBusHourlyStat[]>}
 */
export const getHydrogenBusStatsHourly = () => getJson(`/bus/stats/hydrogen/hourly`);

/**
 * Fetches daily hydrogen bus stats from the backend API
 * @returns {Promise<ElectricBusDailyStat[]>}
 */
export const getHydrogenBusStatsDaily = () => getJson(`/bus/stats/hydrogen/daily`);

/**
 * @typedef {Object} BusStop
 * @property {string} stop_id
 * @property {string} stop_code
 * @property {string} stop_name
 * @property {string} stop_lat
 * @property {string} stop_lon
 * @property {string} zone_id
 * @property {string} location_type 0 or empty for a stop or platform, 1 for a station, 2+ for entrances and the like
 * @property {string} [parent_station] The station a platform or bay belongs to, e.g. "Q7000"
 * @property {string} [platform_code] A platform or bay's own name, when the feed gives one
 * @property {GeometryPoint} geometry_point
 *
 */

/**
 * @typedef {Object} GeometryLine
 * @property {"MultiLineString"} type
 * @property {CoordinateSet[]} coordinates
 */

/**
 * @typedef {Object} GeometryPoint
 * @property {"Point"} type
 * @property {[number, number]} coordinates
 */

/**
 * @typedef {[number, number][]} CoordinateSet
 */

/**
 * @typedef {Object} Trip
 * @property {string} route_id
 * @property {string} service_id
 * @property {string} trip_id
 * @property {string} trip_headsign
 * @property {string} direction_id
 * @property {string} block_id
 * @property {string} shape_id
 * @property {boolean} wheelchair_accessible
 * @property {boolean} bikes_allowed
 * @property {GeometryLine} geometry_line
 */

/**
 * Gets a list of 1000 bus stops from the edmonton data api
 * @param {number} offset
 *
 * @return {Promise<BusStop[]>}
 */
const getBusStops = (offset = null) => soda("4vt2-8zrq", offset ? { $offset: String(offset) } : undefined);

/**
 *
 * @returns {Promise<BusStop[]>}
 */
export const getAllBusStops = async () => {
  let stops = await getBusStops();
  let offset = 0;
  while (stops.length % 1000 === 0 && offset < stops.length) {
    offset += 1000;
    stops = [...stops, ...(await getBusStops(offset))];
  }
  return stops;
};

/** 
 * @typedef {Object} BusStopTime 
 * @property {string} trip_id Identifies a trip.
 * @property {string} arrival_time 	
Arrival time at a specific stop for a specific trip on a route. For times occurring after midnight on the service day, the time has a value greater than 24:00:00 in HH:MM:SS local time for the day on which the trip schedule begins.
 * @property {string} departure_time 	
Departure time from a specific stop for  a specific trip on a route. For times occurring after midnight on the service day, the time has a value greater than 24:00:00 in HH:MM:SS local time for the day on which the trip schedule begins.
 * @property {string} stop_id Identifies the serviced stop.
 * @property {string} stop_sequence 	
Order of stops for a particular trip. The values must increase along the trip but do not need to be consecutive.
 * @property {string} drop_off_type 	
Indicates drop off method. Valid options are: 0 or empty - Regularly scheduled drop off. 1 - No drop off available. 2 - Must phone agency to arrange drop off. 3 - Must coordinate with driver to arrange drop off.
 * @property {string} arrival_time_fixed Not from the GTFS feed. For times occurring after midnight on the service day, times have values greater than 24:00:00; this column represents such times normally (i.e. for hours >= 24, 24 is subtracted)
 * @property {string} departure_time_fixed Not from the GTFS feed. For times occurring after midnight on the service day, times have values greater than 24:00:00; this column represents such times normally (i.e. for hours >= 24, 24 is subtracted)
 * 
 */

/**
 *
 * @param {string|number} tripId The trip id to get bus stop times for
 * @returns {Promise<BusStopTime[]>}
 */
export const getBusStopTimes = (tripId) => sodaOr([], STOP_TIMES, { trip_id: String(tripId) });

/**
 *
 * @param {} tripId
 * @returns {Promise<Trip | null>}
 */
export const getTrip = async (tripId) => {
  const trips = await sodaOr([], TRIPS, { trip_id: String(tripId) });
  return trips[0] ?? null;
};

/**
 * Fetches the route and headsign of several trips, without their shapes. Trips the
 * feed doesn't know are left out.
 * @param {string[]} tripIds
 * @returns {Promise<Array<Pick<Trip, "trip_id" | "route_id" | "trip_headsign" | "direction_id">>>}
 */
export const getTripSummaries = async (tripIds) => {
  if (!tripIds.length) return [];
  return soda(TRIPS, {
    $select: "trip_id,route_id,trip_headsign,direction_id",
    $where: `trip_id IN (${soqlList(tripIds)})`,
    $limit: "1000",
  });
};

/**
 * Fetches the trips of a block, the chain of trips one bus is scheduled to run in a
 * day, without their shapes. Block ids repeat across services, so it's one service's.
 * @param {string} blockId
 * @param {string} serviceId
 * @returns {Promise<Array<Pick<Trip, "trip_id" | "route_id" | "trip_headsign" | "direction_id">>>}
 */
export const getBlockTrips = (blockId, serviceId) =>
  soda(TRIPS, {
    $select: "trip_id,route_id,trip_headsign,direction_id",
    $where: `block_id = ${soqlString(blockId)} AND service_id = ${soqlString(serviceId)}`,
    $limit: "1000",
  });

/**
 * @typedef {Object} Route
 * @property {string} route_id
 * @property {string} route_short_name
 * @property {string} route_long_name
 * @property {string} route_type
 * @property {string} route_type_descr
 */

/**
 *
 * @returns {Promise<Route[]>}
 */
export const getAllRoutes = () => soda("d577-xky7");

/**
 * Fetches every trip for a specific route from the Edmonton open data API, without
 * their shapes. A busy route has over a thousand trips, and with shapes 500 of them
 * were nearly 10 MB.
 * @param {string} routeId
 * @returns {Promise<Array<Pick<Trip, "trip_id" | "route_id" | "service_id" | "trip_headsign" | "direction_id" | "shape_id">>>}
 */
export const getTripsByRouteId = (routeId) =>
  soda(TRIPS, {
    route_id: routeId,
    $select: "trip_id,route_id,service_id,trip_headsign,direction_id,shape_id",
    $limit: "50000",
  });

/**
 * Fetches the trip IDs that belong to the currently-active GTFS feed for a given route.
 * Uses the ETS GTFS Feed Trip Schedule dataset to filter by today's date.
 * @param {string} routeId
 * @returns {Promise<Array<{trip_id: string}>>}
 */
export const getActiveTripsByRouteId = (routeId) => {
  const today = new Date().toISOString().split("T")[0];
  return sodaOr([], STOP_SCHEDULE, {
    $where: `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND route_id = ${soqlString(routeId)}`,
    $select: "trip_id",
    $group: "trip_id",
    $limit: "5000",
  });
};

/**
 * Fetches every date the given services run, from the GTFS calendar dates. ETS lists
 * each date outright, including holidays and one-off schedules.
 * @param {string[]} serviceIds
 * @returns {Promise<Array<{service_id: string, date: string, exception_type: string}>>} date is a timestamp
 */
export const getServiceDates = async (serviceIds) => {
  if (!serviceIds.length) return [];
  return soda("f2sy-bth7", {
    $select: "service_id,date,exception_type",
    $where: `service_id IN (${soqlList(serviceIds)})`,
    $limit: "50000",
  });
};

/**
 * @typedef {Object} StopScheduleEntry
 * @property {string} trip_id
 * @property {string} route_id
 * @property {string} route_long_name
 * @property {string} agency_name The transit agency running the route, e.g. "St. Albert Transit"
 * @property {string} route_type GTFS route type, "0" for LRT and "3" for bus
 * @property {string} trip_headsign
 * @property {string} service_id
 * @property {string} arrival_time HH:MM:SS, 24:00:00 or later for times after midnight on the service day
 * @property {string} stop_sequence
 */

/**
 * Fetches the trips scheduled to serve a stop within the given time ranges, from
 * the currently-active GTFS feed.
 * @param {string} stopId
 * @param {[string, string][]} timeRanges Pairs of HH:MM:SS bounds on the arrival time
 * @returns {Promise<StopScheduleEntry[]>}
 */
export const getStopSchedule = async (stopId, timeRanges) => {
  const where = `${activeFeed()} AND stop_id = ${soqlString(stopId)} AND (${arrivalBetween(timeRanges)})`;
  const select = "trip_id,route_id,route_long_name,agency_name,route_type,trip_headsign,service_id,arrival_time,stop_sequence";
  const pageSize = 1000;
  const query = (params) => soda(STOP_SCHEDULE, { $where: where, ...params });
  const getPage = (offset) =>
    query({ $select: select, $order: "trip_id,stop_sequence", $limit: String(pageSize), $offset: String(offset) });
  // count alongside the first page so any remaining pages can be fetched in parallel
  const [countResult, firstResult] = await Promise.allSettled([
    query({ $select: "count(*) as count" }),
    getPage(0),
  ]);
  // nothing to show without the first page, so let the caller show its error state
  if (firstResult.status === "rejected") {
    throw firstResult.reason;
  }
  const entries = [...firstResult.value];
  if (entries.length < pageSize) {
    return entries;
  }
  const count = countResult.status === "fulfilled" ? Number(countResult.value[0]?.count) : NaN;
  if (!Number.isFinite(count)) {
    // without a count, page one at a time until a short page or a failure
    console.warn("Could not count stop schedule rows, paging sequentially", countResult.reason);
    try {
      let page;
      do {
        page = await getPage(entries.length);
        entries.push(...page);
      } while (page.length === pageSize);
    } catch (error) {
      console.warn("Could not load the rest of the stop schedule", error);
    }
    return entries;
  }
  const offsets = [];
  for (let offset = pageSize; offset < count; offset += pageSize) {
    offsets.push(offset);
  }
  const rest = await Promise.allSettled(offsets.map(getPage));
  for (const result of rest) {
    if (result.status === "fulfilled") {
      entries.push(...result.value);
    } else {
      console.warn("Could not load a page of the stop schedule", result.reason);
    }
  }
  return entries;
};

/**
 * @typedef {StopScheduleEntry & {stop_id: string, stop_name: string}} RouteScheduleEntry
 */

/**
 * Fetches a route's stop times within the given time ranges, on some services, from
 * the currently-active GTFS feed. For lines we can't follow live (LRT), to show each
 * station's next trains.
 * @param {string} routeId
 * @param {string[]} serviceIds
 * @param {[string, string][]} timeRanges Pairs of HH:MM:SS bounds on the arrival time
 * @returns {Promise<RouteScheduleEntry[]>}
 */
export const getRouteSchedule = async (routeId, serviceIds, timeRanges) => {
  if (!serviceIds.length) return [];
  return soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND route_id = ${soqlString(routeId)} AND service_id IN (${soqlList(serviceIds)}) AND (${arrivalBetween(timeRanges)})`,
    $select: "trip_id,route_id,route_long_name,agency_name,route_type,trip_headsign,service_id,arrival_time,stop_sequence,stop_id,stop_name",
    $order: "arrival_time",
    $limit: "10000",
  });
};

/**
 * Fetches every time a route is scheduled at a stop, on all its services, from the
 * currently-active GTFS feed. Which services run on a day is left to the caller.
 * @param {string} stopId
 * @param {string} routeId
 * @param {string} agencyName Route ids are only unique within an agency
 * @returns {Promise<StopScheduleEntry[]>}
 */
export const getStopRouteSchedule = (stopId, routeId, agencyName) =>
  soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND stop_id = ${soqlString(stopId)} AND route_id = ${soqlString(routeId)} AND agency_name = ${soqlString(agencyName)}`,
    $select: "trip_id,route_id,route_long_name,agency_name,route_type,trip_headsign,service_id,arrival_time,stop_sequence",
    $order: "arrival_time",
    $limit: "10000",
  });

/**
 * @typedef {Object} StopHeadsign
 * @property {string} stop_id
 * @property {string} route_id
 * @property {string} agency_name
 * @property {string} route_type
 * @property {string} trip_headsign
 * @property {string} trips How many trips in the feed stop here going there
 */

/**
 * Fetches where each route at some stops goes, with how many trips go there, in the
 * currently-active GTFS feed. Tells a stop's usual direction, and which platform of a
 * station is which.
 * @param {string[]} stopIds
 * @returns {Promise<StopHeadsign[]>}
 */
export const getStopHeadsigns = async (stopIds) => {
  if (!stopIds.length) return [];
  const group = "stop_id,route_id,agency_name,route_type,trip_headsign";
  return soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND stop_id IN (${soqlList(stopIds)})`,
    $select: `${group},count(*) as trips`,
    $group: group,
    $limit: "5000",
  });
};

/**
 * @typedef {Object} StopRoute
 * @property {string} route_id
 * @property {string} route_long_name
 * @property {string} agency_name
 * @property {string} route_type GTFS route type, "0" for LRT and "3" for bus
 */

/**
 * Fetches the routes that serve a stop in the currently-active GTFS feed.
 * @param {string} stopId
 * @returns {Promise<StopRoute[]>}
 */
export const getStopRoutes = (stopId) => {
  const fields = "route_id,route_long_name,agency_name,route_type";
  return soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND stop_id = ${soqlString(stopId)}`,
    $select: fields,
    $group: fields,
    $order: "route_id",
  });
};

/**
 * Fetches the stops an LRT route serves in the currently-active GTFS feed, to tell LRT
 * stations apart from bus stops.
 * @returns {Promise<string[]>}
 */
export const getRailStopIds = async () => {
  const rows = await soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND route_type = '${RAIL_ROUTE_TYPE}'`,
    $select: "stop_id",
    $group: "stop_id",
    $limit: "5000",
  });
  return rows.map((row) => row.stop_id);
};

/**
 * @typedef {Object} Agency
 * @property {string} agency_id
 * @property {string} agency_name
 * @property {string} [agency_url]
 * @property {string} [agency_fare_url]
 * @property {string} [agency_phone]
 */

/**
 * Fetches the transit agencies in the GTFS feed, with their website, fares page and phone.
 * @returns {Promise<Agency[]>}
 */
export const getAgencies = () => soda("isug-45sj");

/**
 * @typedef {Object} RouteAgency
 * @property {string} route_id
 * @property {string} agency_name
 */

/**
 * Fetches the agency running each route in the currently-active GTFS feed. The routes
 * dataset doesn't say, so this groups the stop schedule view instead.
 * @returns {Promise<RouteAgency[]>}
 */
export const getRouteAgencies = () =>
  soda(STOP_SCHEDULE, {
    $where: activeFeed(),
    $select: "route_id,agency_name",
    $group: "route_id,agency_name",
    $limit: "5000",
  });

/**
 * @typedef {Object} StopNextArrival
 * @property {string} route_id
 * @property {string} agency_name
 * @property {string} service_id
 * @property {string} next_time HH:MM:SS, the earliest arrival for this route and service from the given time
 */

/**
 * Fetches the earliest arrival at a stop from a time of day, for each route and
 * service pattern in the currently-active GTFS feed. Which days each service runs
 * is left to the caller.
 * @param {string} stopId
 * @param {string} fromTime HH:MM:SS, where HH may be 24 or more
 * @returns {Promise<StopNextArrival[]>}
 */
export const getStopNextArrivals = (stopId, fromTime) => {
  const group = "route_id,agency_name,service_id";
  return soda(STOP_SCHEDULE, {
    $where: `${activeFeed()} AND stop_id = ${soqlString(stopId)} AND arrival_time >= '${fromTime}'`,
    $select: `${group},min(arrival_time) as next_time`,
    $group: group,
    $limit: "1000",
  });
};

/**
 * Fetches stop times for multiple trips in a single request.
 * @param {string[]} tripIds
 * @returns {Promise<BusStopTime[]>}
 */
export const getStopTimesByTripIds = async (tripIds) => {
  if (!tripIds.length) return [];
  return sodaOr([], STOP_TIMES, {
    $where: `trip_id IN (${soqlList(tripIds)})`,
    $order: "trip_id,stop_sequence",
    $limit: "10000",
  });
};

/**
 * Fetches when each trip starts, its earliest departure time. Times are zero-padded, so
 * the minimum as text is the earliest. Keep the list to a few hundred ids, as it goes in the URL.
 * @param {string[]} tripIds
 * @returns {Promise<Array<{trip_id: string, start: string}>>} start is HH:MM:SS, and can pass 24:00:00
 */
export const getTripStartTimes = async (tripIds) => {
  if (!tripIds.length) return [];
  return soda(STOP_TIMES, {
    $select: "trip_id,min(departure_time) as start",
    $where: `trip_id IN (${soqlList(tripIds)})`,
    $group: "trip_id",
    $limit: "10000",
  });
};

/**
 * @typedef {Object} DiskStats
 * @property {number} availableBytes
 * @property {number} totalBytes
 * @property {number} usedBytes
 * @property {number} percentFull
 * @property {number} [databaseBytes] Size of the database file and its WAL
 * @property {number} [reusableBytes] Space inside the database freed by trims, reused before the file grows
 * @property {number} [effectivePercentFull] percentFull not counting reusableBytes, which the disk alert goes by
 */

/**
 * Fetches disk stats from the backend API
 * @returns {Promise<DiskStats>}
 */
export const getDiskStats = () => getJson(`/bus/stats/disk`);

/**
 * Fetches the City's service disruption alerts that ended in the last week or haven't
 * ended, one row per alert, route and period. The whole dataset is a few hundred rows.
 * @returns {Promise<import('../utils/serviceAlerts').ServiceAlertRow[]>}
 */
export const getServiceAlerts = () => {
  // times are Edmonton local time without a zone
  const since = `${addDays(edmontonNow().dateString, -7)}T00:00:00`;
  return soda("5yvt-mcye", {
    $select: "alert_id,start_dttm,end_dttm,route_id,stop_id,cause,effect,header_text,description_text",
    $where: `is_deleted = false AND end_dttm >= '${since}'`,
    $limit: "5000",
  });
};
