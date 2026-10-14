import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { getAllBuses, getTrips } from "../api";
import { chunk } from "../utils/chunk";
import { nextBusRefreshDelay } from "../utils/busRefresh";

// a trip's route never changes, so each trip is only looked up once per session
/** @type {Map<string, string|null>} */
const routeIdByTrip = new Map();

/**
 * Looks up the route of every trip not seen before.
 * @param {(string|number)[]} tripIds
 */
const lookUpRouteIds = async (tripIds) => {
  const unknownTrips = [...new Set(tripIds.map(String))].filter((tripId) => !routeIdByTrip.has(tripId));
  await Promise.allSettled(
    chunk(unknownTrips, 50).map(async (batch) => {
      const trips = await getTrips(batch);
      // remember trips the feed doesn't know too, so they aren't asked for every refresh
      batch.forEach((tripId) => routeIdByTrip.set(tripId, null));
      trips.forEach((trip) => routeIdByTrip.set(String(trip.trip_id), trip.route_id));
    }),
  );
};

/**
 * Shared options for the raw /bus/now snapshot. Every page reads /bus/now through
 * this, so they share one cached copy that stays fresh until the next snapshot is due.
 */
export const liveBusesQuery = {
  queryKey: ["buses-live"],
  queryFn: getAllBuses,
  /** @param {import("@tanstack/vue-query").Query<import("../api").Bus[]>} query */
  staleTime: (query) => nextBusRefreshDelay(query.state.data, query.state.dataUpdatedAt),
  /** @param {import("@tanstack/vue-query").Query<import("../api").Bus[]>} query */
  refetchInterval: (query) => nextBusRefreshDelay(query.state.data),
};

/** The raw /bus/now snapshot, without route ids. */
export function useLiveBuses() {
  return useQuery(liveBusesQuery);
}

/** /bus/now with each bus's route_id assigned. */
export function useBuses() {
  const queryClient = useQueryClient();
  const { data: buses, refetch: updateBuses } = useQuery({
    ...liveBusesQuery,
    queryKey: ["buses"],
    queryFn: async () => {
      const busesData = await queryClient.fetchQuery(liveBusesQuery);
      await lookUpRouteIds(busesData.map((bus) => bus.trip));
      // copies, so the shared snapshot isn't changed
      return busesData.map((bus) => ({ ...bus, route_id: routeIdByTrip.get(String(bus.trip)) ?? null }));
    },
  });

  return {
    buses,
    updateBuses,
  };
}
