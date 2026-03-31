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
  const tripIdParams = tripIds.map((tripId) => `'${tripId}'`).join(",");
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
  return [];
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
