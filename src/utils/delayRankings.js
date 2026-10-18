// @ts-check
// the delays page's periods and labels, as plain YYYY-MM-DD strings like weeks.js
import { addDays, formatDayLabel, formatWeekLabel, isDateString, weekStart } from "./weeks";
import { formatDelay, typicalStatus } from "./delayStats";

/** @typedef {'day' | 'week' | 'month'} DelayPeriod */
/** @typedef {'trip' | 'route' | 'bus'} DelayRankingBy */
/** @typedef {'mean' | 'max' | 'late'} DelaySort */

/** @type {DelayPeriod[]} */
export const DELAY_PERIODS = ["day", "week", "month"];
/** @type {DelayRankingBy[]} */
export const DELAY_RANKINGS = ["trip", "route", "bus"];
/** @type {DelaySort[]} */
export const DELAY_SORTS = ["mean", "max", "late"];

/**
 * @template {string} T
 * @param {readonly T[]} options
 * @param {unknown} value
 * @param {T} fallback
 * @returns {T}
 */
export const pickOption = (options, value, fallback) => options.find((option) => option === value) ?? fallback;

/**
 * The first day of a date's month
 * @param {string} dateString YYYY-MM-DD
 * @returns {string}
 */
export const monthStart = (dateString) => `${dateString.slice(0, 8)}01`;

/**
 * The first day of the month `months` after a date's
 * @param {string} dateString YYYY-MM-DD
 * @param {number} months
 * @returns {string}
 */
export const addMonths = (dateString, months) => {
  const index = Number(dateString.slice(0, 4)) * 12 + Number(dateString.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
};

/**
 * Where a period containing a date starts: the day itself, its Sunday–Saturday week's
 * Sunday, or the first of its month.
 * @param {DelayPeriod} period
 * @param {string} dateString YYYY-MM-DD
 * @returns {string}
 */
export const periodStart = (period, dateString) => {
  if (period === "week") return weekStart(dateString);
  if (period === "month") return monthStart(dateString);
  return dateString;
};

// a week or month with no start is the days up to yesterday, rather than a calendar one
export const ROLLING_DAYS = { week: 7, month: 30 };

/**
 * The service days a period covers, inclusive. A month is at most 31, the backend's limit.
 * @param {DelayPeriod} period
 * @param {string} start YYYY-MM-DD, from periodStart, or "" for the last 7 or 30 days
 * @param {string} today YYYY-MM-DD in Edmonton
 * @returns {{from: string, to: string}}
 */
export const periodRange = (period, start, today) => {
  if (!start && period !== "day") {
    const to = addDays(today, -1);
    return { from: addDays(to, 1 - ROLLING_DAYS[period]), to };
  }
  if (period === "week") return { from: start, to: addDays(start, 6) };
  if (period === "month") return { from: start, to: addDays(addMonths(start, 1), -1) };
  return { from: start, to: start };
};

/**
 * How many days a period has, to say how many have been worked out
 * @param {{from: string, to: string}} range
 * @returns {number}
 */
export const rangeDays = ({ from, to }) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/**
 * The period to show from the URL: a valid date no later than yesterday (today has
 * no times until overnight), moved to its period's start. Without one a day is
 * yesterday, and a week or month the last 7 or 30 days ("").
 * @param {DelayPeriod} period
 * @param {unknown} date ?date=
 * @param {string} today YYYY-MM-DD in Edmonton
 * @returns {string}
 */
export const initialPeriodStart = (period, date, today) => {
  const yesterday = addDays(today, -1);
  if (isDateString(date) && date <= yesterday) return periodStart(period, date);
  return period === "day" ? yesterday : "";
};

/**
 * Where a switch to another period starts: a week or month is the last 7 or 30 days,
 * and a day is the last day shown, no later than yesterday
 * @param {DelayPeriod} next
 * @param {{from: string, to: string}} shown The range shown before
 * @param {string} today
 * @returns {string}
 */
export const switchedPeriodStart = (next, shown, today) => {
  if (next !== "day") return "";
  const yesterday = addDays(today, -1);
  return shown.to > yesterday ? yesterday : shown.to;
};

/**
 * Names a month, e.g. "October 2026", "This month" or "Last month"
 * @param {string} start YYYY-MM-DD, the first of the month
 * @param {string} today YYYY-MM-DD
 * @returns {string}
 */
export const formatMonthLabel = (start, today) => {
  if (start === monthStart(today)) return "This month";
  if (start === addMonths(today, -1)) return "Last month";
  const [year, month] = start.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
};

/**
 * Names a period: "Yesterday", "Last 7 days", "This week", "Oct 4 – 10"
 * @param {DelayPeriod} period
 * @param {string} start
 * @param {string} today
 * @returns {string}
 */
export const formatPeriodLabel = (period, start, today) => {
  if (!start && period !== "day") return `Last ${ROLLING_DAYS[period]} days`;
  if (period === "week") return formatWeekLabel(start, today);
  if (period === "month") return formatMonthLabel(start, today);
  return formatDayLabel(start, today);
};

/**
 * A period's label inside a sentence: "this week" and "yesterday" lowercase, dates as they are
 * @param {string} label From formatPeriodLabel
 * @returns {string}
 */
export const periodPhrase = (label) => (/^(This|Last|Today|Yesterday)\b/.test(label) ? label.toLowerCase() : label);

/**
 * @typedef {Object} DelayCounts
 * @property {number} stops Stop times counted
 * @property {number|null} mean Average delay in seconds
 * @property {number} max Worst delay in seconds
 * @property {number} onTime Stop times from a minute early to under 2 late
 * @property {number} late Stop times 5 or more minutes late
 */

/**
 * A share of stops as a whole percentage, "31%"
 * @param {number} count
 * @param {number} total
 * @returns {string}
 */
export const percent = (count, total) => `${total ? Math.round((count / total) * 100) : 0}%`;

/**
 * What a row is ranked by, for the chip on its right: the average, the worst delay or
 * how often it was 5+ minutes late, coloured like the other delay chips.
 * @param {DelaySort} sort
 * @param {DelayCounts} counts
 * @returns {{label: string, color: string}}
 */
export const rankingChip = (sort, counts) => {
  if (sort === "max") {
    const status = typicalStatus(counts.max);
    return { label: status.label === "On time" ? "On time" : `Worst ${status.label}`, color: status.color };
  }
  if (sort === "late") {
    return { label: `${percent(counts.late, counts.stops)} 5+ min late`, color: counts.late ? "warning" : "success" };
  }
  const status = typicalStatus(counts.mean ?? 0);
  return { label: status.label === "On time" ? "On time on average" : `${status.label} on average`, color: status.color };
};

/**
 * The details line under a row's chip, saying the other two measures
 * @param {DelaySort} sort
 * @param {DelayCounts} counts
 * @returns {string}
 */
export const rankingDetails = (sort, counts) => {
  const parts = [];
  if (sort !== "mean" && counts.mean !== null) parts.push(`avg ${formatDelay(counts.mean)}`);
  if (sort !== "max") parts.push(`worst ${formatDelay(counts.max)}`);
  if (sort !== "late") parts.push(`${percent(counts.onTime, counts.stops)} on time`);
  return parts.join(" · ");
};
