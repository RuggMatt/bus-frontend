import { keepPreviousData, useQueries, useQuery } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getServiceDates, getStopNextArrivals, getStopRoutes, getStopSchedule, getTrip } from "../api";
import { serviceDatesFrom } from "../utils/serviceCalendar";
import { alongRouteMetres, distanceMetres } from "../utils/geo";
import { edmontonNow, scheduledSecondsNear, scheduleWindow, secondsToTime } from "../utils/serviceTime";
import { nextArrivalByRoute, upcomingArrivals } from "../utils/nextArrival";
import { RAIL_ROUTE_TYPE } from "../utils/routes";
import { liveBusesQuery } from "./useBuses";

// how far either side of now a trip can be scheduled and still be matched to a live bus
const LIVE_WINDOW_SECONDS = 2 * 60 * 60;
// the schedule is only refetched when the window moves by this much
const WINDOW_STEP_SECONDS = 15 * 60;
// buses stay listed for this long after going by the stop
const PASSED_LIMIT_METRES = 500;
// average pace including stops, used to turn a distance into a time
export const AVERAGE_SPEED_METRES_PER_SECOND = 20 / 3.6;
const DAY_SECONDS = 24 * 60 * 60;
// trips from the previous service day can run until 30:00:00, i.e. 6 AM
const LATEST_PREVIOUS_DAY_SECONDS = 6 * 60 * 60;

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
 * @property {StopBus[]} buses Nearest first; empty for a route with no bus on the way
 * @property {import("../utils/nextArrival").NextArrival | null} nextArrival When the next bus is
 *   scheduled, for a route with no bus on the way; null when live, or nothing is scheduled in the coming week
 * @property {boolean} rail An LRT line, which isn't tracked live
 * @property {import("../utils/nextArrival").UpcomingArrival[]} upcoming An LRT line's next few
 *   scheduled arrivals, soonest first; empty for buses
 * @property {boolean} upcomingLoading Whether an LRT line's calendar is still loading
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
 * Every route serving a stop: those with buses currently on the way first, nearest
 * first, then the rest by when their next bus is scheduled.
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
    ...liveBusesQuery,
    enabled: () => !!stopId.value && isLive.value,
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

  // LRT isn't in the bus feed, and its schedule is shown on its own
  const matchedBuses = computed(() =>
    (buses.value || []).filter((bus) => {
      const entry = scheduleByTrip.value.get(String(bus.trip));
      return !!entry && entry.route_type !== RAIL_ROUTE_TYPE;
    }),
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
  const liveGroups = computed(() => {
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
        nextArrival: null,
        rail: false,
        upcoming: [],
        upcomingLoading: false,
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

  // --- routes with no bus on the way ---

  const { data: stopRoutes } = useQuery({
    // shared with the trip page
    queryKey: computed(() => ["stop-routes", stopId.value]),
    queryFn: () => getStopRoutes(stopId.value),
    enabled: () => !!stopId.value && isLive.value,
    staleTime: Infinity,
  });

  const minute = computed(() => Math.floor(now.value.secondsSinceMidnight / 60) * 60);

  /**
   * @param {() => string} fromTime
   * @param {() => boolean} [enabled]
   * @param {() => unknown[]} [keyParts] what the time depends on, beyond the stop and the date
   */
  const nextArrivalsFrom = (fromTime, enabled = () => true, keyParts = () => [fromTime()]) =>
    useQuery({
      queryKey: computed(() => ["stop-next-arrivals", stopId.value, now.value.dateString, ...keyParts()]),
      queryFn: () => getStopNextArrivals(stopId.value, fromTime()),
      enabled: () => !!stopId.value && isLive.value && enabled(),
      staleTime: Infinity,
      // keep the times on screen while the next minute loads
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === stopId.value ? previous : undefined,
    });

  const { data: todayRows } = nextArrivalsFrom(() => secondsToTime(minute.value));
  const { data: afterMidnightRows } = nextArrivalsFrom(
    () => secondsToTime(minute.value + DAY_SECONDS),
    () => minute.value < LATEST_PREVIOUS_DAY_SECONDS,
  );
  const { data: firstOfDayRows } = nextArrivalsFrom(() => "00:00:00", undefined, () => []);

  const nextArrivals = computed(() =>
    nextArrivalByRoute(
      {
        today: todayRows.value,
        afterMidnight: minute.value < LATEST_PREVIOUS_DAY_SECONDS ? afterMidnightRows.value : [],
        firstOfDay: firstOfDayRows.value,
      },
      now.value.dateString,
    ),
  );

  // the LRT countdowns tick on their own, as nothing else refreshes for a train
  const clock = ref(edmontonNow());
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let clockTimer;
  onMounted(() => {
    clockTimer = setInterval(() => {
      clock.value = edmontonNow();
    }, 30 * 1000);
  });
  onBeforeUnmount(() => clearInterval(clockTimer));

  const railEntries = computed(() => (schedule.value || []).filter((entry) => entry.route_type === RAIL_ROUTE_TYPE));

  // which of the LRT's service variants actually run today
  const railServiceIds = computed(() => [...new Set(railEntries.value.map((entry) => entry.service_id))].sort());
  const { data: railServiceDateRows, isPending: railDatesPending, isError: railDatesError } = useQuery({
    queryKey: computed(() => ["rail-service-dates", railServiceIds.value.join(",")]),
    queryFn: () => getServiceDates(railServiceIds.value),
    enabled: () => railServiceIds.value.length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  // the days in each service_id stand in when the calendar can't be loaded
  const railServiceDates = computed(() =>
    railServiceDateRows.value?.length ? serviceDatesFrom(railServiceDateRows.value) : null,
  );
  const railLoading = computed(() => railServiceIds.value.length > 0 && railDatesPending.value && !railDatesError.value);

  const upcomingByRoute = computed(() =>
    upcomingArrivals(railEntries.value, clock.value.dateString, clock.value.secondsSinceMidnight, {
      serviceDates: railServiceDates.value,
    }),
  );

  /** @type {import("vue").ComputedRef<StopRouteGroup[]>} */
  const quietGroups = computed(() => {
    const liveKeys = new Set(liveGroups.value.map((group) => group.key));
    return (stopRoutes.value || [])
      .map((route) => {
        const key = `${route.agency_name}|${route.route_id}`;
        return {
          key,
          route_id: route.route_id,
          route_long_name: route.route_long_name,
          agency_name: route.agency_name,
          buses: [],
          nextArrival: nextArrivals.value.get(key) ?? null,
          rail: route.route_type === RAIL_ROUTE_TYPE,
          upcoming: route.route_type === RAIL_ROUTE_TYPE && !railLoading.value ? upcomingByRoute.value.get(key) ?? [] : [],
          upcomingLoading: route.route_type === RAIL_ROUTE_TYPE && railLoading.value,
        };
      })
      .filter((group) => !liveKeys.has(group.key))
      // LRT lines by name, so they keep their places when switching platforms
      .sort(
        (a, b) =>
          Number(b.rail) - Number(a.rail) ||
          (a.rail && b.rail ? a.route_long_name.localeCompare(b.route_long_name) : 0) ||
          (a.upcoming[0]?.seconds ?? a.nextArrival?.seconds ?? Infinity) -
            (b.upcoming[0]?.seconds ?? b.nextArrival?.seconds ?? Infinity) ||
          a.route_id.localeCompare(b.route_id, undefined, { numeric: true }),
      );
  });

  const routeGroups = computed(() => [...liveGroups.value, ...quietGroups.value]);

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
