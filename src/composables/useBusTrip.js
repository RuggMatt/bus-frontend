import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { getBusStopTimes, getTrip } from "../api";
import { alongRouteMetres } from "../utils/geo";
import { predictedOffsetMinutes } from "../utils/busStatus";
import { edmontonNow, scheduledSecondsNear } from "../utils/serviceTime";
import { useRoutes } from "./useRoutes";
import { useStops } from "./useStops";
import { AVERAGE_SPEED_METRES_PER_SECOND, tripPath } from "./useStopArrivals";

/**
 * The trip a bus is running, and how it is doing against the schedule at its next stop.
 *
 * @param {import("vue").Ref<import("../api").Bus | null>} bus
 */
export const useBusTrip = (bus) => {
  const tripId = computed(() => (bus.value ? String(bus.value.trip) : null));

  // same queries as the stops page, so either page warms the other's cache
  const { data: trip, isLoading, isError } = useQuery({
    queryKey: computed(() => ["trip-shape", tripId.value]),
    queryFn: () => getTrip(tripId.value),
    enabled: () => !!tripId.value,
    staleTime: Infinity,
  });

  const { data: stopTimes } = useQuery({
    queryKey: computed(() => ["trip-stop-times", tripId.value]),
    queryFn: () => getBusStopTimes(tripId.value),
    enabled: () => !!tripId.value,
    staleTime: Infinity,
  });

  const { keyedroutes } = useRoutes();
  const { keyedStops } = useStops();

  const routeLongName = computed(() =>
    trip.value ? keyedroutes.value[trip.value.route_id]?.route_long_name ?? null : null,
  );

  // the first stop past the bus along its route line, with its estimated arrival
  const nextStop = computed(() => {
    const path = tripPath(trip.value);
    if (!bus.value || !path.length || !stopTimes.value) return null;
    const busAlong = alongRouteMetres(path, [Number(bus.value.lat), Number(bus.value.long)])?.along;
    if (busAlong === undefined) return null;

    const upcoming = [...stopTimes.value]
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
      .map((stopTime) => {
        const stop = keyedStops.value[stopTime.stop_id];
        const along = stop
          ? alongRouteMetres(path, [Number(stop.stop_lat), Number(stop.stop_lon)])?.along
          : undefined;
        return { stopTime, stop, along };
      })
      .find(({ along }) => along !== undefined && along > busAlong);
    if (!upcoming?.stop) return null;

    const nowSeconds = edmontonNow().secondsSinceMidnight;
    // the bus has kept moving since its position was reported
    const reportedSeconds = edmontonNow(new Date(bus.value.timestamp * 1000)).secondsSinceMidnight;
    const arrivalSeconds = reportedSeconds + (upcoming.along - busAlong) / AVERAGE_SPEED_METRES_PER_SECOND;
    const scheduledSeconds = scheduledSecondsNear(upcoming.stopTime.arrival_time, nowSeconds);
    return {
      name: upcoming.stop.stop_name,
      scheduledTime: upcoming.stopTime.arrival_time,
      // the agency's prediction when /bus/now has one, so the card matches the map's pin
      offsetMinutes:
        predictedOffsetMinutes(bus.value) ??
        Math.round((Math.max(arrivalSeconds, nowSeconds) - scheduledSeconds) / 60),
    };
  });

  return { trip, stopTimes, isLoading, isError, routeLongName, nextStop };
};
