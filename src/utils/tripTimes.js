// @ts-check
import { edmontonNow } from "./serviceTime";

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Edmonton",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const TIME_WITH_SECONDS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Edmonton",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  weekday: "long",
  month: "short",
  day: "numeric",
});

/**
 * A time of day in Edmonton, e.g. "7:32 AM"
 * @param {number} epochSeconds
 * @returns {string}
 */
export const formatClockTime = (epochSeconds) =>
  // some engines put a narrow no-break space before AM/PM
  TIME_FORMAT.format(new Date(epochSeconds * 1000)).replace(/\s/g, " ");

/**
 * A time of day in Edmonton to the second, e.g. "7:32:05 AM", for positions reported
 * less than a minute apart
 * @param {number} epochSeconds
 * @returns {string}
 */
export const formatClockTimeWithSeconds = (epochSeconds) =>
  TIME_WITH_SECONDS_FORMAT.format(new Date(epochSeconds * 1000)).replace(/\s/g, " ");

/**
 * The Edmonton date a moment falls on, as YYYY-MM-DD
 * @param {number} epochSeconds
 * @returns {string}
 */
export const edmontonDate = (epochSeconds) => edmontonNow(new Date(epochSeconds * 1000)).dateString;

/**
 * @param {string} dateString YYYY-MM-DD
 * @returns {number} days since the epoch
 */
const dayNumber = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/**
 * Names the Edmonton day a moment falls on: "Today", "Yesterday" or e.g. "Monday, Oct 12"
 * @param {number} epochSeconds
 * @param {number} [now] Epoch milliseconds
 * @returns {string}
 */
export const tripDayLabel = (epochSeconds, now = Date.now()) => {
  const daysAgo = dayNumber(edmontonNow(new Date(now)).dateString) - dayNumber(edmontonDate(epochSeconds));
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return DAY_FORMAT.format(new Date(epochSeconds * 1000));
};

/**
 * When a bus ran a trip, e.g. "7:32 AM – 8:15 AM", or "7:32 AM – now" while it's
 * still running. A trip seen only once gives just its time.
 * @param {number} start Unix epoch seconds
 * @param {number} end Unix epoch seconds
 * @param {{ongoing?: boolean}} [options]
 * @returns {string}
 */
export const formatTripTimes = (start, end, { ongoing = false } = {}) => {
  const from = formatClockTime(start);
  if (ongoing) return `${from} – now`;
  const to = formatClockTime(end);
  return from === to ? from : `${from} – ${to}`;
};

/**
 * How long a bus was seen on a trip, e.g. "43 min" or "1 h 5 min"
 * @param {number} start Unix epoch seconds
 * @param {number} end Unix epoch seconds
 * @returns {string}
 */
export const formatTripDuration = (start, end) => {
  const minutes = Math.round(Math.max(0, end - start) / 60);
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
};
