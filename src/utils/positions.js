// @ts-check
import { distanceMetres } from "./geo";

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * The compass point a bearing is closest to, e.g. 50 → "NE"
 * @param {number|string} bearing degrees clockwise from north
 * @returns {string}
 */
export const compassPoint = (bearing) => {
  const degrees = ((Number(bearing) % 360) + 360) % 360;
  if (!Number.isFinite(degrees)) return "";
  return COMPASS_POINTS[Math.round(degrees / 45) % 8];
};

/**
 * The stop nearest a position, if one is close enough to say the bus was at it
 * @template {{lat: number, lon: number}} S
 * @param {{lat: number|string, long: number|string}} position
 * @param {S[]} stops
 * @param {number} maxMetres
 * @returns {S | null}
 */
export const nearestStop = (position, stops, maxMetres) => {
  const point = /** @type {[number, number]} */ ([Number(position.lat), Number(position.long)]);
  if (!point.every(Number.isFinite)) return null;
  let nearest = null;
  let nearestDistance = maxMetres;
  for (const stop of stops) {
    const distance = distanceMetres(point, [stop.lat, stop.lon]);
    if (distance <= nearestDistance) {
      nearest = stop;
      nearestDistance = distance;
    }
  }
  return nearest;
};

/**
 * Picks positions far enough apart on screen that their pins and badges don't overlap.
 * Goes in order, keeping each point at least minSpacing from every kept one. The first
 * and last are always kept, so both ends of a run show.
 * @param {Array<{x: number, y: number}>} points pixel positions, in time order
 * @param {number} minSpacing pixels
 * @returns {number[]} indices of the kept points, in order
 */
export const thinPositions = (points, minSpacing) => {
  if (points.length <= 2) return points.map((_, index) => index);
  // a grid of minSpacing cells, so each point only checks its neighbours
  /** @type {Map<string, Array<{x: number, y: number}>>} */
  const grid = new Map();
  const cell = (/** @type {number} */ value) => Math.floor(value / minSpacing);
  const isClear = (/** @type {{x: number, y: number}} */ point) => {
    const cx = cell(point.x);
    const cy = cell(point.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const kept of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.hypot(kept.x - point.x, kept.y - point.y) < minSpacing) return false;
        }
      }
    }
    return true;
  };
  const keep = (/** @type {{x: number, y: number}} */ point) => {
    const key = `${cell(point.x)},${cell(point.y)}`;
    grid.set(key, [...(grid.get(key) ?? []), point]);
  };
  const last = points.length - 1;
  // the ends are kept first, so the points between make room for them
  keep(points[0]);
  keep(points[last]);
  const kept = [0];
  for (let index = 1; index < last; index++) {
    if (isClear(points[index])) {
      keep(points[index]);
      kept.push(index);
    }
  }
  kept.push(last);
  return kept;
};

/**
 * Groups runs of consecutive positions that stay within maxMetres of the first of them,
 * as when a bus waits at a stop. Measuring from the first rather than the last keeps a
 * slow crawl from chaining into one long group, and only grouping neighbours keeps the
 * groups in time order, so a loop passing the same spot twice gives two groups.
 * @template {{lat: number|string, long: number|string}} P
 * @param {P[]} positions in time order
 * @param {number} maxMetres
 * @returns {P[][]}
 */
export const groupPositions = (positions, maxMetres) => {
  const pointOf = (/** @type {P} */ position) =>
    /** @type {[number, number]} */ ([Number(position.lat), Number(position.long)]);
  /** @type {P[][]} */
  const groups = [];
  /** @type {[number, number] | null} */
  let anchor = null;
  for (const position of positions) {
    const point = pointOf(position);
    const valid = point.every(Number.isFinite);
    if (anchor && valid && distanceMetres(anchor, point) <= maxMetres) {
      groups[groups.length - 1].push(position);
    } else {
      groups.push([position]);
      anchor = valid ? point : null;
    }
  }
  return groups;
};
