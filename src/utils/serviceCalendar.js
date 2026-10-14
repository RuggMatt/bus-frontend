// @ts-check
import { weekdayOf } from "./serviceTime";

/** @typedef {import("./serviceTime").Weekday} Weekday */

/**
 * Every date each service runs, from GTFS calendar dates.
 * @typedef {Map<string, Set<string>>} ServiceDates service_id → YYYY-MM-DD dates
 */

/**
 * @typedef {Object} SchedulePeriod
 * @property {string} key
 * @property {string} start YYYY-MM-DD, the first date any of its services runs
 * @property {string} end YYYY-MM-DD, the last
 * @property {string[]} serviceIds
 */

/**
 * Which schedule a service belongs to, from its service_id. ETS uses the year and
 * month the schedule starts (DX-008-Weekday-1-26-09-1111100 → "26-09"), regional
 * agencies a season (540-Weekday-1-BT-FAL26-1111100 → "FAL26"), and a few services
 * only a start date prefix (20260914-Weekday-1-…). A six digit year, month and day
 * (…-260406-1111100) is read too, in case the feed switches to it.
 * @param {string} serviceId
 * @returns {string | null}
 */
export const schedulePeriod = (serviceId) => {
  const yearMonth = serviceId.match(/-(\d{2}-\d{2})-\d{7}$/);
  if (yearMonth) return yearMonth[1] ?? null;
  const yearMonthDay = serviceId.match(/-(\d{6})-\d{7}$/);
  if (yearMonthDay) return yearMonthDay[1] ?? null;
  const season = serviceId.match(/-([A-Z]{2,4}\d{2})-\d{7}$/);
  if (season) return season[1] ?? null;
  const datePrefix = serviceId.match(/^(\d{8})-/);
  if (datePrefix) return datePrefix[1] ?? null;
  return null;
};

/**
 * Builds each service's dates from calendar date rows. Type 1 adds a date and type
 * 2 removes one.
 * @param {{service_id: string, date: string, exception_type?: string}[]} rows date may be a full timestamp
 * @returns {ServiceDates}
 */
export const serviceDatesFrom = (rows) => {
  /** @type {ServiceDates} */
  const dates = new Map();
  const removed = [];
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    if (row.exception_type === "2") {
      removed.push([row.service_id, date]);
      continue;
    }
    const set = dates.get(row.service_id) ?? new Set();
    set.add(date);
    dates.set(row.service_id, set);
  }
  for (const [serviceId, date] of removed) {
    dates.get(serviceId)?.delete(date);
  }
  return dates;
};

/**
 * The schedule periods among some services, earliest first, with the dates they cover.
 * Services with no dates are left out.
 * @param {string[]} serviceIds
 * @param {ServiceDates} dates
 * @returns {SchedulePeriod[]}
 */
export const schedulePeriods = (serviceIds, dates) => {
  /** @type {Map<string, SchedulePeriod>} */
  const periods = new Map();
  for (const serviceId of new Set(serviceIds)) {
    const serviceDates = [...(dates.get(serviceId) ?? [])].sort();
    const first = serviceDates[0];
    const last = serviceDates[serviceDates.length - 1];
    if (!first || !last) continue;
    const key = schedulePeriod(serviceId) ?? "";
    const period = periods.get(key) ?? { key, start: first, end: last, serviceIds: [] };
    if (first < period.start) period.start = first;
    if (last > period.end) period.end = last;
    period.serviceIds.push(serviceId);
    periods.set(key, period);
  }
  return [...periods.values()].sort((a, b) => a.start.localeCompare(b.start));
};

/**
 * The services running on a date.
 * @param {ServiceDates} dates
 * @param {string} date YYYY-MM-DD
 * @returns {Set<string>}
 */
export const servicesOnDate = (dates, date) => {
  const services = new Set();
  dates.forEach((serviceDates, serviceId) => {
    if (serviceDates.has(date)) services.add(serviceId);
  });
  return services;
};

/**
 * The services that make up a typical week's day, leaving out one-off schedules.
 * ETS gives holidays and other special days their own services (route 8's
 * Weekday-5 only runs on Truth and Reconciliation Day) and runs Sunday service on
 * Thanksgiving Monday. So a service counts as regular when it runs on at least half
 * as many of the period's days of that weekday as the most frequent one does.
 * @param {ServiceDates} dates
 * @param {string[]} serviceIds The period's services
 * @param {Weekday} weekday
 * @returns {Set<string>}
 */
export const regularServices = (dates, serviceIds, weekday) => {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const serviceId of serviceIds) {
    let count = 0;
    for (const date of dates.get(serviceId) ?? []) {
      if (weekdayOf(date) === weekday) count += 1;
    }
    if (count) counts.set(serviceId, count);
  }
  const most = Math.max(0, ...counts.values());
  return new Set([...counts].filter(([, count]) => count * 2 >= most).map(([serviceId]) => serviceId));
};

/**
 * Whether two sets hold the same services.
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
export const sameServices = (a, b) => a.size === b.size && [...a].every((serviceId) => b.has(serviceId));
