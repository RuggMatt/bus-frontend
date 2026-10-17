// @ts-check
import { scheduleStatus } from "./busStatus";
import { secondsToTime, timeToSeconds } from "./serviceTime";

/**
 * @typedef {Object} RouteStopTimes
 * @property {string} route
 * @property {string} date YYYY-MM-DD, the service day
 * @property {number} count
 * @property {Array<{trip: number|string, stops: Array<[number, number]>}>} trips Each stop is
 *   [stop_sequence, delay in seconds], negative when early
 */

/**
 * Each trip's delays by stop_sequence.
 * @param {RouteStopTimes | undefined | null} data
 * @returns {Map<string, Map<number, number>>}
 */
export const delaysByTrip = (data) =>
  new Map((data?.trips ?? []).map(({ trip, stops }) => [String(trip), new Map(stops)]));

/**
 * When a bus went by a stop, from its scheduled time and how late it was, with the
 * status chip's label and colour, rounded to the minute like the rest of the app.
 * @param {string} scheduled HH:MM:SS, where HH may be 24 or more
 * @param {number} delaySeconds Negative is early
 * @returns {{time: string, status: {label: string, color: string}}} time is HH:MM:SS
 */
export const actualStopTime = (scheduled, delaySeconds) => ({
  time: secondsToTime(timeToSeconds(scheduled) + delaySeconds),
  status: scheduleStatus(Math.round(delaySeconds / 60)),
});
