// @ts-check
// the main map's time travel. A time is Edmonton wall-clock "YYYY-MM-DDTHH:MM", as in the url's ?at=
import { edmontonNow, scheduledEpochsNear } from "./serviceTime";
import { formatDayLabel, isDateString } from "./weeks";

const MINUTE_MS = 60_000;

/**
 * The date and time of a time travel value, or null when it isn't one
 * @param {unknown} value
 * @returns {{date: string, time: string} | null} time is HH:MM
 */
export const parseTravelTime = (value) => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isDateString(match[1])) return null;
  if (Number(match[2]) > 23 || Number(match[3]) > 59) return null;
  return { date: match[1], time: `${match[2]}:${match[3]}` };
};

/**
 * The current minute in Edmonton, as a time travel value
 * @param {Date} [now]
 * @returns {string}
 */
export const travelTimeNow = (now = new Date()) => {
  const { dateString, secondsSinceMidnight } = edmontonNow(now);
  const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `${dateString}T${pad(Math.floor(secondsSinceMidnight / 3600))}:${pad(Math.floor((secondsSinceMidnight % 3600) / 60))}`;
};

/**
 * Moves a time on the wall clock, so a step across a time change is still a step of that many minutes
 * @param {string} value
 * @param {number} minutes
 * @returns {string}
 */
export const shiftTravelTime = (value, minutes) =>
  new Date(Date.parse(`${value}:00Z`) + minutes * MINUTE_MS).toISOString().slice(0, 16);

/**
 * "Today, 8:30 AM" or "Wed, Oct 14, 8:30 AM"
 * @param {string} value
 * @param {string} today YYYY-MM-DD in Edmonton
 * @returns {string}
 */
export const formatTravelTime = (value, today) => {
  const parsed = parseTravelTime(value);
  if (!parsed) return "";
  const [hours, minutes] = parsed.time.split(":").map(Number);
  const clock = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return `${formatDayLabel(parsed.date, today)}, ${clock}`;
};

/**
 * The Edmonton day a bus's run of its trip started, which the trip page's ?date= wants,
 * as a run past midnight belongs to the day it started
 * @param {string} firstTime the trip's first scheduled time, HH:MM:SS
 * @param {number} timestamp when the bus reported its position, unix seconds
 * @returns {string} YYYY-MM-DD
 */
export const runDateAt = (firstTime, timestamp) => {
  const [start] = scheduledEpochsNear([firstTime], timestamp);
  return edmontonNow(new Date(/** @type {number} */ (start) * 1000)).dateString;
};
