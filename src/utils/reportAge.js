// @ts-check

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// past these, a position is old enough to call out
const STALE_SECONDS = 5 * MINUTE;
const OLD_SECONDS = HOUR;

const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  month: "short",
  day: "numeric",
});
const DATE_WITH_YEAR_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * How long ago a bus reported its position, e.g. "52s ago", "3h 5m ago" or "2d ago".
 * Past a week it gives the date instead.
 * @param {number} timestamp Unix epoch seconds
 * @param {number} [now] Epoch milliseconds
 * @returns {string}
 */
export const formatReportAge = (timestamp, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor(now / 1000 - timestamp));
  if (seconds < MINUTE) {
    return `${seconds}s ago`;
  }
  if (seconds < HOUR) {
    return `${Math.floor(seconds / MINUTE)}m ${seconds % MINUTE}s ago`;
  }
  if (seconds < DAY) {
    return `${Math.floor(seconds / HOUR)}h ${Math.floor((seconds % HOUR) / MINUTE)}m ago`;
  }
  if (seconds < 7 * DAY) {
    return `${Math.floor(seconds / DAY)}d ago`;
  }
  const date = new Date(timestamp * 1000);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return (sameYear ? DATE_FORMAT : DATE_WITH_YEAR_FORMAT).format(date);
};

/**
 * How much to trust a position's age: fresh, stale (over 5 minutes) or old (over an hour)
 * @param {number} timestamp Unix epoch seconds
 * @param {number} [now] Epoch milliseconds
 * @returns {"fresh" | "stale" | "old"}
 */
export const reportAgeLevel = (timestamp, now = Date.now()) => {
  const seconds = now / 1000 - timestamp;
  if (seconds > OLD_SECONDS) return "old";
  if (seconds > STALE_SECONDS) return "stale";
  return "fresh";
};
