import { distanceMetres } from "./geo";

/**
 * @typedef {Object} FinderRow
 * @property {import('../api').Bus} bus
 * @property {{route_id: string, trip_headsign: string} | null} trip null when out of
 *   service, or the trip isn't in the feed
 * @property {number | null} distance metres from the viewer, when their location is known
 */

/**
 * The finder's buses, nearest the viewer first, or by bus number without a location
 * @param {import('../api').Bus[]} buses
 * @param {Map<string, {route_id: string, trip_headsign: string}>} tripsById
 * @param {[number, number] | null} origin the viewer's [lat, lon]
 * @returns {FinderRow[]}
 */
export const finderRows = (buses, tripsById, origin) =>
  buses
    .map((bus) => ({
      bus,
      trip: (bus.trip && tripsById.get(String(bus.trip))) || null,
      distance: origin ? distanceMetres(origin, [Number(bus.lat), Number(bus.long)]) : null,
    }))
    .sort((a, b) =>
      a.distance !== null && b.distance !== null
        ? a.distance - b.distance
        : String(a.bus.bus).localeCompare(String(b.bus.bus), undefined, { numeric: true }),
    );
