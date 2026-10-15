// @ts-check
import { formatScheduledTime } from "./busStatus";
import { edmontonNow, secondsToTime } from "./serviceTime";
import { addDays, formatDayLabel } from "./weeks";

/**
 * A row of the City's service disruption alerts (`5yvt-mcye`). Times are Edmonton local
 * time without a zone, e.g. "2026-10-15T10:00:00.000"
 * @typedef {Object} ServiceAlertRow
 * @property {string} alert_id
 * @property {string} start_dttm
 * @property {string} end_dttm
 * @property {string} route_id
 * @property {string} [stop_id] comma-separated stop ids, missing when the whole route is affected
 * @property {string} [cause]
 * @property {string} [effect]
 * @property {string} [header_text]
 * @property {string} [description_text]
 */

/**
 * Local times as YYYY-MM-DDTHH:MM:SS, which compare correctly as strings. A null end is
 * open-ended
 * @typedef {{start: string, end: string | null}} AlertPeriod
 */

/**
 * @typedef {Object} ServiceAlert
 * @property {string} id
 * @property {Set<string>} routeIds
 * @property {Set<string>} stopIds empty when the whole route is affected
 * @property {AlertPeriod[]} periods earliest first
 * @property {string} effect e.g. DETOUR, STOP_MOVED, MODIFIED_SERVICE
 * @property {string} cause
 * @property {string} header
 * @property {string} description
 */

/**
 * @typedef {Object} AlertTiming
 * @property {ServiceAlert} alert
 * @property {AlertPeriod} period the one in effect, or the next one
 * @property {number} more periods after this one, for alerts that recur
 */

/** @type {Record<string, string>} */
export const EFFECT_LABELS = {
  DETOUR: "Detour",
  STOP_MOVED: "Stop moved",
  MODIFIED_SERVICE: "Modified service",
  NO_SERVICE: "No service",
  REDUCED_SERVICE: "Reduced service",
  ADDITIONAL_SERVICE: "Additional service",
};

// amber, like the alert cards. A ring rather than a fill, so it sits around the trip page's lateness colours
export const DISRUPTION_RING_STYLE = {
  color: "#fb8c00",
  weight: 3,
  fill: false,
  interactive: false,
};

/** @param {string} effect */
export const effectLabel = (effect) => EFFECT_LABELS[effect] ?? "Service change";

/**
 * Drops the milliseconds. Alerts with no end are given one in the year 3000
 * @param {string | undefined} value
 * @returns {string | null}
 */
const localTime = (value) => {
  if (!value || Number(value.slice(0, 4)) >= 2900) return null;
  return value.slice(0, 19);
};

/**
 * Merges the dataset's rows, one per alert, route and period, into one alert each
 * @param {ServiceAlertRow[]} rows
 * @returns {ServiceAlert[]}
 */
export const groupAlerts = (rows) => {
  /** @type {Map<string, ServiceAlert>} */
  const alerts = new Map();
  for (const row of rows) {
    const start = localTime(row.start_dttm);
    if (!start) continue;
    let alert = alerts.get(row.alert_id);
    if (!alert) {
      alert = {
        id: row.alert_id,
        routeIds: new Set(),
        stopIds: new Set(),
        periods: [],
        effect: row.effect ?? "",
        cause: row.cause ?? "",
        header: row.header_text?.trim() ?? "",
        description: row.description_text?.trim() ?? "",
      };
      alerts.set(row.alert_id, alert);
    }
    if (row.route_id) alert.routeIds.add(row.route_id);
    for (const stopId of (row.stop_id ?? "").split(",")) {
      if (stopId.trim()) alert.stopIds.add(stopId.trim());
    }
    const end = localTime(row.end_dttm);
    if (!alert.periods.some((period) => period.start === start && period.end === end)) {
      alert.periods.push({ start, end });
    }
  }
  for (const alert of alerts.values()) {
    alert.periods.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }
  return [...alerts.values()];
};

/**
 * A local time from a day and the seconds since its midnight, which can pass 24 hours
 * @param {string} dateString YYYY-MM-DD
 * @param {number} seconds
 * @returns {string} YYYY-MM-DDTHH:MM:SS
 */
export const edmontonLocal = (dateString, seconds) => {
  const days = Math.floor(seconds / 86400);
  return `${addDays(dateString, days)}T${secondsToTime(seconds - days * 86400)}`;
};

/**
 * Now in Edmonton, as a local time
 * @param {Date} [date]
 * @returns {string}
 */
export const nowLocal = (date = new Date()) => {
  const { dateString, secondsSinceMidnight } = edmontonNow(date);
  return edmontonLocal(dateString, secondsSinceMidnight);
};

/**
 * Whether an alert is in effect at a time, or still to come
 * @param {ServiceAlert} alert
 * @param {string} now local time
 * @returns {{state: 'active' | 'upcoming' | 'ended', timing: AlertTiming | null}}
 */
export const alertStatus = (alert, now) => {
  const { periods } = alert;
  const timing = (/** @type {number} */ index) => ({ alert, period: periods[index], more: periods.length - index - 1 });
  const active = periods.findIndex((period) => period.start <= now && (period.end === null || period.end > now));
  if (active >= 0) return { state: "active", timing: timing(active) };
  const next = periods.findIndex((period) => period.start > now);
  if (next >= 0) return { state: "upcoming", timing: timing(next) };
  return { state: "ended", timing: null };
};

/**
 * @param {ServiceAlert} alert
 * @param {Set<string> | null | undefined} stopIds
 */
const touchesStops = (alert, stopIds) =>
  !stopIds?.size || !alert.stopIds.size || [...alert.stopIds].some((id) => stopIds.has(id));

/** @param {AlertTiming} a @param {AlertTiming} b */
const byStart = (a, b) => (a.period.start < b.period.start ? -1 : a.period.start > b.period.start ? 1 : 0);

/**
 * Sorts alerts into those in effect and those still to come
 * @param {ServiceAlert[]} alerts
 * @param {string} now local time
 */
const splitByStatus = (alerts, now) => {
  /** @type {AlertTiming[]} */
  const active = [];
  /** @type {AlertTiming[]} */
  const upcoming = [];
  for (const alert of alerts) {
    const { state, timing } = alertStatus(alert, now);
    if (state === "active" && timing) active.push(timing);
    if (state === "upcoming" && timing) upcoming.push(timing);
  }
  return { active: active.sort(byStart), upcoming: upcoming.sort(byStart) };
};

/**
 * A route's alerts in effect now and still to come. The dataset's direction is always 0,
 * so a direction is told apart by its stops: with `stopIds`, alerts naming only other
 * stops are left out
 * @param {ServiceAlert[]} alerts
 * @param {string} routeId
 * @param {string} now local time
 * @param {Set<string> | null} [stopIds]
 */
export const alertsForRoute = (alerts, routeId, now, stopIds) =>
  splitByStatus(alerts.filter((alert) => alert.routeIds.has(routeId) && touchesStops(alert, stopIds)), now);

/**
 * The alerts in effect at some point during a trip, and the trip's stops they name
 * @param {ServiceAlert[]} alerts
 * @param {string} routeId
 * @param {Set<string>} stopIds the trip's stops
 * @param {string} windowStart local time the trip starts
 * @param {string} windowEnd local time the trip ends
 */
export const alertsForTrip = (alerts, routeId, stopIds, windowStart, windowEnd) => {
  /** @type {AlertTiming[]} */
  const matches = [];
  /** @type {Map<string, string>} stop id to the effect on it */
  const affectedStops = new Map();
  for (const alert of alerts) {
    if (!alert.routeIds.has(routeId) || !touchesStops(alert, stopIds)) continue;
    const index = alert.periods.findIndex(
      (period) => period.start < windowEnd && (period.end === null || period.end > windowStart),
    );
    if (index < 0) continue;
    matches.push({ alert, period: alert.periods[index], more: alert.periods.length - index - 1 });
    for (const stopId of alert.stopIds) {
      if (stopIds.has(stopId) && !affectedStops.has(stopId)) affectedStops.set(stopId, alert.effect);
    }
  }
  return { alerts: matches.sort(byStart), affectedStops };
};

/**
 * The alerts naming a stop, in effect now and still to come
 * @param {ServiceAlert[]} alerts
 * @param {string} stopId
 * @param {string} now local time
 */
export const alertsForStop = (alerts, stopId, now) =>
  splitByStatus(alerts.filter((alert) => alert.stopIds.has(String(stopId))), now);

/**
 * The routes with an alert in effect now
 * @param {ServiceAlert[]} alerts
 * @param {string} now local time
 * @returns {Set<string>}
 */
export const routesWithActiveAlerts = (alerts, now) => {
  const routes = new Set();
  for (const alert of alerts) {
    if (alertStatus(alert, now).state !== "active") continue;
    for (const routeId of alert.routeIds) routes.add(routeId);
  }
  return routes;
};

/**
 * "today at 6:00 PM", "tomorrow at 7:00 AM" or "Thu, Oct 29 at 6:00 PM"
 * @param {string} local
 * @param {string} today YYYY-MM-DD
 */
const formatWhen = (local, today) => {
  const date = local.slice(0, 10);
  const time = formatScheduledTime(local.slice(11));
  const day = formatDayLabel(date, today);
  return `${date === today || date === addDays(today, 1) || date === addDays(today, -1) ? day.toLowerCase() : day} at ${time}`;
};

/**
 * When an alert applies, e.g. "Until Thu, Oct 29 at 6:00 PM", "Starts Mon, Oct 19 at 6:20 AM"
 * or "Until further notice", with "+ 3 more days" for one that recurs
 * @param {AlertTiming} timing
 * @param {string} now local time
 * @returns {string}
 */
export const formatAlertPeriod = ({ alert, period, more }, now) => {
  const today = now.slice(0, 10);
  const until = period.end === null ? "until further notice" : `until ${formatWhen(period.end, today)}`;
  const text = period.start > now ? `Starts ${formatWhen(period.start, today)}, ${until}` : until[0].toUpperCase() + until.slice(1);
  if (!more) return text;
  // a detour that runs a few hours on each of several days reads as days
  const daily = alert.periods.every((p) => p.end !== null && p.start.slice(0, 10) === p.end.slice(0, 10));
  const unit = daily ? (more === 1 ? "day" : "days") : more === 1 ? "time" : "times";
  return `${text} + ${more} more ${unit}`;
};

/**
 * The stops named by alerts in effect now, and the effect on each, for marking them on maps
 * @param {ServiceAlert[]} alerts
 * @param {string} now local time
 * @param {string} [routeId] only this route's alerts
 * @returns {Map<string, string>} stop id to effect
 */
export const disruptedStops = (alerts, now, routeId) => {
  const stops = new Map();
  for (const alert of alerts) {
    if (routeId && !alert.routeIds.has(routeId)) continue;
    if (alertStatus(alert, now).state !== "active") continue;
    for (const stopId of alert.stopIds) {
      if (!stops.has(stopId)) stops.set(stopId, alert.effect);
    }
  }
  return stops;
};
