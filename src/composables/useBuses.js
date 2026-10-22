import { useQuery } from "@tanstack/vue-query";
import { computed, toValue } from "vue";
import { getAllBuses, getBusesAt } from "../api";
import { nextBusRefreshDelay } from "../utils/busRefresh";
import { parseTravelTime, travelTimeNow } from "../utils/timeTravel";

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

/**
 * /bus/now with each bus's route_id assigned.
 * @param {{ enabled?: import("vue").MaybeRefOrGetter<boolean> }} [options]
 */
export function useBuses({ enabled = true } = {}) {
  // a select over the shared snapshot, so it's the same request and copies leave it unchanged
  const { data: buses, refetch: updateBuses } = useQuery({
    ...liveBusesQuery,
    select: withRouteIds,
    enabled,
  });

  return {
    buses,
    updateBuses,
  };
}

// the minutes either side of now a time travel snapshot can still be filling in
const RECENT_MINUTES = 5;

/**
 * The main map's buses: the live snapshot, or every bus's position at a time travel
 * value (`YYYY-MM-DDTHH:MM`, Edmonton). Only one of the two is fetched, so time travel
 * doesn't keep polling /bus/now.
 * @param {import("vue").MaybeRefOrGetter<string | null>} at
 */
export function useMapBuses(at) {
  const travel = computed(() => parseTravelTime(toValue(at)));
  const { buses: liveBuses } = useBuses({ enabled: () => !travel.value });
  const { data: pastBuses, isFetching, isError } = useQuery({
    queryKey: computed(() => ["buses-at", toValue(at)]),
    queryFn: () => getBusesAt(travel.value.date, travel.value.time),
    enabled: () => Boolean(travel.value),
    select: withRouteIds,
    // a past minute's positions don't change, unless it's a minute or so ago
    staleTime: () => {
      const recent = (Date.parse(`${travelTimeNow()}:00Z`) - Date.parse(`${toValue(at)}:00Z`)) / 60_000 < RECENT_MINUTES;
      return recent ? 30_000 : Infinity;
    },
  });
  return {
    buses: computed(() => (travel.value ? pastBuses.value : liveBuses.value)),
    loading: computed(() => Boolean(travel.value) && isFetching.value),
    isError: computed(() => Boolean(travel.value) && isError.value),
  };
}
