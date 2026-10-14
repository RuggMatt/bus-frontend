import { useQueries, useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { getAllBuses, getStopSchedule, getTrip } from "../api";
import { alongRouteMetres, distanceMetres } from "../utils/geo";
import { edmontonNow, scheduledSecondsNear, scheduleWindow } from "../utils/serviceTime";
import { nextBusRefreshDelay } from "../utils/busRefresh";

// how far either side of now a trip can be scheduled and still be matched to a live bus
const LIVE_WINDOW_SECONDS = 2 * 60 * 60;
// the schedule is only refetched when the window moves by this much
const WINDOW_STEP_SECONDS = 15 * 60;
// buses stay listed for this long after going by the stop
const PASSED_LIMIT_METRES = 500;
// average pace including stops, used to turn a distance into a time
export const AVERAGE_SPEED_METRES_PER_SECOND = 20 / 3.6;

/**
 * @typedef {Object} StopBus
 * @property {number|string} bus
 * @property {number} lat
 * @property {number} long
 * @property {number} bearing
 * @property {number} timestamp Unix epoch seconds when the position was reported
 * @property {string} scheduledTime HH:MM:SS the trip is scheduled at this stop
 * @property {string} trip_id
 * @property {[number, number][]} path The trip's route line as [lat, lon] points, empty until it loads
 * @property {string} headsign
 * @property {number} distance Metres from the stop, along the route when the route shape is known
 * @property {boolean|null} passed Whether the bus has gone by the stop; null when the route shape is unknown
 * @property {number|null} etaMinutes Estimated minutes until the bus reaches the stop
 * @property {number|null} offsetMinutes Estimated minutes behind (positive) or ahead of (negative) schedule at the stop
 */

/**
 * @typedef {Object} StopRouteGroup
 * @property {string} key Unique per agency and route
 * @property {string} route_id
 * @property {string} route_long_name
 * @property {string} agency_name
 * @property {StopBus[]} buses Nearest first
 */

/**
 * @param {import("../api").Trip | null | undefined} trip
 * @returns {[number, number][]} [lat, lon] points
 */
export const tripPath = (trip) =>
  (trip?.geometry_line?.coordinates || []).flatMap((segment) =>
    segment.map(([lon, lat]) => [lat, lon]),
  );

const byNearest = (a, b) =>
  Number(a.passed === true) - Number(b.passed === true) || a.distance - b.distance;

/**
 * The buses currently running a trip that serves a stop, grouped by route.
 *
 * @param {import("vue").Ref<import("../api").BusStop | null>} stop
 * @param {import("vue").Ref<Date | null>} at The moment to look at. Only null (now) is supported.
 */
export const useStopArrivals = (stop, at = ref(null)) => {
  const stopId = computed(() => stop.value?.stop_id ?? null);
  const isLive = computed(() => at.value === null);

  const {
    data: buses,
    dataUpdatedAt,
    isLoading: busesLoading,
    isError: busesError,
  } = useQuery({
    queryKey: ["buses-live"],
    queryFn: getAllBuses,
    enabled: () => !!stopId.value && isLive.value,
    // timed for when the backend's next snapshot should be ready
    refetchInterval: (query) => nextBusRefreshDelay(query.state.data),
  });

  const now = computed(() => edmontonNow(new Date(dataUpdatedAt.value || Date.now())));

  const windowStart = computed(
    () => Math.floor(now.value.secondsSinceMidnight / WINDOW_STEP_SECONDS) * WINDOW_STEP_SECONDS,
  );

  const {
    data: schedule,
    isLoading: scheduleLoading,
    isError: scheduleError,
  } = useQuery({
    queryKey: computed(() => ["stop-schedule", stopId.value, now.value.dateString, windowStart.value]),
    queryFn: () =>
      getStopSchedule(
        stopId.value,
        scheduleWindow(
          windowStart.value,
          LIVE_WINDOW_SECONDS,
          LIVE_WINDOW_SECONDS + WINDOW_STEP_SECONDS,
        ),
      ),
    enabled: () => !!stopId.value && isLive.value,
    staleTime: Infinity,
    // keep the list on screen while the next window loads
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === stopId.value ? previous : undefined,
  });

  const scheduleByTrip = computed(() => {
    /** @type {Map<string, import("../api").StopScheduleEntry>} */
    const map = new Map();
    for (const entry of schedule.value || []) {
      map.set(entry.trip_id, entry);
    }
    return map;
  });

  const matchedBuses = computed(() =>
    (buses.value || []).filter((bus) => scheduleByTrip.value.has(String(bus.trip))),
  );

  const tripIds = computed(() => [...new Set(matchedBuses.value.map((bus) => String(bus.trip)))]);

  const tripQueries = useQueries({
    queries: computed(() =>
      tripIds.value.map((tripId) => ({
        queryKey: ["trip-shape", tripId],
        queryFn: () => getTrip(tripId),
        staleTime: Infinity,
      })),
    ),
  });

  const pathByTrip = computed(() => {
    /** @type {Map<string, [number, number][]>} */
    const map = new Map();
    tripIds.value.forEach((tripId, index) => {
      map.set(tripId, tripPath(tripQueries.value[index]?.data));
    });
    return map;
  });

  /** @type {import("vue").ComputedRef<StopRouteGroup[]>} */
  const routeGroups = computed(() => {
    if (!stop.value) return [];
    const stopPoint = [Number(stop.value.stop_lat), Number(stop.value.stop_lon)];
    const nowSeconds = edmontonNow().secondsSinceMidnight;
    /** @type {Map<string, StopRouteGroup>} */
    const groups = new Map();

    for (const bus of matchedBuses.value) {
      const tripId = String(bus.trip);
      const entry = scheduleByTrip.value.get(tripId);
      const busPoint = [bus.lat, bus.long];
      const path = pathByTrip.value.get(tripId) || [];
      const stopAlong = alongRouteMetres(path, stopPoint);
      const busAlong = alongRouteMetres(path, busPoint);

      let distance = distanceMetres(busPoint, stopPoint);
      let passed = null;
      let etaMinutes = null;
      let offsetMinutes = null;
      if (stopAlong && busAlong) {
        const remaining = stopAlong.along - busAlong.along;
        passed = remaining < 0;
        distance = Math.abs(remaining);
        if (passed && distance > PASSED_LIMIT_METRES) continue;
        if (!passed) {
          // the bus has kept moving since its position was reported
          const reportedSeconds = edmontonNow(new Date(bus.timestamp * 1000)).secondsSinceMidnight;
          const arrivalSeconds = reportedSeconds + remaining / AVERAGE_SPEED_METRES_PER_SECOND;
          const scheduledSeconds = scheduledSecondsNear(entry.arrival_time, nowSeconds);
          etaMinutes = Math.max(0, Math.round((arrivalSeconds - nowSeconds) / 60));
          offsetMinutes = Math.round((Math.max(arrivalSeconds, nowSeconds) - scheduledSeconds) / 60);
        }
      }

      // route ids are only unique within an agency
      const key = `${entry.agency_name}|${entry.route_id}`;
      const group = groups.get(key) ?? {
        key,
        route_id: entry.route_id,
        route_long_name: entry.route_long_name,
        agency_name: entry.agency_name,
        buses: [],
      };
      group.buses.push({
        bus: bus.bus,
        lat: bus.lat,
        long: bus.long,
        bearing: bus.bearing,
        timestamp: bus.timestamp,
        scheduledTime: entry.arrival_time,
        trip_id: tripId,
        path,
        headsign: entry.trip_headsign,
        distance,
        passed,
        etaMinutes,
        offsetMinutes,
      });
      groups.set(key, group);
    }

    return [...groups.values()]
      .map((group) => ({ ...group, buses: group.buses.sort(byNearest) }))
      .sort((a, b) => byNearest(a.buses[0], b.buses[0]));
  });

  return {
    routeGroups,
    isLoading: computed(
      () =>
        busesLoading.value ||
        scheduleLoading.value ||
        tripQueries.value.some((query) => query.isLoading),
    ),
    isError: computed(() => busesError.value || scheduleError.value),
  };
};
