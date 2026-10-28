import { useQuery } from "@tanstack/vue-query";
import { getAllBusStops } from "../api";
import { computed } from "vue";


/**
 * Every stop, from the open data API. They're a few thousand rows, so a page that doesn't
 * always need them can hold off with `enabled`.
 * @param {{ enabled?: import("vue").MaybeRefOrGetter<boolean> }} [options]
 */
export const useStops = ({ enabled = true } = {}) => {
  const {
    data: stops,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stops"],
    queryFn: getAllBusStops,
    staleTime: Infinity,
    enabled,
  });

  return {
    stops,
    isLoading,
    error,
    keyedStops: computed(() => {
      if (!stops.value) return {};
      /** @type {Record<string, NonNullable<typeof stops.value>[number]>} */
      const stopMap = {};
      stops.value.forEach((stop) => {
        stopMap[stop.stop_id] = stop;
      });
      return stopMap;
    }),
  };
};
