import { useQuery } from "@tanstack/vue-query";
import { getAllBusStops } from "../api";
import { computed } from "vue";

export const useStops = () => {
  const {
    data: stops,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stops"],
    queryFn: getAllBusStops,
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
