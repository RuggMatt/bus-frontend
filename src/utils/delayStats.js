// @ts-check
import { scheduleStatus } from "./busStatus";

// the backend's histogram puts anything earlier or later in its end bins
export const HISTOGRAM_EARLY_MINUTES = 10;
export const HISTOGRAM_LATE_MINUTES = 30;

/** @typedef {{minutes: number, count: number}} DelayBin */

/**
 * Every whole minute from the earliest bin to the latest, with the ones nobody fell in
 * as 0, so the bars sit at their real distance apart. -1 to 1 are always there, so the
 * on-time band shows even when every bus was late.
 * @param {DelayBin[]} histogram
 * @returns {DelayBin[]}
 */
export const histogramBars = (histogram) => {
  if (!histogram.length) return [];
  const counts = new Map(histogram.map((bin) => [bin.minutes, bin.count]));
  const first = Math.min(-1, ...counts.keys());
  const last = Math.max(1, ...counts.keys());
  const bars = [];
  for (let minutes = first; minutes <= last; minutes++) {
    bars.push({ minutes, count: counts.get(minutes) ?? 0 });
  }
  return bars;
};

/**
 * What a bin holds. A bin is its minute up to the next, so -3 is 2 to 3 minutes early.
 * @param {number} minutes
 * @returns {string}
 */
export const binLabel = (minutes) => {
  if (minutes <= -HISTOGRAM_EARLY_MINUTES) return `${HISTOGRAM_EARLY_MINUTES - 1}+ min early`;
  if (minutes >= HISTOGRAM_LATE_MINUTES) return `${HISTOGRAM_LATE_MINUTES}+ min late`;
  if (minutes === -1) return "Under 1 min early";
  if (minutes === 0) return "Under 1 min late";
  if (minutes < 0) return `${-minutes - 1}–${-minutes} min early`;
  return `${minutes}–${minutes + 1} min late`;
};

// a bin is on time if it's from a minute early to under two late, near enough
// scheduleStatus's rounding to the minute
/** @param {number} minutes */
const isOnTimeBin = (minutes) => minutes >= -1 && minutes <= 1;

/**
 * The theme colour of a bin, matching the trip page's chips.
 * @param {number} minutes
 * @returns {'info'|'success'|'warning'}
 */
export const binColor = (minutes) => {
  if (isOnTimeBin(minutes)) return "success";
  return minutes < 0 ? "info" : "warning";
};

/**
 * The share of times that were on time, a minute early to under 2 minutes late.
 * @param {DelayBin[]} histogram
 * @returns {number|null} 0 to 1, null without any times
 */
export const onTimeShare = (histogram) => {
  const total = histogram.reduce((sum, bin) => sum + bin.count, 0);
  if (!total) return null;
  const onTime = histogram.reduce((sum, bin) => sum + (isOnTimeBin(bin.minutes) ? bin.count : 0), 0);
  return onTime / total;
};

/**
 * The status chip for an average delay, like the trip page's per-stop ones.
 * @param {number} meanSeconds
 */
export const typicalStatus = (meanSeconds) => scheduleStatus(Math.round(meanSeconds / 60));

/**
 * A delay to the second: "1 min 40 s late", "35 s early", "2 min late".
 * @param {number} seconds Negative is early
 * @returns {string}
 */
export const formatDelay = (seconds) => {
  const rounded = Math.round(Math.abs(seconds));
  if (!rounded) return "On time";
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  const parts = [minutes ? `${minutes} min` : "", rest ? `${rest} s` : ""].filter(Boolean).join(" ");
  return `${parts} ${seconds < 0 ? "early" : "late"}`;
};

/**
 * @typedef {Object} DelaySummary
 * @property {number} count Stops with a time
 * @property {number} onTime
 * @property {number} late
 * @property {number} early
 * @property {number} mean Seconds, negative is early
 * @property {number} worst The latest it was at a stop, in seconds
 */

/**
 * How a run went over its stops, counted like the per-stop chips (`scheduleStatus`).
 * @param {Array<number | null>} delays Seconds at each stop, null for stops without a time
 * @returns {DelaySummary | null} null when no stop has a time
 */
export const summarizeDelays = (delays) => {
  const known = /** @type {number[]} */ (delays.filter((delay) => delay !== null && Number.isFinite(delay)));
  if (!known.length) return null;
  const summary = { count: known.length, onTime: 0, late: 0, early: 0, mean: 0, worst: -Infinity };
  for (const delay of known) {
    const color = scheduleStatus(Math.round(delay / 60)).color;
    if (color === "warning") summary.late++;
    else if (color === "info") summary.early++;
    else summary.onTime++;
    summary.mean += delay / known.length;
    summary.worst = Math.max(summary.worst, delay);
  }
  return summary;
};
