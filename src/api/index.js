import { edmontonNow } from "../utils/serviceTime";

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
 * @property {string} location_type
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

export const getRoute = getBusStopTimes;

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
 *
 * @returns {Promise<Trip[]>}
 */
export const getAllTrips = async () => {
  let url = `https://data.edmonton.ca/resource/ctwr-tvrd.json`;
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
 * Fetches trips for a specific route from the Edmonton open data API
 * @param {string} routeId
 * @returns {Promise<Trip[]>}
 */
export const getTripsByRouteId = async (routeId) => {
  const url = `https://data.edmonton.ca/resource/ctwr-tvrd.json?route_id=${encodeURIComponent(routeId)}&$limit=500`;
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
 * Fetches the ids of every stop a route serves in the currently-active GTFS feed,
 * across both directions and all service patterns.
 * @param {string} routeId
 * @returns {Promise<Array<{stop_id: string}>>}
 */
export const getRouteStops = async (routeId) => {
  const today = edmontonNow().dateString;
  // Escape single quotes to prevent SoQL injection
  const safeRouteId = String(routeId).replace(/'/g, "''");
  const where = `feed_start_date <= '${today}' AND feed_end_date >= '${today}' AND route_id = '${safeRouteId}'`;
  const url = `https://data.edmonton.ca/resource/4fvt-p2se.json?$where=${encodeURIComponent(where)}&$select=stop_id&$group=stop_id&$limit=5000`;
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
 * @typedef {Object} StopScheduleEntry
 * @property {string} trip_id
 * @property {string} route_id
 * @property {string} route_long_name
 * @property {string} agency_name The transit agency running the route, e.g. "St. Albert Transit"
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
  const select = "trip_id,route_id,route_long_name,agency_name,trip_headsign,service_id,arrival_time,stop_sequence";
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
 * @typedef {Object} StopRoute
 * @property {string} route_id
 * @property {string} route_long_name
 * @property {string} agency_name
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
  const fields = "route_id,route_long_name,agency_name";
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
