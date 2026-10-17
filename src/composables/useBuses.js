import { useQuery } from "@tanstack/vue-query";
import { getAllBuses } from "../api";
import { nextBusRefreshDelay } from "../utils/busRefresh";

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

/** The raw /bus/now snapshot, with the route as `route` rather than `route_id`. */
export function useLiveBuses() {
  return useQuery(liveBusesQuery);
}

/**
 * Gives each bus the route_id the rest of the app uses, from the route /bus/now reports.
 * @param {import("../api").Bus[]} buses
 */
const withRouteIds = (buses) => buses.map((bus) => ({ ...bus, route_id: bus.route ?? null }));

/** /bus/now with each bus's route_id assigned. */
export function useBuses() {
  // a select over the shared snapshot, so it's the same request and copies leave it unchanged
  const { data: buses, refetch: updateBuses } = useQuery({
    ...liveBusesQuery,
    select: withRouteIds,
  });

  return {
    buses,
    updateBuses,
  };
}
