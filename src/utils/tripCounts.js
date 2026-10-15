// @ts-check
// trip counts per day, week (monday to sunday, as the backend groups them) or month
import { addDays, formatShortDate, mondayWeekStart } from "./weeks";

/** @typedef {'day' | 'week' | 'month'} CountPeriod */

/**
 * The days to ask for: the last 30 days, 12 weeks or 12 months up to today, but no
 * earlier than the bus was first seen, so a new bus isn't mostly empty periods.
 * @param {CountPeriod} by
 * @param {string} today YYYY-MM-DD
 * @param {string} [firstSeen] YYYY-MM-DD
 * @returns {{from: string, to: string}}
 */
export const tripCountsRange = (by, today, firstSeen) => {
  let from;
  if (by === "week") {
    from = addDays(mondayWeekStart(today), -11 * 7);
  } else if (by === "month") {
    const [year, month] = today.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1 - 11, 1));
    from = first.toISOString().slice(0, 10);
  } else {
    from = addDays(today, -29);
  }
  if (firstSeen && firstSeen > from) from = firstSeen < today ? firstSeen : today;
  return { from, to: today };
};

/**
 * @param {string} period YYYY-MM-DD
 * @param {Intl.DateTimeFormatOptions} options
 */
const formatDate = (period, options) => {
  const [year, month, day] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
};

/**
 * A short label for a chart axis: "Oct 14" for a day or the week starting then,
 * "Oct 2026" for a month
 * @param {string} period YYYY-MM-DD, the first day of the period
 * @param {CountPeriod} by
 * @returns {string}
 */
export const formatPeriodLabel = (period, by) =>
  by === "month" ? formatDate(period, { month: "short", year: "numeric" }) : formatShortDate(period);

/**
 * A full name for a period: "Wed, Oct 14", "Week of Oct 12" or "October 2026"
 * @param {string} period YYYY-MM-DD, the first day of the period
 * @param {CountPeriod} by
 * @returns {string}
 */
export const formatPeriodTitle = (period, by) => {
  if (by === "month") return formatDate(period, { month: "long", year: "numeric" });
  if (by === "week") return `Week of ${formatShortDate(period)}`;
  return formatDate(period, { weekday: "short", month: "short", day: "numeric" });
};

/**
 * The total trips, and the average per period. The last period is still under way,
 * and the bus was first seen partway through any period starting before firstSeen,
 * so those are left out of the average unless nothing else is left.
 * @param {{period: string, trips: number}[]} counts oldest first
 * @param {string} [firstSeen] YYYY-MM-DD
 * @returns {{total: number, average: number}}
 */
export const summarizeCounts = (counts, firstSeen) => {
  const total = counts.reduce((sum, count) => sum + count.trips, 0);
  const complete = counts.slice(0, -1).filter((count) => !firstSeen || count.period >= firstSeen);
  const averaged = complete.length ? complete : counts;
  const average = averaged.length
    ? averaged.reduce((sum, count) => sum + count.trips, 0) / averaged.length
    : 0;
  return { total, average: Math.round(average * 10) / 10 };
};
