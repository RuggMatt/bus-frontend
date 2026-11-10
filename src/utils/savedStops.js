// @ts-check

/** the browser storage key the saved stops are kept under */
export const SAVED_STOPS_KEY = "saved-stops";
// plenty for a rider's regular stops, and keeps the search's list short
export const MAX_SAVED_STOPS = 20;

/**
 * A stop the rider starred. Its name and number are kept with it, so the search can list
 * it without loading every stop.
 * @typedef {Object} SavedStop
 * @property {string} id GTFS `stop_id`
 * @property {string} name
 * @property {string} code the number on the sign at the stop
 */

/**
 * Reads the saved stops from what was stored, dropping anything that isn't one (the
 * storage can be edited, or written by a later version).
 * @param {string | null | undefined} stored
 * @returns {SavedStop[]}
 */
export const parseSavedStops = (stored) => {
  if (!stored) return [];
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  /** @type {SavedStop[]} */
  const stops = [];
  for (const entry of parsed) {
    if (!entry || typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    stops.push({
      id: entry.id,
      name: typeof entry.name === "string" ? entry.name : "",
      code: typeof entry.code === "string" && entry.code ? entry.code : entry.id,
    });
  }
  return stops.slice(0, MAX_SAVED_STOPS);
};

/**
 * @param {{stop_id: string, stop_name?: string, stop_code?: string}} stop
 * @returns {SavedStop}
 */
export const toSavedStop = (stop) => ({
  id: stop.stop_id,
  name: stop.stop_name || "",
  code: stop.stop_code || stop.stop_id,
});

/**
 * Saves a stop, or removes it if it's saved. A newly saved stop goes first, and the
 * oldest drop off past `MAX_SAVED_STOPS`.
 * @param {SavedStop[]} saved
 * @param {SavedStop} stop
 * @returns {SavedStop[]}
 */
export const toggleSavedStop = (saved, stop) =>
  saved.some((entry) => entry.id === stop.id)
    ? saved.filter((entry) => entry.id !== stop.id)
    : [stop, ...saved].slice(0, MAX_SAVED_STOPS);

/**
 * The saved stops as the main map's search lists them before anything is typed.
 * @param {SavedStop[]} saved
 * @returns {(import("./mapSearch").SearchResult & {saved: true})[]}
 */
export const savedStopResults = (saved) =>
  saved.map((stop) => ({
    value: `stop:${stop.id}`,
    title: stop.name || `Stop ${stop.code}`,
    subtitle: `Stop ${stop.code}`,
    saved: true,
  }));
