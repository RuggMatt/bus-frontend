import { formatScheduledTime } from "./busStatus";
import { serviceRunsOnDay, timeToSeconds, weekdayOf } from "./serviceTime";
import { addDays } from "./weeks";

const DAY_SECONDS = 24 * 60 * 60;
// far enough to reach a route that runs one day a week, including today's weekday next week
const LOOKAHEAD_DAYS = 7;

/**
 * @typedef {Object} NextArrival
 * @property {string} time HH:MM:SS as scheduled, where HH may be 24 or more
 * @property {number} daysAhead 0 for today's service day, 1 for tomorrow, and so on
 * @property {number} seconds When it is, in seconds from today's midnight, for sorting
 */

/** @param {{agency_name: string, route_id: string}} row */
export const routeKey = (row) => `${row.agency_name}|${row.route_id}`;

/**
 * Keeps the earliest arrival per route.
 * @param {Map<string, NextArrival>} best
 * @param {import("../api").StopNextArrival} row
 * @param {NextArrival} arrival
 */
const keepEarliest = (best, row, arrival) => {
  const key = routeKey(row);
  const current = best.get(key);
  if (!current || arrival.seconds < current.seconds) best.set(key, arrival);
};

/**
 * The next scheduled arrival for each route at a stop. Each set of rows holds the
 * earliest arrival per route and service pattern from a given time of day.
 *
 * @param {Object} rows
 * @param {import("../api").StopNextArrival[]} [rows.today] From now, on today's services
 * @param {import("../api").StopNextArrival[]} [rows.afterMidnight] From now + 24h, i.e. yesterday's services still running past midnight
 * @param {import("../api").StopNextArrival[]} [rows.firstOfDay] From 00:00:00, each service pattern's first arrival
 * @param {string} dateString Today in Edmonton, YYYY-MM-DD
 * @returns {Map<string, NextArrival>} Keyed by routeKey; routes with nothing in the coming week are missing
 */
export const nextArrivalByRoute = ({ today = [], afterMidnight = [], firstOfDay = [] }, dateString) => {
  /** @type {Map<string, NextArrival>} */
  const best = new Map();

  const todayName = weekdayOf(dateString);
  for (const row of today) {
    if (!serviceRunsOnDay(row.service_id, todayName)) continue;
    keepEarliest(best, row, { time: row.next_time, daysAhead: 0, seconds: timeToSeconds(row.next_time) });
  }

  const yesterdayName = weekdayOf(dateString, -1);
  for (const row of afterMidnight) {
    if (!serviceRunsOnDay(row.service_id, yesterdayName)) continue;
    keepEarliest(best, row, {
      time: row.next_time,
      daysAhead: 0,
      seconds: timeToSeconds(row.next_time) - DAY_SECONDS,
    });
  }

  // routes with nothing left today: the first day ahead that one of their services runs,
  // which wins as seconds count the days too
  /** @type {Map<string, NextArrival>} */
  const later = new Map();
  for (let daysAhead = 1; daysAhead <= LOOKAHEAD_DAYS; daysAhead++) {
    const dayName = weekdayOf(dateString, daysAhead);
    for (const row of firstOfDay) {
      if (best.has(routeKey(row)) || !serviceRunsOnDay(row.service_id, dayName)) continue;
      keepEarliest(later, row, {
        time: row.next_time,
        daysAhead,
        seconds: daysAhead * DAY_SECONDS + timeToSeconds(row.next_time),
      });
    }
  }

  for (const [key, arrival] of later) best.set(key, arrival);
  return best;
};

/**
 * @param {NextArrival | null} arrival
 * @param {string} dateString Today in Edmonton, YYYY-MM-DD
 * @param {string} [vehicle] what to call it, e.g. "train" for an LRT line
 */
export const describeNextArrival = (arrival, dateString, vehicle = "bus") => {
  const plural = vehicle === "bus" ? "buses" : `${vehicle}s`;
  if (!arrival) return `No ${plural} scheduled in the next week`;
  const time = formatScheduledTime(arrival.time);
  if (arrival.daysAhead === 0) return `Next ${vehicle} at ${time}`;
  if (arrival.daysAhead === 1) return `Next ${vehicle} tomorrow at ${time}`;
  const day = weekdayOf(dateString, arrival.daysAhead);
  const dayName = day[0].toUpperCase() + day.slice(1);
  return `Next ${vehicle} ${arrival.daysAhead === 7 ? "next " : ""}${dayName} at ${time}`;
};

/**
 * @typedef {Object} UpcomingArrival
 * @property {string} trip_id
 * @property {string} headsign
 * @property {string} time HH:MM:SS as scheduled, where HH may be 24 or more
 * @property {number} seconds When it is, in seconds from today's midnight
 * @property {number} minutes Whole minutes from now, 0 when due
 */

/**
 * The next few scheduled arrivals per route at a stop, for routes we can't follow live
 * (LRT). Today's services count from now, and yesterday's ones still running past
 * midnight count too. Something due this minute is kept, as "Due".
 *
 * Several service variants claim the same weekdays in their service_id (Weekday-1, -3,
 * -4 …) though only one runs on a given date, so the calendar dates decide when they're
 * known. Trips to the same place at the same time are kept once either way.
 *
 * @template {import("../api").StopScheduleEntry} E
 * @param {E[]} entries The schedule around now
 * @param {string} dateString Today in Edmonton, YYYY-MM-DD
 * @param {number} nowSeconds Seconds since today's midnight
 * @param {Object} [options]
 * @param {import("./serviceCalendar").ServiceDates | null} [options.serviceDates] The services' calendar dates
 * @param {number} [options.limit] Arrivals per group
 * @param {(entry: E) => string} [options.keyOf] What to group by, the route by default
 * @returns {Map<string, UpcomingArrival[]>} Soonest first in each group
 */
export const upcomingArrivals = (entries, dateString, nowSeconds, { serviceDates = null, limit = 4, keyOf = routeKey } = {}) => {
  const yesterday = addDays(dateString, -1);
  /**
   * @param {string} serviceId
   * @param {string} date
   */
  const runsOn = (serviceId, date) =>
    serviceDates ? !!serviceDates.get(serviceId)?.has(date) : serviceRunsOnDay(serviceId, weekdayOf(date));
  const fromSeconds = Math.floor(nowSeconds / 60) * 60;
  /** @type {Map<string, UpcomingArrival[]>} */
  const byRoute = new Map();
  const seen = new Set();
  for (const entry of entries) {
    const scheduled = timeToSeconds(entry.arrival_time);
    const candidates = [];
    if (runsOn(entry.service_id, dateString)) candidates.push(scheduled);
    if (scheduled >= DAY_SECONDS && runsOn(entry.service_id, yesterday)) {
      candidates.push(scheduled - DAY_SECONDS);
    }
    const seconds = candidates.find((candidate) => candidate >= fromSeconds);
    if (seconds === undefined) continue;
    const key = keyOf(entry);
    const tripKey = `${key}|${entry.trip_headsign}|${seconds}`;
    if (seen.has(tripKey)) continue;
    seen.add(tripKey);
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key)?.push({
      trip_id: entry.trip_id,
      headsign: entry.trip_headsign,
      time: entry.arrival_time,
      seconds,
      minutes: Math.max(0, Math.floor((seconds - nowSeconds) / 60)),
    });
  }
  for (const [key, arrivals] of byRoute) {
    byRoute.set(key, arrivals.sort((a, b) => a.seconds - b.seconds).slice(0, limit));
  }
  return byRoute;
};
