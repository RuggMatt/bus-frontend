// A small fake feed for the browser tests: one route with three trips along four
// stops, and one bus out on the middle trip. Every request to the backend, the
// City's open data and the map tiles is answered here, so the tests never touch
// the network.

export const API_URL = "http://api.test";

export const ROUTE = {
  route_id: "008",
  route_short_name: "8",
  route_long_name: "Abbottsfield - Downtown - University",
  route_type: "3",
  route_type_descr: "Bus",
};

export const STOPS = [
  { stop_id: "1001", stop_name: "Jasper Ave & 109 St", stop_lat: "53.5410", stop_lon: "-113.5070" },
  { stop_id: "1002", stop_name: "Jasper Ave & 104 St", stop_lat: "53.5412", stop_lon: "-113.4990" },
  { stop_id: "1003", stop_name: "Jasper Ave & 100 St", stop_lat: "53.5415", stop_lon: "-113.4910" },
  { stop_id: "1004", stop_name: "Jasper Ave & 95 St", stop_lat: "53.5418", stop_lon: "-113.4830" },
].map((stop) => ({ ...stop, stop_code: stop.stop_id, location_type: "0", zone_id: "" }));

const SERVICE_ID = "e2e-daily";
const HEADSIGN = "8 University";
// start times of the three trips, Edmonton local time
export const TRIPS = [
  { trip_id: "5001", start: "08:00:00" },
  { trip_id: "5002", start: "09:00:00" },
  { trip_id: "5003", start: "10:00:00" },
];

const shape = {
  type: "MultiLineString",
  coordinates: [STOPS.map((stop) => [Number(stop.stop_lon), Number(stop.stop_lat)])],
};

const trips = TRIPS.map(({ trip_id }) => ({
  trip_id,
  route_id: ROUTE.route_id,
  service_id: SERVICE_ID,
  trip_headsign: HEADSIGN,
  direction_id: "0",
  block_id: "1",
  shape_id: "e2e-shape",
  wheelchair_accessible: true,
  bikes_allowed: true,
  geometry_line: shape,
}));

const addMinutes = (time, minutes) => {
  const [h, m, s] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:${pad(s)}`;
};

const stopTimes = TRIPS.flatMap(({ trip_id, start }) =>
  STOPS.map((stop, index) => {
    const time = addMinutes(start, index * 5);
    return {
      trip_id,
      stop_id: stop.stop_id,
      stop_sequence: String(index + 1),
      arrival_time: time,
      departure_time: time,
      arrival_time_fixed: time,
      departure_time_fixed: time,
      drop_off_type: "0",
    };
  }),
);

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

// the service runs every day for two months either side of today
const calendarDates = Array.from({ length: 121 }, (_, i) => ({
  service_id: SERVICE_ID,
  date: `${edmontonDate(i - 60)}T00:00:00.000`,
  exception_type: "1",
}));

/** The bus out on trip 5002, between its second and third stops. */
export const BUS = {
  bus: 4699,
  trip: 5002,
  lat: 53.5413,
  long: -113.495,
  bearing: 90,
  speed: 8,
};

const liveBus = () => ({ ...BUS, timestamp: Math.floor(Date.now() / 1000) - 5 });

/** Trip ids named in a SODA `trip_id IN ('a','b')` filter, or its `trip_id=` param. */
const tripIdsIn = (url) => {
  const param = url.searchParams.get("trip_id");
  if (param) return [param];
  const where = url.searchParams.get("$where") ?? "";
  const list = where.match(/trip_id IN \(([^)]*)\)/);
  return list ? [...list[1].matchAll(/'([^']*)'/g)].map((match) => match[1]) : null;
};

const filterTrips = (rows, url) => {
  const ids = tripIdsIn(url);
  return ids ? rows.filter((row) => ids.includes(row.trip_id)) : rows;
};

/** Answers one data.edmonton.ca request by its dataset. */
const openData = (url) => {
  const dataset = url.pathname.match(/resource\/([^.]+)\.json/)?.[1];
  switch (dataset) {
    case "d577-xky7": // routes
      return [ROUTE];
    case "4vt2-8zrq": // stops
      return url.searchParams.get("$offset") ? [] : STOPS;
    case "ctwr-tvrd": {
      // trips
      const route = url.searchParams.get("route_id");
      return filterTrips(route ? trips.filter((trip) => trip.route_id === route) : trips, url);
    }
    case "greh-g7ac": {
      // stop times, or each trip's first departure
      const rows = filterTrips(stopTimes, url);
      if ((url.searchParams.get("$select") ?? "").includes("min(departure_time)")) {
        return TRIPS.filter(({ trip_id }) => rows.some((row) => row.trip_id === trip_id)).map(
          ({ trip_id, start }) => ({ trip_id, start }),
        );
      }
      return rows;
    }
    case "f2sy-bth7": // calendar dates
      return calendarDates;
    default:
      // the stop schedule view, service alerts and agencies: nothing to show
      return [];
  }
};

const weekStats = (count, mean, histogram) => ({
  from: "2026-10-10",
  to: "2026-10-16",
  count,
  mean,
  min: histogram[0].minutes * 60,
  max: histogram.at(-1).minutes * 60 + 59,
  histogram,
});

/** Answers one backend request, or null for a 404. */
const backend = (url) => {
  const path = url.pathname;
  if (path === "/bus/now") return [liveBus()];
  if (path === `/bus/trips/${BUS.trip}`) return [liveBus()];
  if (/^\/bus\/trips\/[^/]+$/.test(path)) return [];
  const routeTrips = path.match(/^\/routes\/([^/]+)\/trips\/([^/]+)$/);
  if (routeTrips) return { route: routeTrips[1], date: routeTrips[2], count: 0, trips: [] };
  // a week of stop times: this trip runs about 2 min late, the whole route on time
  const tripStats = path.match(/^\/stop-times\/stats\/trips\/([^/]+)\/(\d+)$/);
  if (tripStats) {
    return {
      trip: Number(tripStats[1]), seq: Number(tripStats[2]), stop: null, route: ROUTE.route_id,
      ...weekStats(6, 130, [{ minutes: 1, count: 2 }, { minutes: 2, count: 3 }, { minutes: 4, count: 1 }]),
    };
  }
  const routeStats = path.match(/^\/stop-times\/stats\/routes\/([^/]+)\/stops\/([^/]+)$/);
  if (routeStats) {
    return {
      route: routeStats[1], stop: routeStats[2], seq: null, trips: TRIPS.length,
      ...weekStats(21, 20, [{ minutes: -2, count: 2 }, { minutes: 0, count: 15 }, { minutes: 2, count: 4 }]),
    };
  }
  // a day's actual stop times: 5001 ran late, 5002 on time, and 5003 early and wasn't seen at its last stop
  const routeStopTimes = path.match(/^\/stop-times\/routes\/([^/]+)\/([^/]+)$/);
  if (routeStopTimes) {
    const delays = { 5001: [60, 130, 150, 200], 5002: [0, 20, -30, 45], 5003: [-60, -150, -200] };
    return {
      route: routeStopTimes[1], date: routeStopTimes[2], count: TRIPS.length,
      trips: Object.entries(delays).map(([trip, stops]) => ({
        trip: Number(trip), stops: stops.map((delay, index) => [index + 1, delay]),
      })),
    };
  }
  if (path === `/bus/${BUS.bus}`) {
    const now = Math.floor(Date.now() / 1000);
    return { bus: BUS.bus, latest: liveBus(), firstSeen: now - 86400 * 30, lastSeen: now, active: true };
  }
  return null;
};

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(body),
});

/**
 * Routes every request the app makes off its own origin to the fake feed.
 * @param {import('@playwright/test').Page} page
 */
export async function mockApi(page) {
  await page.route("https://data.edmonton.ca/**", (route) =>
    route.fulfill(json(openData(new URL(route.request().url())))),
  );
  await page.route(`${API_URL}/**`, (route) => {
    const body = backend(new URL(route.request().url()));
    return body === null
      ? route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: "Not found" })
      : route.fulfill(json(body));
  });
  // map tiles aren't needed to find buses and stops
  await page.route("https://api.mapbox.com/**", (route) => route.abort());
}
