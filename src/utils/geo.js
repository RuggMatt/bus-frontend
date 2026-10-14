const EARTH_RADIUS_METRES = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points
 * @param {[number, number]} a [lat, lon]
 * @param {[number, number]} b [lat, lon]
 * @returns {number} metres
 */
export const distanceMetres = (a, b) => {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
};

/**
 * Flat approximation, accurate enough over the length of a bus route. Scaled from the
 * path rather than the point so every projection onto a path measures the same way.
 * @param {[number, number][]} path
 */
const flatScale = (path) => ({
  metresPerLat: toRadians(EARTH_RADIUS_METRES),
  metresPerLon: toRadians(EARTH_RADIUS_METRES) * Math.cos(toRadians(path[0][0])),
});

/**
 * Projects a point onto a path and measures how far along the path it lands
 * @param {[number, number][]} path [lat, lon] points
 * @param {[number, number]} point [lat, lon]
 * @returns {{along: number, offset: number, point: [number, number]} | null} along: metres
 *   from the start of the path to the projected point; offset: metres between the point
 *   and the path; point: the projected [lat, lon]
 */
export const alongRouteMetres = (path, point) => {
  if (path.length < 2) {
    return null;
  }
  const { metresPerLat, metresPerLon } = flatScale(path);
  const toXY = ([lat, lon]) => [lon * metresPerLon, lat * metresPerLat];
  const [px, py] = toXY(point);

  let travelled = 0;
  let best = { along: 0, offset: Infinity, point: path[0] };
  let [ax, ay] = toXY(path[0]);
  for (let i = 1; i < path.length; i++) {
    const [bx, by] = toXY(path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    const t = lengthSquared
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
      : 0;
    const offset = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (offset < best.offset) {
      const [fromLat, fromLon] = path[i - 1];
      best = {
        along: travelled + t * length,
        offset,
        point: [fromLat + t * (path[i][0] - fromLat), fromLon + t * (path[i][1] - fromLon)],
      };
    }
    travelled += length;
    ax = bx;
    ay = by;
  }
  return best;
};

/**
 * The part of a path between two distances along it, as measured by alongRouteMetres
 * @param {[number, number][]} path [lat, lon] points
 * @param {number} fromAlong metres from the start of the path
 * @param {number} toAlong metres from the start of the path, more than fromAlong
 * @returns {[number, number][]} [lat, lon] points, starting and ending at those distances
 */
export const pathBetween = (path, fromAlong, toAlong) => {
  if (path.length < 2) {
    return [];
  }
  const { metresPerLat, metresPerLon } = flatScale(path);
  /** @type {(a: [number, number], b: [number, number], t: number) => [number, number]} */
  const interpolate = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  const points = [];
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot((b[0] - a[0]) * metresPerLat, (b[1] - a[1]) * metresPerLon);
    const start = travelled;
    travelled += length;
    if (!length || travelled < fromAlong) {
      continue;
    }
    if (!points.length) {
      points.push(interpolate(a, b, Math.max(0, (fromAlong - start) / length)));
    }
    if (travelled >= toAlong) {
      points.push(interpolate(a, b, (toAlong - start) / length));
      break;
    }
    points.push(b);
  }
  return points;
};
