// @ts-check
// weeks run sunday to saturday, as plain YYYY-MM-DD strings so the viewer's zone can't shift them

const DAY_MS = 86_400_000;

/**
 * @param {string} dateString YYYY-MM-DD
 * @returns {Date} midnight UTC on that date
 */
const toUtc = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/** @param {Date} date */
const toDateString = (date) => date.toISOString().slice(0, 10);

/**
 * Whether a string is a real YYYY-MM-DD date
 * @param {unknown} value
 * @returns {value is string}
 */
export const isDateString = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateString(toUtc(value)) === value;

/**
 * @param {string} dateString YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
export const addDays = (dateString, days) => toDateString(new Date(toUtc(dateString).getTime() + days * DAY_MS));

/**
 * The Sunday on or before a date
 * @param {string} dateString YYYY-MM-DD
 * @returns {string}
 */
export const weekStart = (dateString) => addDays(dateString, -toUtc(dateString).getUTCDay());

/**
 * The first and last days of the week starting on `start`, inclusive
 * @param {string} start YYYY-MM-DD, a Sunday
 * @returns {{from: string, to: string}}
 */
export const weekRange = (start) => ({ from: start, to: addDays(start, 6) });

/**
 * A date like "Oct 4"
 * @param {string} dateString YYYY-MM-DD
 * @returns {string}
 */
export const formatShortDate = (dateString) =>
  toUtc(dateString).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/**
 * Names a week: "This week", "Last week", or its days, e.g. "Oct 4 – 10" or "Sep 27 – Oct 3".
 * Weeks touching another year include the years.
 * @param {string} start YYYY-MM-DD, a Sunday
 * @param {string} today YYYY-MM-DD
 * @returns {string}
 */
export const formatWeekLabel = (start, today) => {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return "This week";
  if (start === addDays(thisWeek, -7)) return "Last week";
  const first = toUtc(start);
  const last = toUtc(addDays(start, 6));
  const thisYear = toUtc(today).getUTCFullYear();
  /** @param {Date} date @param {Intl.DateTimeFormatOptions} options */
  const format = (date, options) => date.toLocaleDateString("en-US", { timeZone: "UTC", ...options });
  if (first.getUTCFullYear() !== thisYear || last.getUTCFullYear() !== thisYear) {
    const withYear = { month: "short", day: "numeric", year: "numeric" };
    return `${format(first, /** @type {const} */ (withYear))} – ${format(last, /** @type {const} */ (withYear))}`;
  }
  const end = first.getUTCMonth() === last.getUTCMonth()
    ? format(last, { day: "numeric" })
    : format(last, { month: "short", day: "numeric" });
  return `${format(first, { month: "short", day: "numeric" })} – ${end}`;
};

/**
 * The Monday on or before a date, for the backend's Monday to Sunday weeks
 * @param {string} dateString YYYY-MM-DD
 * @returns {string}
 */
export const mondayWeekStart = (dateString) => addDays(dateString, -((toUtc(dateString).getUTCDay() + 6) % 7));

/**
 * Names a day: "Today", "Yesterday", "Tomorrow", or e.g. "Wed, Oct 14". Days in
 * another year include the year.
 * @param {string} dateString YYYY-MM-DD
 * @param {string} today YYYY-MM-DD
 * @returns {string}
 */
export const formatDayLabel = (dateString, today) => {
  if (dateString === today) return "Today";
  if (dateString === addDays(today, -1)) return "Yesterday";
  if (dateString === addDays(today, 1)) return "Tomorrow";
  const sameYear = dateString.slice(0, 4) === today.slice(0, 4);
  return toUtc(dateString).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};
