// the backend collects a new /bus/now snapshot about this often
const SNAPSHOT_PERIOD_SECONDS = 60;
// allowance for the viewer's clock disagreeing with the backend's
const CLOCK_DRIFT_SECONDS = 5;
// a fetch can land just before the new snapshot does, so don't retry faster than this
const MIN_DELAY_SECONDS = 5;
// past this age the collector has likely stalled, so stop chasing the next snapshot
const STALLED_AGE_SECONDS = 90;
const STALLED_DELAY_SECONDS = 30;

/**
 * How long to wait before fetching /bus/now again, timed for when the next snapshot
 * should be available. The newest position in a snapshot stands in for when it was
 * taken, since the response doesn't say.
 * @param {{timestamp: number}[] | null | undefined} buses The latest /bus/now response
 * @param {number} [now] Epoch milliseconds
 * @returns {number} milliseconds
 */
export const nextBusRefreshDelay = (buses, now = Date.now()) => {
  const newest = Math.max(...(buses || []).map((bus) => Number(bus.timestamp) || 0), 0);
  if (!newest) {
    return STALLED_DELAY_SECONDS * 1000;
  }
  const age = now / 1000 - newest;
  if (age > STALLED_AGE_SECONDS) {
    return STALLED_DELAY_SECONDS * 1000;
  }
  const delay = SNAPSHOT_PERIOD_SECONDS + CLOCK_DRIFT_SECONDS - age;
  return Math.round(
    Math.min(Math.max(delay, MIN_DELAY_SECONDS), SNAPSHOT_PERIOD_SECONDS + CLOCK_DRIFT_SECONDS) * 1000,
  );
};
