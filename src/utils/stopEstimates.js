const EARTH_RADIUS_METRES = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// a stop counts as passed once the bus is this far beyond it along the route. It also
// keeps a bus waiting at the first stop from counting until it leaves
export const PASSED_METRES = 25;
// positions further than this from the route (a detour, a bad fix) say nothing about progress
export const OFF_ROUTE_METRES = 150;
// stops further than this from the route can't be placed on it
const STOP_OFF_ROUTE_METRES = 200;
// when the first position is already past a stop by more than this, the bus wasn't
// recorded going by it
const FIRST_SEEN_PAST_METRES = 100;
// how far a position can land behind the progress so far (GPS wobble) or ahead of it.
// Ahead is limited by how far a bus could have driven since the last position, so a
// route that comes back to the same spot later isn't skipped to
const BACKTRACK_METRES = 50;
const MAX_SPEED_METRES_PER_SECOND = 30;
const AHEAD_SLACK_METRES = 300;
// a route can pass the same spot twice, as on a loop. Of the passes within this of the
// closest one, the earliest is taken
const SAME_PASS_METRES = 30;

/**
 * A route shape measured once, in flat metres (accurate enough over a bus route), so
 * every projection onto it only works through the stretch it's limited to
 * @param {[number, number][]} path [lat, lon] points
 */
const measurePath = (path) => {
  const metresPerLat = toRadians(EARTH_RADIUS_METRES);
  const metresPerLon = metresPerLat * Math.cos(toRadians(path[0][0]));
  /** @type {(point: [number, number]) => [number, number]} */
  const toXY = ([lat, lon]) => [lon * metresPerLon, lat * metresPerLat];
  const points = path.map(toXY);
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return { points, along, length: along[along.length - 1], toXY };
};

/**
 * Where a point lands along the stretch of a route between two distances. When the
 * stretch passes near the point more than once, the earliest close pass is taken
 * @param {ReturnType<typeof measurePath>} measured
 * @param {[number, number]} point [lat, lon]
 * @param {number} fromAlong metres
 * @param {number} toAlong metres
 * @returns {{along: number, offset: number} | null} along: metres from the start of the
 *   route; offset: metres between the point and the route
 */
const projectBetween = (measured, point, fromAlong, toAlong) => {
  const { points, along, toXY } = measured;
  const [px, py] = toXY(point);
  /** @type {{along: number, offset: number}[]} */
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const start = along[i - 1];
    const length = along[i] - start;
    if (along[i] < fromAlong || start > toAlong) {
      continue;
    }
    const [ax, ay] = points[i - 1];
    const dx = points[i][0] - ax;
    const dy = points[i][1] - ay;
    const t = length ? ((px - ax) * dx + (py - ay) * dy) / (length * length) : 0;
    // only the part of the segment inside the stretch
    const tMin = length ? Math.max(0, (fromAlong - start) / length) : 0;
    const tMax = length ? Math.min(1, (toAlong - start) / length) : 0;
    const clamped = Math.min(tMax, Math.max(tMin, t));
    segments.push({
      along: start + clamped * length,
      offset: Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy)),
    });
  }
  if (!segments.length) {
    return null;
  }
  const closest = Math.min(...segments.map((segment) => segment.offset));
  // the first run of segments near the point is the earliest pass; its closest point is
  // where the point lands. Taking the first near segment alone would land short of it
  const first = segments.findIndex((segment) => segment.offset <= closest + SAME_PASS_METRES);
  let best = segments[first];
  for (let i = first + 1; i < segments.length && segments[i].offset <= closest + SAME_PASS_METRES; i++) {
    if (segments[i].offset < best.offset) {
      best = segments[i];
    }
  }
  return best;
};

/**
 * How far along the route the bus had got at each position, oldest first. Progress only
 * goes forward, and each position is looked for near the last one, so a loop or a route
 * that comes back past the same spot doesn't jump the bus ahead or back
 * @param {ReturnType<typeof measurePath>} measured
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @returns {Array<{along: number, timestamp: number}>}
 */
const progressAlong = (measured, positions) => {
  const sorted = positions
    .map((position) => ({
      point: /** @type {[number, number]} */ ([Number(position.lat), Number(position.long)]),
      timestamp: position.timestamp,
    }))
    .filter(({ point, timestamp }) => point.every(Number.isFinite) && Number.isFinite(timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  /** @type {Array<{along: number, timestamp: number}>} */
  const progress = [];
  for (const { point, timestamp } of sorted) {
    const last = progress.at(-1);
    const projected = last
      ? projectBetween(
          measured,
          point,
          last.along - BACKTRACK_METRES,
          last.along + MAX_SPEED_METRES_PER_SECOND * (timestamp - last.timestamp) + AHEAD_SLACK_METRES,
        )
      : projectBetween(measured, point, 0, measured.length);
    if (!projected || projected.offset > OFF_ROUTE_METRES) {
      continue;
    }
    progress.push({ along: Math.max(last?.along ?? 0, projected.along), timestamp });
  }
  return progress;
};

/**
 * When the bus went by each stop, from its recorded positions and the route shape. A stop
 * only gets a time once the bus is PASSED_METRES beyond it along the route, and the time
 * is worked out between the positions either side of that point
 * @param {Array<{lat: number|string, lon: number|string} | null>} stops in trip order
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @param {[number, number][]} path the trip's route shape, [lat, lon] points
 * @returns {Array<number|null>} unix seconds per stop, null when the bus hasn't passed it
 *   (or wasn't recorded going by)
 */
export const estimateStopArrivals = (stops, positions, path) => {
  if (path.length < 2) {
    return stops.map(() => null);
  }
  const measured = measurePath(path);
  const progress = progressAlong(measured, positions);
  let stopFrom = 0;
  return stops.map((stop) => {
    const point = stop && /** @type {[number, number]} */ ([Number(stop.lat), Number(stop.lon)]);
    if (!point || !point.every(Number.isFinite)) {
      return null;
    }
    // stops come in order along the route, so the last stops of a loop aren't placed at its start
    const projected = projectBetween(measured, point, stopFrom, measured.length);
    if (!projected || projected.offset > STOP_OFF_ROUTE_METRES) {
      return null;
    }
    stopFrom = projected.along;
    // the route can end right at its last stop, so that one counts once the bus is close to the end
    const passedAt = Math.min(projected.along + PASSED_METRES, measured.length - PASSED_METRES);
    const index = progress.findIndex((position) => position.along >= passedAt);
    if (index === -1) {
      return null;
    }
    const after = progress[index];
    if (index === 0) {
      return after.along - passedAt <= FIRST_SEEN_PAST_METRES ? after.timestamp : null;
    }
    const before = progress[index - 1];
    const fraction = (passedAt - before.along) / (after.along - before.along);
    return Math.round(before.timestamp + fraction * (after.timestamp - before.timestamp));
  });
};
