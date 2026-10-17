import { edmontonNow } from "../utils/serviceTime";
import { addDays } from "../utils/weeks";
import { RAIL_ROUTE_TYPE } from "../utils/routes";

/**
 * @typedef {Object} ElectricBusHourlyStat
 * @property {string} hour ISO8601 hour string (e.g., "2025-11-24T12:00:00Z")
 * @property {number} unique_bus_count Number of unique electric buses for the hour
 */

/**
 *
 * @returns {Promise<Bus[]>}
 */
export const getAllBuses = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/now`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches hourly electric bus stats from the backend API
 * @returns {Promise<ElectricBusHourlyStat[]>}
 */
export const getElectricBusStatsHourly = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/stats/electric/hourly`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * @typedef {Object} Bus
 * @property {number|string} bus The bus id, or the number that uniquely identifies the physical bus
 * @property {number} lat
 * @property {number} long
 * @property {number} trip
 * @property {number} timestamp UNix epoch timestamp in seconds
 * @property {number} bearing
 * @property {number} speed
 * @property {string|null} [route_id] Assigned dynamically by useBuses
 */

/**
 *
 * @returns {Promise<Bus[]>}
 */
export const getElectricBuses = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/electric`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * @typedef {Object} ElectricBusDailyStat
 * @property {string} day ISO8601 day string (e.g., "2025-11-24T00:00:00Z")
 * @property {number} unique_bus_count Number of unique electric buses for the day
 */

/**
 * Fetches daily electric bus stats from the backend API
 * @returns {Promise<ElectricBusDailyStat[]>}
 */
export const getElectricBusStatsDaily = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/stats/electric/daily`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches the list of active hydrogen buses
 * @returns {Promise<Bus[]>}
 */
export const getHydrogenBuses = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/hydrogen`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches recent trip data for a given tripId
 * @param {string|number} tripId The trip ID to fetch data for
 * @returns {Promise<Bus[]>} Promise resolving to an array of Bus objects
 *
 * @example
 *   getRecentTripData(123).then(buses => { ... })
 */
export const getRecentTripData = async (tripId) => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/trips/${tripId}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

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
export const getBus = async (busId) => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/${encodeURIComponent(busId)}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
};

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
export const getBusRecentTrips = async (busId, { hours = 168, limit, from, to } = {}) => {
  const params = from && to
    ? new URLSearchParams({ from, to })
    : new URLSearchParams({ hours: String(hours), limit: String(limit ?? 50) });
  if (from && to && limit) params.set("limit", String(limit));
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/${encodeURIComponent(busId)}/recent-trips?${params}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Error(result.status);
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
export const getBusTripCounts = async (busId, { by = "day", from, to } = {}) => {
  const params = new URLSearchParams({ by });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/${encodeURIComponent(busId)}/trip-counts?${params}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
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
 */

/**
 * Fetches the run of a trip that started on an Edmonton day. A day with no run
 * throws an error with status 404.
 * @param {string|number} tripId
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<TripRun>}
 */
export const getTripRun = async (tripId, date) => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/trips/${encodeURIComponent(tripId)}/${date}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
};

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
 * @param {string} url
 * @returns {Promise<any>}
 */
const getJson = async (url) => {
  const result = await fetch(url, { headers: { Accept: "application/json" } });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
};

/**
 * One trip at one of its stops over the last 7 days up to yesterday: a stop at a time
 * of day.
 * @param {string|number} tripId
 * @param {string|number} seq The stop's stop_sequence in the trip
 * @returns {Promise<DelayStats & {trip: number|string, seq: number, stop: string|null, route: string|null}>}
 */
export const getTripStopStats = (tripId, seq) =>
  getJson(`${import.meta.env.VITE_APP_API_URL}/stop-times/stats/trips/${encodeURIComponent(tripId)}/${encodeURIComponent(seq)}`);

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
    `${import.meta.env.VITE_APP_API_URL}/stop-times/stats/routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}${params}`,
  );
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
export const getRouteTrips = async (routeId, date) => {
  const url = `${import.meta.env.VITE_APP_API_URL}/routes/${encodeURIComponent(routeId)}/trips/${date}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Object.assign(Error(result.status), { status: result.status });
};

/**
 * Fetches hourly hydrogen bus stats from the backend API
 * @returns {Promise<ElectricBusHourlyStat[]>}
 */
export const getHydrogenBusStatsHourly = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/stats/hydrogen/hourly`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches daily hydrogen bus stats from the backend API
 * @returns {Promise<ElectricBusDailyStat[]>}
 */
export const getHydrogenBusStatsDaily = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/stats/hydrogen/daily`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

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
const getBusStops = async (offset = null) => {
  let url = "https://data.edmonton.ca/resource/4vt2-8zrq.json";
  if (offset) {
    url += `?$offset=${offset}`;
  }
  let result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

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
export const getBusStopTimes = async (tripId) => {
  let url = `https://data.edmonton.ca/resource/greh-g7ac.json?trip_id=${tripId}`;

  let result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  }
  return [];
};

/**
 *
 * @param {} tripId
 * @returns {Promise<Trip | null>}
 */
export const getTrip = async (tripId) => {
  let result = await fetch(
    `https://data.edmonton.ca/resource/ctwr-tvrd.json?trip_id=${tripId}`,
    {
      headers: {
        Accept: "application/json",
        "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
      },
    },
  );
  if (result.ok) {
    let trip = (await result.json())[0];
    if (trip) {
      return trip;
    }
  }
  return null;
};

/**
 *
 * @param {string[]} tripIds
 * @returns {Promise<{route_id: string, trip_id: string}[]>}
 */
export const getTrips = async (tripIds) => {
  // Escape single quotes to prevent SoQL injection
  const tripIdParams = tripIds.map((tripId) => `'${String(tripId).replace(/'/g, "''")}'`).join(",");
  let result = await fetch(
    `https://data.edmonton.ca/resource/ctwr-tvrd.json?$select=trip_id,route_id&$where=trip_id IN (${tripIdParams})`,
    {
      headers: {
        Accept: "application/json",
        "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
      },
    },
  );
  if (result.ok) {
    return result.json();
  }
  throw Error(result.status);
};

/**
 * Fetches the route and headsign of several trips, without their shapes. Trips the
 * feed doesn't know are left out.
 * @param {string[]} tripIds
 * @returns {Promise<Array<Pick<Trip, "trip_id" | "route_id" | "trip_headsign" | "direction_id">>>}
 */
export const getTripSummaries = async (tripIds) => {
  if (!tripIds.length) return [];
  // Escape single quotes to prevent SoQL injection
  const idList = tripIds.map((tripId) => `'${String(tripId).replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    $select: "trip_id,route_id,trip_headsign,direction_id",
    $where: `trip_id IN (${idList})`,
    $limit: "1000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/ctwr-tvrd.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Error(result.status);
};

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
export const getAllRoutes = async () => {
  let url = `https://data.edmonton.ca/resource/d577-xky7.json`;
  let result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches every trip for a specific route from the Edmonton open data API, without
 * their shapes. A busy route has over a thousand trips, and with shapes 500 of them
 * were nearly 10 MB.
 * @param {string} routeId
 * @returns {Promise<Array<Pick<Trip, "trip_id" | "route_id" | "service_id" | "trip_headsign" | "direction_id" | "shape_id">>>}
 */
export const getTripsByRouteId = async (routeId) => {
  const params = new URLSearchParams({
    route_id: routeId,
    $select: "trip_id,route_id,service_id,trip_headsign,direction_id,shape_id",
    $limit: "50000",
  });
  const url = `https://data.edmonton.ca/resource/ctwr-tvrd.json?${params}`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches the trip IDs that belong to the currently-active GTFS feed for a given route.
 * Uses the ETS GTFS Feed Trip Schedule dataset to filter by today's date.
 * @param {string} routeId
 * @returns {Promise<Array<{trip_id: string}>>}
 */
export const getActiveTripsByRouteId = async (routeId) => {
  const today = new Date().toISOString().split("T")[0];
  // Escape single quotes to prevent SoQL injection
  const safeRouteId = String(routeId).replace(/'/g, "''");
  const where = `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND route_id = '${safeRouteId}'`;
  const url = `https://data.edmonton.ca/resource/4fvt-p2se.json?$where=${encodeURIComponent(where)}&$select=trip_id&$group=trip_id&$limit=5000`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  }
  return [];
};

/**
 * Fetches every date the given services run, from the GTFS calendar dates. ETS lists
 * each date outright, including holidays and one-off schedules.
 * @param {string[]} serviceIds
 * @returns {Promise<Array<{service_id: string, date: string, exception_type: string}>>} date is a timestamp
 */
export const getServiceDates = async (serviceIds) => {
  if (!serviceIds.length) return [];
  // Escape single quotes to prevent SoQL injection
  const idList = serviceIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    $select: "service_id,date,exception_type",
    $where: `service_id IN (${idList})`,
    $limit: "50000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/f2sy-bth7.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
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
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const safeStopId = String(stopId).replace(/'/g, "''");
  const timeFilter = timeRanges
    .map(([from, to]) => `arrival_time between '${from}' and '${to}'`)
    .join(" OR ");
  const where = `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND stop_id = '${safeStopId}' AND (${timeFilter})`;
  const select = "trip_id,route_id,route_long_name,agency_name,route_type,trip_headsign,service_id,arrival_time,stop_sequence";
  const pageSize = 1000;
  const query = async (params) => {
    const url = `https://data.edmonton.ca/resource/4fvt-p2se.json?$where=${encodeURIComponent(where)}&${params}`;
    const result = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
      },
    });
    if (!result.ok) {
      throw Error(result.status);
    }
    return result.json();
  };
  const getPage = (offset) =>
    query(`$select=${select}&$order=trip_id,stop_sequence&$limit=${pageSize}&$offset=${offset}`);
  // count alongside the first page so any remaining pages can be fetched in parallel
  const [countResult, firstResult] = await Promise.allSettled([
    query("$select=count(*) as count"),
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
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const timeFilter = timeRanges
    .map(([from, to]) => `arrival_time between '${from}' and '${to}'`)
    .join(" OR ");
  const params = new URLSearchParams({
    $where: `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND route_id = ${quote(routeId)} AND service_id IN (${serviceIds.map(quote).join(",")}) AND (${timeFilter})`,
    $select: "trip_id,route_id,route_long_name,agency_name,route_type,trip_headsign,service_id,arrival_time,stop_sequence,stop_id,stop_name",
    $order: "arrival_time",
    $limit: "10000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/4fvt-p2se.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
};

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
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const idList = stopIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
  const group = "stop_id,route_id,agency_name,route_type,trip_headsign";
  const params = new URLSearchParams({
    $where: `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND stop_id IN (${idList})`,
    $select: `${group},count(*) as trips`,
    $group: group,
    $limit: "5000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/4fvt-p2se.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
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
export const getStopRoutes = async (stopId) => {
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const safeStopId = String(stopId).replace(/'/g, "''");
  const where = `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND stop_id = '${safeStopId}'`;
  const fields = "route_id,route_long_name,agency_name,route_type";
  const url = `https://data.edmonton.ca/resource/4fvt-p2se.json?$where=${encodeURIComponent(where)}&$select=${fields}&$group=${fields}&$order=route_id`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches the stops an LRT route serves in the currently-active GTFS feed, to tell LRT
 * stations apart from bus stops.
 * @returns {Promise<string[]>}
 */
export const getRailStopIds = async () => {
  const today = edmontonNow().dateString;
  const params = new URLSearchParams({
    $where: `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND route_type = '${RAIL_ROUTE_TYPE}'`,
    $select: "stop_id",
    $group: "stop_id",
    $limit: "5000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/4fvt-p2se.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return (await result.json()).map((row) => row.stop_id);
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
export const getAgencies = async () => {
  const result = await fetch("https://data.edmonton.ca/resource/isug-45sj.json", {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
};

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
export const getRouteAgencies = async () => {
  const today = edmontonNow().dateString;
  const params = new URLSearchParams({
    $where: `feed_start_date <= '${today}' AND feed_end_date >= '${today}'`,
    $select: "route_id,agency_name",
    $group: "route_id,agency_name",
    $limit: "5000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/4fvt-p2se.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
};

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
export const getStopNextArrivals = async (stopId, fromTime) => {
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const safeStopId = String(stopId).replace(/'/g, "''");
  const where = `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND stop_id = '${safeStopId}' AND arrival_time >= '${fromTime}'`;
  const group = "route_id,agency_name,service_id";
  const params = new URLSearchParams({
    $where: where,
    $select: `${group},min(arrival_time) as next_time`,
    $group: group,
    $limit: "1000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/4fvt-p2se.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
};

/**
 * Fetches stop times for multiple trips in a single request.
 * @param {string[]} tripIds
 * @returns {Promise<BusStopTime[]>}
 */
export const getStopTimesByTripIds = async (tripIds) => {
  if (!tripIds.length) return [];
  const idList = tripIds.map((id) => `'${id}'`).join(",");
  const url = `https://data.edmonton.ca/resource/greh-g7ac.json?$where=trip_id IN (${idList})&$order=trip_id,stop_sequence&$limit=10000`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  }
  return [];
};

/**
 * Fetches when each trip starts, its earliest departure time. Times are zero-padded, so
 * the minimum as text is the earliest. Keep the list to a few hundred ids, as it goes in the URL.
 * @param {string[]} tripIds
 * @returns {Promise<Array<{trip_id: string, start: string}>>} start is HH:MM:SS, and can pass 24:00:00
 */
export const getTripStartTimes = async (tripIds) => {
  if (!tripIds.length) return [];
  // Escape single quotes to prevent SoQL injection
  const idList = tripIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    $select: "trip_id,min(departure_time) as start",
    $where: `trip_id IN (${idList})`,
    $group: "trip_id",
    $limit: "10000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/greh-g7ac.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (result.ok) {
    return result.json();
  }
  throw Error(result.status);
};

/**
 * @typedef {Object} DiskStats
 * @property {number} availableBytes
 * @property {number} totalBytes
 * @property {number} usedBytes
 * @property {number} percentFull
 */

/**
 * Fetches disk stats from the backend API
 * @returns {Promise<DiskStats>}
 */
export const getDiskStats = async () => {
  const url = `${import.meta.env.VITE_APP_API_URL}/bus/stats/disk`;
  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (result.ok) {
    return result.json();
  } else {
    throw Error(result.status);
  }
};

/**
 * Fetches the City's service disruption alerts that ended in the last week or haven't
 * ended, one row per alert, route and period. The whole dataset is a few hundred rows.
 * @returns {Promise<import('../utils/serviceAlerts').ServiceAlertRow[]>}
 */
export const getServiceAlerts = async () => {
  // times are Edmonton local time without a zone
  const since = `${addDays(edmontonNow().dateString, -7)}T00:00:00`;
  const params = new URLSearchParams({
    $select: "alert_id,start_dttm,end_dttm,route_id,stop_id,cause,effect,header_text,description_text",
    $where: `is_deleted = false AND end_dttm >= '${since}'`,
    $limit: "5000",
  });
  const result = await fetch(`https://data.edmonton.ca/resource/5yvt-mcye.json?${params}`, {
    headers: {
      Accept: "application/json",
      "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN,
    },
  });
  if (!result.ok) {
    throw Error(result.status);
  }
  return result.json();
};
