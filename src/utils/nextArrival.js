import { formatScheduledTime } from "./busStatus";
import { serviceRunsOnDay, timeToSeconds, weekdayOf } from "./serviceTime";

const DAY_SECONDS = 24 * 60 * 60;
// far enough to reach a route that runs one day a week, including today's weekday next week
const LOOKAHEAD_DAYS = 7;

/**
 * @typedef {Object} NextArrival
 * @property {string} time HH:MM:SS as scheduled, where HH may be 24 or more
 * @property {number} daysAhead 0 for today's service day, 1 for tomorrow, and so on
 * @property {number} seconds When it is, in seconds from today's midnight, for sorting
 */

/** @param {import("../api").StopNextArrival} row */
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
 */
export const describeNextArrival = (arrival, dateString) => {
  if (!arrival) return "No buses scheduled in the next week";
  const time = formatScheduledTime(arrival.time);
  if (arrival.daysAhead === 0) return `Next bus at ${time}`;
  if (arrival.daysAhead === 1) return `Next bus tomorrow at ${time}`;
  const day = weekdayOf(dateString, arrival.daysAhead);
  const dayName = day[0].toUpperCase() + day.slice(1);
  return `Next bus ${arrival.daysAhead === 7 ? "next " : ""}${dayName} at ${time}`;
};
