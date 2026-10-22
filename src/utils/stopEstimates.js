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
// a bus can switch to its next trip a few stops early, or late. Its positions this long
// either side of a run, whatever trip they're on, can fill in the stops at either end
export const NEIGHBOUR_SECONDS = 15 * 60;
// a position this close to the first stop has the bus at the start of the trip
const AT_START_METRES = 100;

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
 * Positions as points on the map, oldest first, leaving out any without a place or time
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @returns {Array<{point: [number, number], timestamp: number}>}
 */
const toPoints = (positions) =>
  positions
    .map((position) => ({
      point: /** @type {[number, number]} */ ([Number(position.lat), Number(position.long)]),
      timestamp: position.timestamp,
    }))
    .filter(({ point, timestamp }) => point.every(Number.isFinite) && Number.isFinite(timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

/**
 * How far along the route the bus had got at each position, oldest first. Progress only
 * goes forward, and each position is looked for near the last one, so a loop or a route
 * that comes back past the same spot doesn't jump the bus ahead or back
 * @param {ReturnType<typeof measurePath>} measured
 * @param {ReturnType<typeof toPoints>} points oldest first
 * @returns {Array<{along: number, timestamp: number}>}
 */
const progressAlong = (measured, points) => {
  /** @type {Array<{along: number, timestamp: number}>} */
  const progress = [];
  for (const { point, timestamp } of points) {
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
 * Where along the route each stop counts as passed, in metres, or null for a stop that
 * can't be placed on it
 * @param {ReturnType<typeof measurePath>} measured
 * @param {Array<{lat: number|string, lon: number|string} | null>} stops in trip order
 * @returns {Array<number|null>}
 */
const passingPoints = (measured, stops) => {
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
    return Math.min(projected.along + PASSED_METRES, measured.length - PASSED_METRES);
  });
};

/**
 * When the bus went past each passing point, between the positions either side of it
 * @param {Array<number|null>} passing from passingPoints
 * @param {ReturnType<typeof progressAlong>} progress oldest first
 * @returns {Array<number|null>}
 */
const timesAlong = (passing, progress) =>
  passing.map((passedAt) => {
    if (passedAt === null) {
      return null;
    }
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

/**
 * @param {ReturnType<typeof measurePath>} measured
 * @param {Array<number|null>} passing from passingPoints
 * @param {ReturnType<typeof toPoints>} points oldest first
 * @returns {Array<number|null>}
 */
const passingTimes = (measured, passing, points) => timesAlong(passing, progressAlong(measured, points));

/**
 * A run can go round a loop more than once, when the bus kept the trip's id for the lap
 * before or after it. Progress only goes forward, so every stop would be timed on the
 * first lap. The run is cut wherever the bus gets to the end of the route, and what
 * follows is another lap when it times at least half the stops the first lap could
 * @param {ReturnType<typeof measurePath>} measured
 * @param {Array<number|null>} passing from passingPoints
 * @param {ReturnType<typeof toPoints>} points oldest first
 * @returns {Array<{from: number, to: number, times: Array<number|null>}>} indexes into points
 *   (to exclusive) and each lap's passing times
 */
const laps = (measured, passing, points) => {
  const found = [];
  let from = 0;
  while (from < points.length) {
    const progress = progressAlong(measured, points.slice(from));
    const done = progress.findIndex((position) => position.along >= measured.length - PASSED_METRES);
    const doneAt = done === -1 ? Infinity : progress[done].timestamp;
    const next = points.findIndex((point, index) => index > from && point.timestamp > doneAt);
    const to = next === -1 ? points.length : next;
    // every stop is passed by the time the bus is at the end, so nothing after it is needed
    found.push({ from, to, times: timesAlong(passing, done === -1 ? progress : progress.slice(0, done + 1)) });
    from = to;
  }
  const timed = (/** @type {Array<number|null>} */ times) => times.filter((time) => time !== null).length;
  const enough = Math.max(1, timed(found[0]?.times ?? []) / 2);
  return found.filter((lap, index) => index === 0 || timed(lap.times) >= enough);
};

/**
 * How far a lap's times are from the schedule, on average, in seconds
 * @param {Array<number|null>} times
 * @param {Array<number|null>} scheduled
 * @returns {number} Infinity when no stop has both
 */
const offSchedule = (times, scheduled) => {
  const gaps = times.flatMap((time, index) =>
    time === null || scheduled[index] == null ? [] : [Math.abs(time - /** @type {number} */ (scheduled[index]))],
  );
  return gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : Infinity;
};

/**
 * When the bus went by each stop, from its recorded positions and the route shape. A stop
 * only gets a time once the bus is PASSED_METRES beyond it along the route, and the time
 * is worked out between the positions either side of that point.
 *
 * When the run goes round a loop more than once (see laps), the lap nearest `scheduled`
 * is taken, or the first without a schedule. The run's positions outside that lap count
 * as positions either side of it.
 *
 * A bus can switch to its next trip a few stops early, or keep its last trip's id for the
 * first few stops of this one. The stops at either end that the run alone leaves without
 * a time are then filled in from the bus's own positions just outside the run (`before`
 * and `after`, within NEIGHBOUR_SECONDS of it, on whatever trip). At the start that only
 * counts from when the bus was at the first stop, so the end of its last trip, which can
 * come back along the same road, isn't taken for this one. Stops the run gives a time
 * are never changed
 * @param {Array<{lat: number|string, lon: number|string} | null>} stops in trip order
 * @param {Array<{lat: number|string, long: number|string, timestamp: number}>} positions
 * @param {[number, number][]} path the trip's route shape, [lat, lon] points
 * @param {{
 *   before?: Array<{lat: number|string, long: number|string, timestamp: number}>,
 *   after?: Array<{lat: number|string, long: number|string, timestamp: number}>,
 * }} [neighbours] the same bus's positions just before and after the run
 * @param {Array<number|null|undefined>} [scheduled] unix seconds each stop is scheduled at,
 *   to pick the lap of a run that went round a loop more than once
 * @returns {Array<number|null>} unix seconds per stop, null when the bus hasn't passed it
 *   (or wasn't recorded going by)
 */
export const estimateStopArrivals = (stops, positions, path, { before = [], after = [] } = {}, scheduled = []) => {
  if (path.length < 2) {
    return stops.map(() => null);
  }
  const measured = measurePath(path);
  const passing = passingPoints(measured, stops);
  const all = toPoints(positions);
  if (!all.length) {
    return passing.map(() => null);
  }
  const lap = laps(measured, passing, all).reduce((best, other) =>
    offSchedule(other.times, scheduled) < offSchedule(best.times, scheduled) ? other : best,
  );
  const run = all.slice(lap.from, lap.to);
  const estimates = lap.times;
  const start = run[0].timestamp;
  const end = /** @type {{timestamp: number}} */ (run.at(-1)).timestamp;

  // the stops before the first one with a time
  const firstKnown = estimates.findIndex((estimate) => estimate !== null);
  const leading = firstKnown === -1 ? estimates.length : firstKnown;
  const firstStop = stops.find((stop) => stop && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)));
  if (leading && firstStop) {
    const [stopX, stopY] = measured.toXY([Number(firstStop.lat), Number(firstStop.lon)]);
    const earlier = [...toPoints(before), ...all.slice(0, lap.from)].filter(
      ({ timestamp }) => timestamp < start && timestamp >= start - NEIGHBOUR_SECONDS,
    );
    const around = [...earlier, ...run];
    const atStart = around.findIndex(({ point, timestamp }) => {
      const [x, y] = measured.toXY(point);
      return timestamp <= start + NEIGHBOUR_SECONDS && Math.hypot(x - stopX, y - stopY) <= AT_START_METRES;
    });
    // when the run itself starts at the first stop, it already gave what it could
    if (atStart !== -1 && atStart !== earlier.length) {
      const filled = passingTimes(measured, passing, around.slice(atStart));
      for (let i = 0; i < leading; i++) {
        estimates[i] = filled[i];
      }
    }
  }

  // the stops after the last one with a time
  const lastKnown = estimates.findLastIndex((estimate) => estimate !== null);
  if (lastKnown < estimates.length - 1) {
    const later = [...all.slice(lap.to), ...toPoints(after)].filter(
      ({ timestamp }) => timestamp > end && timestamp <= end + NEIGHBOUR_SECONDS,
    );
    if (later.length) {
      const filled = passingTimes(measured, passing, [...run, ...later]);
      for (let i = lastKnown + 1; i < estimates.length; i++) {
        estimates[i] = filled[i];
      }
    }
  }
  return estimates;
};
