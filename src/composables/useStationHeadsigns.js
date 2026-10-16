import { useQuery } from "@tanstack/vue-query";
import { computed, toValue } from "vue";
import { getStopHeadsigns } from "../api";
import { mainHeadsigns, stationStops } from "../utils/stations";
import { useStops } from "./useStops";

/**
 * Where each route goes from a stop, and from the other platforms or bays of its
 * station, in one query shared by everything showing the station.
 * @param {import("vue").MaybeRefOrGetter<import("../api").BusStop>} stop
 */
export const useStationHeadsigns = (stop) => {
  const { stops } = useStops();
  // the platforms or bays sharing the stop's station, the stop included
  const platformStops = computed(() => stationStops(toValue(stop), stops.value ?? []));
  const stopIds = computed(() =>
    (platformStops.value.length ? platformStops.value.map((other) => other.stop_id) : [toValue(stop).stop_id]).sort());
  const { data: headsignRows } = useQuery({
    queryKey: computed(() => ["stop-headsigns", stopIds.value.join(",")]),
    queryFn: () => getStopHeadsigns(stopIds.value),
    staleTime: Infinity,
  });
  return {
    platformStops,
    headsignRows,
    usualHeadsigns: computed(() => mainHeadsigns(headsignRows.value ?? [])),
  };
};
