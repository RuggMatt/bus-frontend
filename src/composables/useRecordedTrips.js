// @ts-check
import { useQuery } from "@tanstack/vue-query";
import { computed, toValue } from "vue";
import { getRouteTrips } from "../api";
import { edmontonNow } from "../utils/serviceTime";
import { addDays } from "../utils/weeks";

/**
 * The ids of a route's trips we recorded on an Edmonton day, and whether they've
 * loaded, so a trip missing while they load isn't taken as never recorded. Future
 * days, or no date, make no request and give an empty set.
 * @param {import('vue').MaybeRefOrGetter<string>} routeId
 * @param {import('vue').MaybeRefOrGetter<string | null | undefined>} date YYYY-MM-DD
 */
export const useRecordedTripsQuery = (routeId, date) => {
  const today = edmontonNow().dateString;
  const { data, isSuccess } = useQuery({
    queryKey: computed(() => ["route-day-runs", toValue(routeId), toValue(date)]),
    queryFn: () => getRouteTrips(toValue(routeId), /** @type {string} */ (toValue(date))),
    enabled: () => {
      const day = toValue(date);
      return !!toValue(routeId) && !!day && day <= today;
    },
    // a trip that started yesterday can still be going past midnight
    staleTime: () => ((toValue(date) ?? today) < addDays(today, -1) ? Infinity : 60000),
    refetchInterval: () => (toValue(date) === today ? 60000 : false),
  });
  return {
    ids: computed(() => new Set((data.value?.trips ?? []).map((run) => String(run.trip)))),
    isSuccess,
  };
};

/**
 * The ids of a route's trips we recorded on an Edmonton day. Future days, or no
 * date, make no request and give an empty set.
 * @param {import('vue').MaybeRefOrGetter<string>} routeId
 * @param {import('vue').MaybeRefOrGetter<string | null | undefined>} date YYYY-MM-DD
 */
export const useRecordedTrips = (routeId, date) => useRecordedTripsQuery(routeId, date).ids;
