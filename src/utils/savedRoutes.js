// @ts-check
import { routeNumber } from "./routes";

/** the browser storage key the saved routes are kept under */
export const SAVED_ROUTES_KEY = "saved-routes";
export const MAX_SAVED_ROUTES = 20;

/**
 * A route the rider starred. Its name is kept with it, so the search can list it without
 * loading the routes.
 * @typedef {Object} SavedRoute
 * @property {string} id GTFS `route_id`
 * @property {string} name the route's long name
 */

/**
 * Reads the saved routes from what was stored, dropping anything that isn't one.
 * @param {string | null | undefined} stored
 * @returns {SavedRoute[]}
 */
export const parseSavedRoutes = (stored) => {
  if (!stored) return [];
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  /** @type {SavedRoute[]} */
  const routes = [];
  for (const entry of parsed) {
    if (!entry || typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    routes.push({ id: entry.id, name: typeof entry.name === "string" ? entry.name : "" });
  }
  return routes.slice(0, MAX_SAVED_ROUTES);
};

/**
 * Saves a route, or removes it if it's saved. A newly saved route goes first.
 * @param {SavedRoute[]} saved
 * @param {SavedRoute} route
 * @returns {SavedRoute[]}
 */
export const toggleSavedRoute = (saved, route) =>
  saved.some((entry) => entry.id === route.id)
    ? saved.filter((entry) => entry.id !== route.id)
    : [route, ...saved].slice(0, MAX_SAVED_ROUTES);

/**
 * The saved routes as the main map's search lists them before anything is typed.
 * @param {SavedRoute[]} saved
 * @returns {(import("./mapSearch").SearchResult & {saved: true})[]}
 */
export const savedRouteResults = (saved) =>
  saved.map((route) => ({
    value: `route:${route.id}`,
    title: `Route ${routeNumber(route.id)}`,
    subtitle: route.name,
    saved: true,
  }));

/**
 * Splits a list of routes into the saved ones, in the list's own order, and the rest.
 * @template {{route_id: string}} R
 * @param {R[]} routes
 * @param {SavedRoute[]} saved
 * @returns {{saved: R[], rest: R[]}}
 */
export const splitSavedRoutes = (routes, saved) => {
  const ids = new Set(saved.map((route) => route.id));
  return {
    saved: routes.filter((route) => ids.has(route.route_id)),
    rest: routes.filter((route) => !ids.has(route.route_id)),
  };
};
