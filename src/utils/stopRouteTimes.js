// @ts-check
import { edmontonNow, serviceRunsOnDay, timeToSeconds, weekdayOf } from "./serviceTime";
import { addDays } from "./weeks";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * @typedef {Object} StopRouteEntry One scheduled visit of a route's trip to a stop
 * @property {string} trip_id
 * @property {string} trip_headsign
 * @property {string} service_id
 * @property {string} arrival_time HH:MM:SS, where HH may be 24 or more
 * @property {string} stop_sequence
 */

/**
 * A route's visits to a stop on a service day, earliest first. `services` are the ones
 * the calendar says run that day. Without them (null, or none listed for the day) the
 * days in each service_id are used, and as several variants claim the same days, a
 * visit at the same time to the same place is only kept once.
 * @template {StopRouteEntry} T
 * @param {T[]} entries
 * @param {Set<string> | null} services
 * @param {string} date YYYY-MM-DD
 * @returns {T[]}
 */
export const arrivalsOnDate = (entries, services, date) => {
  const byCalendar = !!services?.size;
  const weekday = weekdayOf(date);
  const seen = new Set();
  return entries
    .filter((entry) => (byCalendar
      ? /** @type {Set<string>} */ (services).has(entry.service_id)
      : serviceRunsOnDay(entry.service_id, weekday)))
    .filter((entry) => {
      const key = byCalendar
        ? `${entry.trip_id}|${entry.stop_sequence}`
        : `${entry.arrival_time}|${entry.trip_headsign}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => timeToSeconds(a.arrival_time) - timeToSeconds(b.arrival_time)
      || Number(a.stop_sequence) - Number(b.stop_sequence));
};

/**
 * When a moment falls on a service day, as seconds after its midnight, so it can be
 * compared with GTFS times past 24:00:00.
 * @param {number} epochSeconds
 * @param {string} serviceDate YYYY-MM-DD
 * @returns {number}
 */
export const serviceDaySeconds = (epochSeconds, serviceDate) => {
  const { dateString, secondsSinceMidnight } = edmontonNow(new Date(epochSeconds * 1000));
  const days = Math.round((Date.parse(dateString) - Date.parse(serviceDate)) / (DAY_SECONDS * 1000));
  return secondsSinceMidnight + days * DAY_SECONDS;
};

/**
 * The Edmonton day a trip's run starts on, which the backend files its positions under.
 * A trip starting past 24:00:00 starts the day after its service day.
 * @param {string} serviceDate YYYY-MM-DD
 * @param {number} startSeconds The trip's first scheduled time, seconds after midnight
 * @returns {string}
 */
export const runDate = (serviceDate, startSeconds) =>
  (startSeconds >= DAY_SECONDS ? addDays(serviceDate, 1) : serviceDate);

/**
 * How many of a day's visits come before the ones shown at first: those over `before`
 * seconds before now.
 * @param {StopRouteEntry[]} arrivals Earliest first
 * @param {number} nowSeconds Seconds after the service day's midnight
 * @param {number} before
 * @returns {number}
 */
export const earlierCount = (arrivals, nowSeconds, before) => {
  const index = arrivals.findIndex((entry) => timeToSeconds(entry.arrival_time) >= nowSeconds - before);
  return index === -1 ? arrivals.length : index;
};

/**
 * A trip on the route shape most of a stop's visits use, to list the stops along it.
 * Short turns and other variants are less common, so they don't cut the list short.
 * @param {StopRouteEntry[]} entries
 * @param {Map<string, string>} shapeByTrip trip id → shape id
 * @returns {string | null}
 */
export const commonShapeTrip = (entries, shapeByTrip) => {
  /** @type {Map<string, {count: number, trip: string}>} */
  const shapes = new Map();
  for (const entry of entries) {
    const shape = shapeByTrip.get(entry.trip_id);
    if (shape === undefined) continue;
    const seen = shapes.get(shape);
    shapes.set(shape, { count: (seen?.count ?? 0) + 1, trip: seen?.trip ?? entry.trip_id });
  }
  const [best] = [...shapes.values()].sort((a, b) => b.count - a.count);
  return best?.trip ?? null;
};

/**
 * Where a stop is along a trip's stops. A loop can pass it twice, so the visit at
 * the stop_sequence most of its buses use is taken when there's one.
 * @param {Array<{stop_id: string, stop_sequence: string}>} stopTimes In trip order
 * @param {string} stopId
 * @param {string | null} seq
 * @returns {number} -1 when the trip doesn't stop there
 */
export const stopIndexOnTrip = (stopTimes, stopId, seq) => {
  const exact = stopTimes.findIndex((stopTime) => stopTime.stop_id === stopId && stopTime.stop_sequence === seq);
  return exact === -1 ? stopTimes.findIndex((stopTime) => stopTime.stop_id === stopId) : exact;
};

/**
 * Where a bus is among the stops before the one it's heading for, for a strip of
 * dots: the stops in order, and the bus as a position between two of them.
 * @param {Array<{name: string, along: number}>} stops The trip's stops up to this one,
 *   with how far along its route line each is, in metres
 * @param {number} busAlong How far along the line the bus is
 * @returns {{stopsAway: number, names: string[], bus: number} | null} null once the
 *   bus is past this stop. `bus` counts in stops: 2.5 is halfway between the third and
 *   fourth. Before the first stop it's 0
 */
export const approachTrack = (stops, busAlong) => {
  const ahead = stops.findIndex((stop) => stop.along > busAlong);
  if (ahead === -1) return null;
  let bus = 0;
  if (ahead > 0) {
    const passed = stops[ahead - 1];
    const next = stops[ahead];
    bus = ahead - 1 + Math.min(1, Math.max(0, (busAlong - passed.along) / (next.along - passed.along || 1)));
  }
  return { stopsAway: stops.length - ahead, names: stops.map((stop) => stop.name), bus };
};

/**
 * Which stops of an approach strip are in view, in stops from the first: the stop the
 * bus last passed is at the left edge, until this stop reaches the right edge and
 * stays there. So the strip only ever slides forward as the bus goes.
 * @param {number} lastIndex This stop's index
 * @param {number} bus The bus's position, in stops
 * @param {number} width How many stops apart the edges are
 * @returns {{offset: number, far: boolean}} `offset` is the stop at the left edge (below
 *   0 when there are fewer stops than fit). `far` when this stop is past the right edge
 */
export const approachWindow = (lastIndex, bus, width) => {
  const left = Math.max(0, Math.floor(bus));
  return { offset: Math.min(left, lastIndex - width), far: lastIndex - left > width };
};
