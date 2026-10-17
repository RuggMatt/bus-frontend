// @ts-check
import { LOCAL_AGENCY, compareAgencies } from "./routes";

/**
 * @typedef {{
 *   route_id: string,
 *   route_long_name: string,
 *   agency_name: string,
 *   rail: boolean,
 *   buses: unknown[],
 *   upcoming: unknown[],
 *   upcomingLoading?: boolean,
 * }} RouteGroupLike
 */

/**
 * Whether a route at a stop has something on the way: a live bus, or for an LRT line,
 * which isn't tracked live, a scheduled train. A line whose trains are still loading
 * counts, so it doesn't drop down and back up.
 * @param {RouteGroupLike} group
 */
export const isActiveGroup = (group) =>
  group.buses.length > 0 || group.upcoming.length > 0 || !!group.upcomingLoading;

/**
 * Orders a stop's routes: those with something on the way first, then the rest, each by
 * route number. LRT lines go first in each, by name, so they keep their places when
 * switching platforms. A route number run by two agencies has the local one first.
 * @param {RouteGroupLike} a
 * @param {RouteGroupLike} b
 */
export const compareStopRouteGroups = (a, b) =>
  Number(isActiveGroup(b)) - Number(isActiveGroup(a)) ||
  Number(b.rail) - Number(a.rail) ||
  (a.rail && b.rail
    ? a.route_long_name.localeCompare(b.route_long_name)
    : a.route_id.localeCompare(b.route_id, undefined, { numeric: true })) ||
  compareAgencies(a.agency_name, b.agency_name);

/**
 * Whether the backend has a week of delays for a route, which it only records for
 * Edmonton Transit buses. Route ids are only unique within an agency, so a regional
 * route sharing a number would get ETS's stats.
 * @param {RouteGroupLike} group
 */
export const hasDelayStats = (group) => !group.rail && group.agency_name === LOCAL_AGENCY;
